"""
Módulo de Gestión Cuantitativa de Riesgo, Esperanza Matemática y Criterio de Kelly.
trading_ollama - Arquitectura Cuantitativa (Fase Argon)

DOCUMENTACIÓN DE FÓRMULAS Y UNIDADES:
1. Esperanza Matemática Neta (EV_neto):
   EV_neto = (P_w * R_win_net) + ((1 - P_w) * R_loss_net)
   Donde:
   - P_w: Probabilidad de acierto (fracción en [0.0, 1.0]).
   - R_win_net: Retorno porcentual neto esperado al Take Profit (descontando comisiones de entrada,
     salida, spread por lado y slippage).
   - R_loss_net: Retorno porcentual neto esperado al Stop Loss (negativo, acumulando pérdidas y costos).
   - Unidades: porcentajes expresados en la misma escala (ej. +1.5 para +1.5%, -1.0 para -1.0%).
   - Costos transaccionales: Los costos se descuentan una única vez a través de la función
     net_return_after_costs (evitando deducciones duplicadas).

2. Criterio de Kelly (Quarter-Kelly):
   b = |R_win_net| / |R_loss_net|  (Payoff Ratio o ratio beneficio/riesgo neto)
   f* = (P_w * b - (1 - P_w)) / b = P_w - (1 - P_w) / b
   f_seguro = 0.25 * f*  (Fracción conservadora Quarter-Kelly)
   - Si EV_neto <= 0 o f* <= 0: la asignación de capital es estrictamente 0.0 (capital preservado).
   - f_seguro se acota además por un presupuesto de riesgo máximo configurable (max_risk_budget_pct).

ADVERTENCIA ESTADÍSTICA:
- No se debe inventar ni suponer una probabilidad histórica P_w sin una muestra out-of-sample representativa.
- La confianza del LLM NO representa una probabilidad estadística de acierto.
- Sin un dataset etiquetado fuera de muestra con N >= 30 trades, el Criterio de Kelly permanece
  DESACTIVADO POR DEFECTO (enabled=False), utilizándose el presupuesto fijo de riesgo como opción segura.
"""

from typing import Dict, Any, List, Optional
import math


def net_return_after_costs(gross_move_pct: float, fee_pct: float, spread_pct: float) -> float:
    """
    Calcula el retorno neto porcentual tras deducir comisiones y spread en entrada y salida.
    Fórmula de capitalización:
      entry_factor = (1 + fee/100) * (1 + spread/100)
      exit_factor = (1 - fee/100) * (1 - spread/100)
      net_pct = ((1 + gross/100) * exit_factor / entry_factor - 1) * 100
    """
    if not all(map(math.isfinite, [gross_move_pct, fee_pct, spread_pct])):
        return float("nan")
    if gross_move_pct <= -100 or fee_pct < 0 or spread_pct < 0 or fee_pct >= 100 or spread_pct >= 100:
        return float("nan")
    entry_cost_factor = (1 + fee_pct / 100) * (1 + spread_pct / 100)
    exit_proceeds_factor = (1 - fee_pct / 100) * (1 - spread_pct / 100)
    return ((1 + gross_move_pct / 100) * exit_proceeds_factor / entry_cost_factor - 1) * 100


def calculate_net_expected_value(
    win_rate: float,
    r_win_gross_pct: float,
    r_loss_gross_pct: float,
    fee_per_side_pct: float,
    spread_per_side_pct: float,
    slippage_pct: float = 0.0,
) -> Dict[str, Any]:
    """
    Calcula la esperanza matemática neta (EV_neto) deduciendo comisiones, spread y slippage.

    Parámetros:
      win_rate: P_w en escala fraccionaria [0.0, 1.0].
      r_win_gross_pct: movimiento bruto proyectado al Take Profit (ej. 2.5%).
      r_loss_gross_pct: movimiento bruto proyectado al Stop Loss (positivo, ej. 1.5%).
      fee_per_side_pct: comisión por orden del broker (ej. 0.10 para 0.10%).
      spread_per_side_pct: medio-spread por orden (ej. 0.05 para 0.05%).
      slippage_pct: deslizamiento estimado total (ej. 0.02 para 0.02%).
    """
    params = [win_rate, r_win_gross_pct, r_loss_gross_pct, fee_per_side_pct, spread_per_side_pct, slippage_pct]
    if not all(map(math.isfinite, params)):
        return {"viable": False, "ev_net_pct": float("nan"), "error": "Parámetro no finito"}

    if not (0.0 <= win_rate <= 1.0):
        return {"viable": False, "ev_net_pct": float("nan"), "error": "win_rate debe estar entre 0.0 y 1.0"}

    if r_win_gross_pct <= 0 or r_loss_gross_pct <= 0:
        return {"viable": False, "ev_net_pct": float("nan"), "error": "Los recorridos brutos deben ser positivos"}

    if fee_per_side_pct < 0 or spread_per_side_pct < 0 or slippage_pct < 0:
        return {"viable": False, "ev_net_pct": float("nan"), "error": "Costos y slippage deben ser no negativos"}

    # Retorno neto al acierto (descuenta comisiones de entrada y salida, spread y slippage)
    r_win_net = net_return_after_costs(r_win_gross_pct, fee_per_side_pct, spread_per_side_pct) - slippage_pct

    # Retorno neto al fallo (negativo, acumulando la pérdida de precio más todos los costos)
    r_loss_net = net_return_after_costs(-r_loss_gross_pct, fee_per_side_pct, spread_per_side_pct) - slippage_pct

    if not (math.isfinite(r_win_net) and math.isfinite(r_loss_net)):
        return {"viable": False, "ev_net_pct": float("nan"), "error": "Cálculo de retorno neto inválido"}

    ev_net_pct = (win_rate * r_win_net) + ((1.0 - win_rate) * r_loss_net)

    return {
        "viable": ev_net_pct > 0 and r_win_net > 0,
        "ev_net_pct": round(ev_net_pct, 6),
        "r_win_net_pct": round(r_win_net, 6),
        "r_loss_net_pct": round(r_loss_net, 6),
        "is_positive": ev_net_pct > 0,
        "payoff_ratio": round(abs(r_win_net) / abs(r_loss_net), 4) if abs(r_loss_net) > 0 else 0.0,
    }


def calculate_quarter_kelly(
    win_rate: float,
    r_win_net_pct: float,
    r_loss_net_pct: float,
    max_risk_budget_pct: float = 0.01,
) -> Dict[str, Any]:
    """
    Calcula la fracción de Quarter-Kelly f_seguro = 0.25 * ((P_w * b - (1 - P_w)) / b).
    Retorna asignación cero (0.0) si la esperanza neta no es positiva o si Kelly <= 0.
    """
    if not all(map(math.isfinite, [win_rate, r_win_net_pct, r_loss_net_pct, max_risk_budget_pct])):
        return {"viable": False, "quarter_kelly_fraction": 0.0, "allocated_risk_budget": 0.0, "reason": "Entrada no finita"}

    if not (0.0 <= win_rate <= 1.0):
        return {"viable": False, "quarter_kelly_fraction": 0.0, "allocated_risk_budget": 0.0, "reason": "win_rate fuera de [0, 1]"}

    if r_win_net_pct <= 0 or r_loss_net_pct >= 0:
        return {"viable": False, "quarter_kelly_fraction": 0.0, "allocated_risk_budget": 0.0, "reason": "Retornos netos inconsistentes"}

    abs_loss = abs(r_loss_net_pct)
    if abs_loss <= 0:
        return {"viable": False, "quarter_kelly_fraction": 0.0, "allocated_risk_budget": 0.0, "reason": "Pérdida neta nula"}

    b = r_win_net_pct / abs_loss
    if b <= 0:
        return {"viable": False, "quarter_kelly_fraction": 0.0, "allocated_risk_budget": 0.0, "reason": "Payoff ratio no positivo"}

    # Esperanza neta: si no es positiva, asignación estrictamente cero
    ev_check = (win_rate * r_win_net_pct) + ((1.0 - win_rate) * r_loss_net_pct)
    if ev_check <= 0:
        return {
            "viable": False,
            "full_kelly_fraction": 0.0,
            "quarter_kelly_fraction": 0.0,
            "allocated_risk_budget": 0.0,
            "payoff_ratio": round(b, 4),
            "reason": f"Esperanza matemática neta no es positiva ({ev_check:.4f}%)",
        }

    full_kelly = (win_rate * b - (1.0 - win_rate)) / b
    if full_kelly <= 0:
        return {
            "viable": False,
            "full_kelly_fraction": 0.0,
            "quarter_kelly_fraction": 0.0,
            "allocated_risk_budget": 0.0,
            "payoff_ratio": round(b, 4),
            "reason": "Fracción de Kelly menor o igual a cero",
        }

    quarter_kelly = 0.25 * full_kelly
    capped_budget = min(quarter_kelly, max(0.0, max_risk_budget_pct))

    return {
        "viable": True,
        "full_kelly_fraction": round(full_kelly, 6),
        "quarter_kelly_fraction": round(quarter_kelly, 6),
        "allocated_risk_budget": round(capped_budget, 6),
        "payoff_ratio": round(b, 4),
        "ev_net_pct": round(ev_check, 6),
    }


def estimate_out_of_sample_win_rate(
    trade_outcomes: List[Any],
    min_sample_size: int = 30,
    confidence_level: float = 0.95,
) -> Dict[str, Any]:
    """
    Estima la probabilidad de acierto con intervalo de confianza de Wilson (límite inferior).
    Exige una muestra mínima (N >= min_sample_size) fuera de muestra; de lo contrario declara
    la estimación como no validada y rechaza habilitar Kelly.
    """
    if not isinstance(trade_outcomes, list):
        return {"valid": False, "reason": "trade_outcomes debe ser una lista", "sample_size": 0}

    n = len(trade_outcomes)
    if n < min_sample_size:
        return {
            "valid": False,
            "sample_size": n,
            "min_required": min_sample_size,
            "p_w_point": None,
            "p_w_conservative": None,
            "reason": f"Muestra insuficiente ({n} < {min_sample_size}) para validación estadística fuera de muestra.",
        }

    # Contar aciertos (booleanos True o flotantes netos > 0)
    wins = 0
    for outcome in trade_outcomes:
        if isinstance(outcome, bool) and outcome:
            wins += 1
        elif isinstance(outcome, (int, float)) and outcome > 0:
            wins += 1

    p_hat = wins / n

    # Valor crítico z para intervalo de Wilson (95% -> z=1.96, 90% -> z=1.645)
    z = 1.96 if confidence_level >= 0.95 else 1.645
    denom = 1.0 + (z**2) / n
    center = p_hat + (z**2) / (2 * n)
    margin = z * math.sqrt((p_hat * (1.0 - p_hat) / n) + ((z**2) / (4 * (n**2))))
    p_lower = max(0.0, (center - margin) / denom)
    p_upper = min(1.0, (center + margin) / denom)

    return {
        "valid": True,
        "sample_size": n,
        "wins": wins,
        "p_w_point": round(p_hat, 4),
        "p_w_conservative": round(p_lower, 4),
        "p_w_upper": round(p_upper, 4),
        "confidence_level": confidence_level,
    }


def get_atr_strategy_risk_status() -> Dict[str, Any]:
    """
    Devuelve el estado de gobernanza del Criterio de Kelly y dimensionamiento cuantitativo.
    Kelly permanece APAGADO por defecto hasta contar con dataset walk-forward validado.
    """
    return {
        "kelly_active": False,
        "default_mode": "fixed_risk_budget",
        "fixed_risk_budget_pct": 0.0025,  # 0.25% del capital por trade
        "status": "PENDIENTE_DE_VALIDACION_OUT_OF_SAMPLE",
        "reason": (
            "No se dispone de muestra histórica etiquetada fuera de muestra suficiente (N >= 30) "
            "evaluada en walk-forward con costos reales para validar estadísticamente P_w."
        ),
        "required_validations": [
            "Dataset histórico local OHLCV de 15m/1h etiquetado sin data-snooping",
            "Muestra out-of-sample evaluada en walk-forward con N >= 30 operaciones",
            "Verificación de slippage real en libros de órdenes institucionales",
            "Límite inferior conservador de Wilson score para P_w > 0.50 neto",
        ],
    }

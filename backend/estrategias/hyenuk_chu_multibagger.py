"""
Estrategia Hyenuk Chu: Trend Following Asimétrico y Multibagger (Swing 1h).
Inspirada en las enseñanzas de Hyenuk Chu (20 años de experiencia bursátil).
Principios:
1. Seguimiento de tendencia institucional (Trend Following).
2. Alineación de estructura sobre medias móviles (SMA20 / EMA200).
3. Filtro Contrario: evitar comprar en euforia extrema o sobrecompra desmedida (RSI <= 75).
4. Gestión Asimétrica: captura de grandes movimientos con toma parcial de ganancias (Trim / "Peluqueo").
5. Stop Loss inflexible obligatorio para proteger el capital.
"""

from typing import Any, Dict, List, Optional, Set, Tuple
import pandas as pd
from backend.estrategias.base import EstrategiaBase
from backend.quant_risk import net_return_after_costs

CHU_STRATEGY_TIMEFRAMES: Set[str] = {"1h"}


class HyenukChuMultibagger(EstrategiaBase):
    id: str = "hyenuk_chu_multibagger"
    nombre: str = "Hyenuk Chu: Trend & Multibagger (1h)"
    descripcion: str = (
        "Estrategia de seguimiento de tendencia institucional (Swing en 1h) para activos de alto impulso (NVDA, TSLA, BTC). "
        "Exige alineación técnica alcista con volumen sano, aplica filtro contrario anti-euforia (RSI ≤ 75) y "
        "gestiona el capital con política de toma parcial (Trim) y Stop Loss inflexible."
    )
    autor: str = "Hyenuk Chu / Formulación Cuantitativa"
    activos_recomendados: List[str] = ["NVDA", "TSLA", "BTC/USDT", "SOL/USDT", "QQQ"]
    temporalidades_permitidas: Set[str] = CHU_STRATEGY_TIMEFRAMES
    horario_operativo: str = "Swing Trading (Vigente durante toda la tendencia)"
    parametros_por_defecto: Dict[str, Any] = {
        "timeframe": "1h",
        "first_tp_trim_pct": 3.5,    # Primer hito para recortar ('peluquear') y asegurar costo base
        "sl_pct": 1.75,               # Stop Loss técnico debajo de la estructura
        "max_rsi": 75.0,              # Filtro contrario: no comprar en euforia parabólica
        "min_rsi": 45.0,              # Impulso mínimo requerido
        "min_rvol": 0.90,             # Volumen institucional participante
    }

    def evaluar(
        self,
        ind: Dict[str, Any],
        tp: float,
        sl: float,
        fee: float,
        spread: float,
        min_profit_pct: float,
        round_trip_cost: float,
        net_tp_manual: float,
        df: Optional[Any] = None,
    ) -> Tuple[Dict[str, Any], float, bool, List[str], float]:
        latest = ind["latest"]
        current_price = float(latest["close"])
        ema_200_val = ind.get("ema_200_value")
        ema_200_slope = ind.get("ema_200_slope_pct")
        sma_20_val = float(latest["sma_20"]) if "sma_20" in latest and not pd.isna(latest["sma_20"]) else current_price
        rsi_val = float(latest["rsi"]) if "rsi" in latest and not pd.isna(latest["rsi"]) else 50.0
        rvol = ind.get("relative_volume") or 1.0

        # Parámetros de la estrategia
        first_tp = self.parametros_por_defecto.get("first_tp_trim_pct", 3.5)
        sl_calc = self.parametros_por_defecto.get("sl_pct", 1.75)
        max_rsi = self.parametros_por_defecto.get("max_rsi", 75.0)
        min_rsi = self.parametros_por_defecto.get("min_rsi", 45.0)
        min_rvol = self.parametros_por_defecto.get("min_rvol", 0.90)

        net_tp = round(net_return_after_costs(first_tp, fee, spread), 4)
        net_sl = round(net_return_after_costs(-sl_calc, fee, spread), 4)
        minimum_strategy_net_tp = max(0.50, min_profit_pct)

        filter_failures: List[str] = []

        # 1. Filtro Tendencial Institucional
        if ema_200_val is None or current_price <= ema_200_val:
            filter_failures.append("Precio no supera la EMA200 institucional (fuera de tendencia mayor)")
        if ema_200_slope is None or ema_200_slope < 0:
            filter_failures.append("La tendencia mayor EMA200 es bajista o plana (pendiente negativa)")
        if current_price < sma_20_val:
            filter_failures.append(f"El precio (${current_price:.2f}) cotiza bajo la SMA20 (${sma_20_val:.2f}) de corto plazo")

        # 2. Filtro Contrario y de Momentum (Anti-Euforia)
        if rsi_val > max_rsi:
            filter_failures.append(f"Filtro Contrario activado: RSI={rsi_val:.1f} en zona de euforia extrema (> {max_rsi}). Chu exige no comprar en techos de consenso.")
        if rsi_val < min_rsi:
            filter_failures.append(f"Falta fuerza de impulso alcista: RSI={rsi_val:.1f} < {min_rsi}")

        # 3. Filtro de Volumen Participante
        if rvol < min_rvol:
            filter_failures.append(f"Volumen anémico (RVOL={rvol:.2f} < {min_rvol}); falta interés institucional")

        # 4. Filtro de Costos y Asimetría
        if net_tp < minimum_strategy_net_tp:
            filter_failures.append(f"El hito de beneficio neto (+{net_tp:.2f}%) no cubre el mínimo exigido (+{minimum_strategy_net_tp:.2f}%)")

        candidate_eligible = len(filter_failures) == 0
        signal = "COMPRAR" if candidate_eligible else "MANTENER"
        effective_net_tp = net_tp if candidate_eligible else 0.0

        strategy_metrics = {
            "mode": self.id,
            "current_price": round(current_price, 2),
            "sma_20": round(sma_20_val, 2),
            "ema_200": round(ema_200_val, 2) if ema_200_val is not None else None,
            "ema_200_slope_pct": round(ema_200_slope, 4) if ema_200_slope is not None else None,
            "rsi": round(rsi_val, 2),
            "relative_volume": round(rvol, 2),
            "z_score": round(ind.get("z_score", 0), 4) if ind.get("z_score") is not None else None,
            "atr_14": round(ind.get("atr_14", 0), 8) if ind.get("atr_14") is not None else None,
            "lower_wick_ratio": round(ind.get("lower_wick_ratio", 0), 4) if ind.get("lower_wick_ratio") is not None else None,
            "tp_gross_pct": first_tp,
            "sl_gross_pct": sl_calc,
            "tp_net_pct": net_tp,
            "sl_net_pct": net_sl,
            "minimum_net_tp_pct": round(minimum_strategy_net_tp, 4),
            "candidate_eligible": candidate_eligible,
            "suggested_signal": signal,
            "filter_failures": filter_failures,
            "policy": "Toma de ganancia parcial (Trim) al hito de precio + Trailing libre de riesgo.",
        }

        return (
            strategy_metrics,
            effective_net_tp,
            candidate_eligible,
            filter_failures,
            minimum_strategy_net_tp,
        )

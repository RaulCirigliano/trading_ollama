"""
Registro Central y Catálogo de Estrategias de Trading.
Permite descubrir, listar y evaluar estrategias dinámicamente.
"""

from typing import Any, Dict, List, Optional, Set, Tuple
from backend.estrategias.base import EstrategiaBase
from backend.estrategias.mean_reversion_atr import MeanReversionATR
from backend.estrategias.nasdaq_araujo_vwap import NasdaqAraujoVWAP
from backend.estrategias.hyenuk_chu_multibagger import HyenukChuMultibagger

# Diccionario maestro de estrategias registradas
STRATEGY_REGISTRY: Dict[str, EstrategiaBase] = {
    MeanReversionATR.id: MeanReversionATR(),
    NasdaqAraujoVWAP.id: NasdaqAraujoVWAP(),
    HyenukChuMultibagger.id: HyenukChuMultibagger(),
}


def get_strategy(strategy_id: str) -> Optional[EstrategiaBase]:
    """Obtiene la instancia de una estrategia por su identificador."""
    return STRATEGY_REGISTRY.get(strategy_id)


def is_valid_strategy(strategy_id: str) -> bool:
    """Verifica si el id de estrategia es soportado por el motor (incluyendo 'manual')."""
    return strategy_id == "manual" or strategy_id in STRATEGY_REGISTRY


def get_supported_strategy_ids() -> Set[str]:
    """Retorna el conjunto de IDs de estrategias válidas."""
    return {"manual"} | set(STRATEGY_REGISTRY.keys())


def get_allowed_timeframes(strategy_id: str) -> Set[str]:
    """Retorna las temporalidades permitidas para una estrategia."""
    if strategy_id == "manual":
        return {"1m", "5m", "15m", "1h"}
    strat = get_strategy(strategy_id)
    if strat:
        return strat.temporalidades_permitidas
    return {"15m", "1h"}


def list_strategies() -> List[Dict[str, Any]]:
    """Lista todas las estrategias registradas para consumo de la API / UI."""
    result = [
        {
            "id": "manual",
            "nombre": "Manual / Discrecional",
            "descripcion": "Operativa manual o estándar basada en los niveles de TP/SL fijos seleccionados en el panel.",
            "autor": "Usuario / Operador",
            "activos_recomendados": ["Todos"],
            "temporalidades_permitidas": ["1m", "5m", "15m", "1h"],
            "horario_operativo": "24/7",
            "parametros_por_defecto": {},
        }
    ]
    for strat in STRATEGY_REGISTRY.values():
        result.append(strat.to_dict())
    return result


def evaluate_strategy(
    strategy_id: str,
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
    """
    Despacha la evaluación a la estrategia modular correspondiente.
    Si es 'manual', mantiene la lógica estándar intacta.
    """
    strat = get_strategy(strategy_id)
    if strat is not None:
        return strat.evaluar(
            ind=ind,
            tp=tp,
            sl=sl,
            fee=fee,
            spread=spread,
            min_profit_pct=min_profit_pct,
            round_trip_cost=round_trip_cost,
            net_tp_manual=net_tp_manual,
            df=df,
        )

    # Fallback para 'manual'
    from backend.quant_risk import net_return_after_costs

    strategy_metrics = {
        "mode": "manual",
        "z_score": round(ind["z_score"], 4) if ind.get("z_score") is not None else None,
        "z_score_threshold": -2.0,
        "ema_200": round(ind["ema_200_value"], 6) if ind.get("ema_200_value") is not None else None,
        "ema_200_slope_pct": round(ind["ema_200_slope_pct"], 6) if ind.get("ema_200_slope_pct") is not None else None,
        "atr_14": round(ind["atr_14"], 8) if ind.get("atr_14") is not None else None,
        "relative_volume": round(ind["relative_volume"], 4) if ind.get("relative_volume") is not None else None,
        "lower_wick_ratio": round(ind["lower_wick_ratio"], 4) if ind.get("lower_wick_ratio") is not None else None,
        "tp_gross_pct": tp,
        "sl_gross_pct": sl,
        "tp_net_pct": net_tp_manual,
        "sl_net_pct": round(net_return_after_costs(-sl, fee, spread), 4),
        "minimum_net_tp_pct": min_profit_pct,
        "candidate_eligible": None,
        "filter_failures": [],
    }
    return (strategy_metrics, net_tp_manual, False, [], min_profit_pct)

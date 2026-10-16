"""
Estrategia Cuantitativa: Reversión a la Media + ATR (Plan Argon).
Reglas deterministas centralizadas: Z-Score <= -2.0, EMA200 alcista, absorción, RVOL y costos cubiertos.
"""

from typing import Any, Dict, List, Optional, Set, Tuple
from backend.estrategias.base import EstrategiaBase
from backend.quant_risk import net_return_after_costs

ATR_STRATEGY_TIMEFRAMES: Set[str] = {"15m", "1h"}
ATR_Z_SCORE_THRESHOLD: float = -2.0
ATR_LOWER_WICK_RATIO_MIN: float = 0.25
ATR_RELATIVE_VOLUME_MAX: float = 3.5
ATR_TP_ATR_MULTIPLIER: float = 2.5
ATR_SL_ATR_MULTIPLIER: float = 1.5
ATR_COST_COVERAGE_MULTIPLIER: float = 3.5
ATR_MIN_NET_TP_PCT: float = 0.5


class MeanReversionATR(EstrategiaBase):
    id: str = "mean_reversion_atr"
    nombre: str = "Reversión a la Media + ATR"
    descripcion: str = (
        "Estrategia estadística basada en sobreventa extrema (Z-Score ≤ -2.0) a favor de la tendencia EMA200, "
        "con absorción en mecha inferior y cobertura estricta de costos con múltiplos ATR."
    )
    autor: str = "Plan Argon / Cuantitativo"
    activos_recomendados: List[str] = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "SPY", "QQQ"]
    temporalidades_permitidas: Set[str] = ATR_STRATEGY_TIMEFRAMES
    horario_operativo: str = "24/7 (Mercados Cripto y Horario Bursátil)"
    parametros_por_defecto: Dict[str, Any] = {
        "z_score_threshold": ATR_Z_SCORE_THRESHOLD,
        "tp_multiplier": ATR_TP_ATR_MULTIPLIER,
        "sl_multiplier": ATR_SL_ATR_MULTIPLIER,
        "cost_coverage_multiplier": ATR_COST_COVERAGE_MULTIPLIER,
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
        atr_14 = ind["atr_14"]
        z_score = ind["z_score"]
        ema_200_value = ind["ema_200_value"]
        ema_200_slope_pct = ind["ema_200_slope_pct"]
        lower_wick_ratio = ind["lower_wick_ratio"]
        relative_volume = ind["relative_volume"]

        if atr_14 is None or atr_14 <= 0:
            tp_gross_pct = None
            sl_gross_pct = None
            strategy_net_tp = None
            strategy_net_sl = None
        else:
            tp_gross_pct = (ATR_TP_ATR_MULTIPLIER * atr_14 / float(latest["close"])) * 100
            sl_gross_pct = (ATR_SL_ATR_MULTIPLIER * atr_14 / float(latest["close"])) * 100
            strategy_net_tp = round(net_return_after_costs(tp_gross_pct, fee, spread), 4)
            strategy_net_sl = round(net_return_after_costs(-sl_gross_pct, fee, spread), 4)

        minimum_strategy_net_tp = max(ATR_MIN_NET_TP_PCT, min_profit_pct)
        quant_filter_failures: List[str] = []

        if z_score is None or z_score > ATR_Z_SCORE_THRESHOLD:
            quant_filter_failures.append(
                f"Z-Score no alcanza sobreventa extrema (≤ {ATR_Z_SCORE_THRESHOLD})"
            )
        if ema_200_value is None or float(latest["close"]) <= ema_200_value:
            quant_filter_failures.append("Precio no está por encima de EMA200")
        if ema_200_slope_pct is None or ema_200_slope_pct < 0:
            quant_filter_failures.append("Pendiente EMA200 no es positiva")
        if lower_wick_ratio is None or lower_wick_ratio < ATR_LOWER_WICK_RATIO_MIN:
            quant_filter_failures.append(
                f"Mecha inferior de absorción menor a {ATR_LOWER_WICK_RATIO_MIN}"
            )
        if relative_volume is None or relative_volume > ATR_RELATIVE_VOLUME_MAX:
            quant_filter_failures.append(
                f"Volumen relativo inválido o extremo (> {ATR_RELATIVE_VOLUME_MAX})"
            )
        if tp_gross_pct is None or tp_gross_pct < round_trip_cost * ATR_COST_COVERAGE_MULTIPLIER:
            quant_filter_failures.append(
                f"Recorrido bruto al TP no cubre {ATR_COST_COVERAGE_MULTIPLIER}x los costos ida/vuelta"
            )
        if strategy_net_tp is None or strategy_net_tp < minimum_strategy_net_tp:
            quant_filter_failures.append(
                f"TP neto no alcanza el mínimo de {minimum_strategy_net_tp:.3f}%"
            )

        quant_candidate_eligible = not quant_filter_failures
        effective_net_tp = strategy_net_tp if strategy_net_tp is not None else 0.0

        strategy_metrics = {
            "mode": self.id,
            "z_score": round(z_score, 4) if z_score is not None else None,
            "z_score_threshold": ATR_Z_SCORE_THRESHOLD,
            "ema_200": round(ema_200_value, 6) if ema_200_value is not None else None,
            "ema_200_slope_pct": round(ema_200_slope_pct, 6) if ema_200_slope_pct is not None else None,
            "atr_14": round(atr_14, 8) if atr_14 is not None else None,
            "relative_volume": round(relative_volume, 4) if relative_volume is not None else None,
            "lower_wick_ratio": round(lower_wick_ratio, 4) if lower_wick_ratio is not None else None,
            "tp_gross_pct": round(tp_gross_pct, 6) if tp_gross_pct is not None else None,
            "sl_gross_pct": round(sl_gross_pct, 6) if sl_gross_pct is not None else None,
            "tp_net_pct": strategy_net_tp,
            "sl_net_pct": strategy_net_sl,
            "minimum_net_tp_pct": round(minimum_strategy_net_tp, 4),
            "candidate_eligible": quant_candidate_eligible,
            "filter_failures": quant_filter_failures,
        }

        return (
            strategy_metrics,
            effective_net_tp,
            quant_candidate_eligible,
            quant_filter_failures,
            minimum_strategy_net_tp,
        )

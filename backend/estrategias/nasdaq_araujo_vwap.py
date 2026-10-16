"""
Estrategia Nasdaq Araujo (VWAP + M15 + Sesión Londres).
Basada en la metodología operativa de Franklin Araujo para Nasdaq (NQ, MNQ, QQQ).
Reglas:
1. Temporalidad M15.
2. Posición del precio respecto al VWAP diario institucional.
3. Posicionamiento respecto al rango de la sesión europea (Londres).
4. Gatillo por quiebre de extremos recientes (Soporte / Resistencia en M15).
5. Stop Loss inmediato y estricto; máximo 1 operación por día.
"""

from typing import Any, Dict, List, Optional, Set, Tuple
import pandas as pd
from backend.estrategias.base import EstrategiaBase
from backend.quant_risk import net_return_after_costs

ARAUJO_STRATEGY_TIMEFRAMES: Set[str] = {"15m"}


class NasdaqAraujoVWAP(EstrategiaBase):
    id: str = "nasdaq_araujo_vwap"
    nombre: str = "Nasdaq Araujo (VWAP + M15)"
    descripcion: str = (
        "Estrategia objetiva para Nasdaq (NQ/MNQ/QQQ) en velas de 15m. Confluye la dirección del VWAP diario "
        "y el rango de la sesión de Londres con el quiebre de los extremos recientes de M15 al abrir Nueva York. "
        "Aplica Stop Loss estricto y regla de disciplina de 1 solo trade al día."
    )
    autor: str = "Franklin Araujo / Transcripción Cuantitativa"
    activos_recomendados: List[str] = ["QQQ", "NQ=F", "MNQ", "SPY"]
    temporalidades_permitidas: Set[str] = ARAUJO_STRATEGY_TIMEFRAMES
    horario_operativo: str = "09:25 - 11:30 NY (Campana de Apertura Americana)"
    parametros_por_defecto: Dict[str, Any] = {
        "timeframe": "15m",
        "lookback_extremes": 8,  # Últimas 8 velas de 15m (2 horas) para trazar niveles recientes
        "tp_pct": 2.0,           # Target base o dinámico
        "sl_pct": 1.0,           # Stop loss base detrás del nivel
        "max_trades_per_day": 1,
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
        previous = ind.get("previous", latest)
        current_price = float(latest["close"])
        vwap_val = float(latest["vwap"]) if "vwap" in latest and not pd.isna(latest["vwap"]) else current_price

        # Extremos recientes en M15 (últimas velas previas a la actual)
        lookback = self.parametros_por_defecto.get("lookback_extremes", 8)
        
        if df is not None and isinstance(df, pd.DataFrame) and len(df) >= lookback + 1:
            slice_prev = df.iloc[-(lookback + 1):-1]
            m15_high = float(slice_prev["high"].max())
            m15_low = float(slice_prev["low"].min())
            
            # Estimación del rango de sesión previa / Londres (últimas 16 a 24 velas si no hay zona horaria explícita)
            london_slice = df.iloc[-min(len(df), 24):-min(len(df), lookback)]
            if len(london_slice) > 0:
                london_high = float(london_slice["high"].max())
                london_low = float(london_slice["low"].min())
            else:
                london_high = m15_high
                london_low = m15_low
        else:
            # Fallback seguro con vela previa
            m15_high = float(previous.get("high", current_price * 1.01))
            m15_low = float(previous.get("low", current_price * 0.99))
            london_high = m15_high
            london_low = m15_low

        # Stop loss y Take Profit técnicos
        sl_calc_pct = max(0.5, round(abs(current_price - m15_low) / current_price * 100, 2)) if current_price > vwap_val else max(0.5, round(abs(m15_high - current_price) / current_price * 100, 2))
        tp_calc_pct = max(1.5, round(sl_calc_pct * 1.5, 2))

        net_tp = round(net_return_after_costs(tp_calc_pct, fee, spread), 4)
        net_sl = round(net_return_after_costs(-sl_calc_pct, fee, spread), 4)
        minimum_strategy_net_tp = max(0.40, min_profit_pct)

        filter_failures: List[str] = []
        bias = "NEUTRAL"
        signal = "MANTENER"

        # Evaluación de Confluencia
        above_vwap = current_price >= vwap_val
        below_vwap = current_price <= vwap_val
        above_london = current_price >= london_high
        below_london = current_price <= london_low
        breaking_high = current_price >= m15_high or float(latest.get("high", current_price)) > m15_high
        breaking_low = current_price <= m15_low or float(latest.get("low", current_price)) < m15_low

        # 1. Escenario de Compra (Largos)
        if above_vwap and above_london:
            bias = "ALCISTA (BULLISH)"
            if breaking_high:
                signal = "COMPRAR"
            else:
                filter_failures.append(f"Sesión alcista sobre VWAP ({vwap_val:.2f}) y Londres ({london_high:.2f}), pero aún no quiebra resistencia M15 ({m15_high:.2f})")
        # 2. Escenario de Venta (Cortos)
        elif below_vwap and below_london:
            bias = "BAJISTA (BEARISH)"
            if breaking_low:
                signal = "VENDER"
            else:
                filter_failures.append(f"Sesión bajista bajo VWAP ({vwap_val:.2f}) y Londres ({london_low:.2f}), pero aún no quiebra soporte M15 ({m15_low:.2f})")
        else:
            if not above_vwap and not below_vwap:
                filter_failures.append("Precio exactamente en el VWAP sin direccionalidad")
            else:
                filter_failures.append(
                    f"Falta confluencia institucional: Precio ({current_price:.2f}) entre VWAP ({vwap_val:.2f}) y Rango Londres [{london_low:.2f} - {london_high:.2f}]"
                )

        if net_tp < minimum_strategy_net_tp:
            filter_failures.append(f"El TP neto estimado ({net_tp:.2f}%) no cubre el beneficio mínimo exigido ({minimum_strategy_net_tp:.2f}%)")

        candidate_eligible = (signal in {"COMPRAR", "VENDER"}) and (len(filter_failures) == 0)
        effective_net_tp = net_tp if candidate_eligible else 0.0

        strategy_metrics = {
            "mode": self.id,
            "bias": bias,
            "vwap": round(vwap_val, 2),
            "m15_high": round(m15_high, 2),
            "m15_low": round(m15_low, 2),
            "london_high": round(london_high, 2),
            "london_low": round(london_low, 2),
            "above_vwap": above_vwap,
            "above_london": above_london,
            "below_london": below_london,
            "breaking_extreme": breaking_high or breaking_low,
            "z_score": round(ind["z_score"], 4) if ind.get("z_score") is not None else None,
            "ema_200": round(ind["ema_200_value"], 6) if ind.get("ema_200_value") is not None else None,
            "atr_14": round(ind["atr_14"], 8) if ind.get("atr_14") is not None else None,
            "relative_volume": round(ind["relative_volume"], 4) if ind.get("relative_volume") is not None else None,
            "lower_wick_ratio": round(ind["lower_wick_ratio"], 4) if ind.get("lower_wick_ratio") is not None else None,
            "tp_gross_pct": tp_calc_pct,
            "sl_gross_pct": sl_calc_pct,
            "tp_net_pct": net_tp,
            "sl_net_pct": net_sl,
            "minimum_net_tp_pct": round(minimum_strategy_net_tp, 4),
            "candidate_eligible": candidate_eligible,
            "suggested_signal": signal if candidate_eligible else "MANTENER",
            "filter_failures": filter_failures,
            "daily_trade_rule": "1 trade/día máximo",
        }

        return (
            strategy_metrics,
            effective_net_tp,
            candidate_eligible,
            filter_failures,
            minimum_strategy_net_tp,
        )

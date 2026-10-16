"""
Módulo de Estrategias Cuantitativas y Modulares para Trading Ollama.
"""

from backend.estrategias.base import EstrategiaBase
from backend.estrategias.registry import (
    STRATEGY_REGISTRY,
    get_strategy,
    list_strategies,
    is_valid_strategy,
    get_supported_strategy_ids,
    get_allowed_timeframes,
    evaluate_strategy,
)
from backend.estrategias.mean_reversion_atr import (
    MeanReversionATR,
    ATR_STRATEGY_TIMEFRAMES,
    ATR_Z_SCORE_THRESHOLD,
    ATR_LOWER_WICK_RATIO_MIN,
    ATR_RELATIVE_VOLUME_MAX,
    ATR_TP_ATR_MULTIPLIER,
    ATR_SL_ATR_MULTIPLIER,
    ATR_COST_COVERAGE_MULTIPLIER,
    ATR_MIN_NET_TP_PCT,
)
from backend.estrategias.nasdaq_araujo_vwap import (
    NasdaqAraujoVWAP,
    ARAUJO_STRATEGY_TIMEFRAMES,
)
from backend.estrategias.hyenuk_chu_multibagger import (
    HyenukChuMultibagger,
    CHU_STRATEGY_TIMEFRAMES,
)

__all__ = [
    "EstrategiaBase",
    "STRATEGY_REGISTRY",
    "get_strategy",
    "list_strategies",
    "is_valid_strategy",
    "get_supported_strategy_ids",
    "get_allowed_timeframes",
    "evaluate_strategy",
    "MeanReversionATR",
    "NasdaqAraujoVWAP",
    "HyenukChuMultibagger",
    "ATR_STRATEGY_TIMEFRAMES",
    "ATR_Z_SCORE_THRESHOLD",
    "ATR_LOWER_WICK_RATIO_MIN",
    "ATR_RELATIVE_VOLUME_MAX",
    "ATR_TP_ATR_MULTIPLIER",
    "ATR_SL_ATR_MULTIPLIER",
    "ATR_COST_COVERAGE_MULTIPLIER",
    "ATR_MIN_NET_TP_PCT",
    "ARAUJO_STRATEGY_TIMEFRAMES",
    "CHU_STRATEGY_TIMEFRAMES",
]

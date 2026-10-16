"""
Pruebas Unitarias y de Integración para el Catálogo Modular de Estrategias y Nasdaq Araujo.
"""

import time
import math
import pytest
from fastapi.testclient import TestClient
from backend import main
from backend.estrategias import (
    STRATEGY_REGISTRY,
    get_strategy,
    list_strategies,
    is_valid_strategy,
    get_allowed_timeframes,
    NasdaqAraujoVWAP,
)


def _generate_araujo_candles(now_ms: int, mode: str = "bullish_breakout"):
    """
    Genera una serie temporal de 15m para probar la estrategia Araujo.
    mode: 'bullish_breakout', 'bearish_breakout', 'neutral'
    """
    candles = []
    # 220 velas de 15m para superar MIN_ANALYSIS_CLOSED_CANDLES (205)
    for i in range(220):
        t = now_ms - (219 - i) * 15 * 60_000
        # Rango base 18000 a 18100
        base = 18000.0 + (i * 1.5)
        high = base + 15.0
        low = base - 10.0
        open_ = base
        close = base + 5.0
        volume = 1000.0 + i * 10
        candles.append([t, open_, high, low, close, volume])

    closed_candle = candles[-2]
    prev_slice = candles[-10:-2]
    m15_high = max(c[2] for c in prev_slice)
    m15_low = min(c[3] for c in prev_slice)

    if mode == "bullish_breakout":
        # Vela cerrada quiebra por encima del máximo con precio sobre VWAP
        breakout_price = m15_high + 25.0
        closed_candle[1] = m15_high + 5.0    # open
        closed_candle[2] = breakout_price + 5.0 # high
        closed_candle[3] = m15_high          # low
        closed_candle[4] = breakout_price    # close
    elif mode == "bearish_breakout":
        breakout_price = m15_low - 25.0
        closed_candle[1] = m15_low - 5.0
        closed_candle[2] = m15_low
        closed_candle[3] = breakout_price - 5.0
        closed_candle[4] = breakout_price
    elif mode == "neutral":
        # Dentro del rango de Londres sin romper extremos
        mid_price = (m15_high + m15_low) / 2.0
        closed_candle[1] = mid_price
        closed_candle[2] = m15_high - 5.0
        closed_candle[3] = m15_low + 5.0
        closed_candle[4] = mid_price

    return candles


def test_list_strategies_endpoint():
    client = TestClient(main.app)
    response = client.get("/api/strategies")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    ids = {s["id"] for s in data}
    assert "manual" in ids
    assert "mean_reversion_atr" in ids
    assert "nasdaq_araujo_vwap" in ids

    # Alias /api/estrategias
    res_es = client.get("/api/estrategias")
    assert res_es.status_code == 200
    assert len(res_es.json()) == len(data)


def test_araujo_strategy_timeframe_restriction():
    client = TestClient(main.app)
    # 1m y 5m deben ser rechazados con HTTP 422 para la estrategia Araujo
    res_1m = client.get(
        "/api/market/analysis?symbol=QQQ&timeframe=1m&engine=local&strategy=nasdaq_araujo_vwap"
    )
    assert res_1m.status_code == 422
    assert "solo admite temporalidades ['15m']" in res_1m.json()["detail"]

    res_5m = client.get(
        "/api/market/analysis?symbol=QQQ&timeframe=5m&engine=local&strategy=nasdaq_araujo_vwap"
    )
    assert res_5m.status_code == 422
    assert "solo admite temporalidades ['15m']" in res_5m.json()["detail"]


def test_araujo_bullish_breakout_signal(monkeypatch):
    now_ms = int(time.time() * 1000)
    candles = _generate_araujo_candles(now_ms, mode="bullish_breakout")
    monkeypatch.setattr(main, "get_ohlcv", lambda *args: candles)

    client = TestClient(main.app)
    response = client.get(
        "/api/market/analysis?symbol=QQQ&timeframe=15m&engine=local&strategy=nasdaq_araujo_vwap"
    )
    assert response.status_code == 200
    res = response.json()
    assert res["strategy"] == "nasdaq_araujo_vwap"
    assert res["signal"] == "COMPRAR"
    assert res["strategy_metrics"]["candidate_eligible"] is True
    assert "Gatillo cuantitativo Araujo" in res["reason"]


def test_araujo_neutral_zone_signal(monkeypatch):
    now_ms = int(time.time() * 1000)
    candles = _generate_araujo_candles(now_ms, mode="neutral")
    monkeypatch.setattr(main, "get_ohlcv", lambda *args: candles)

    client = TestClient(main.app)
    response = client.get(
        "/api/market/analysis?symbol=QQQ&timeframe=15m&engine=local&strategy=nasdaq_araujo_vwap"
    )
    assert response.status_code == 200
    res = response.json()
    assert res["strategy"] == "nasdaq_araujo_vwap"
    assert res["signal"] == "MANTENER"
    assert res["strategy_metrics"]["candidate_eligible"] is False
    assert len(res["strategy_metrics"]["filter_failures"]) > 0


def _generate_chu_candles(now_ms: int, rsi_high: bool = False):
    """Genera serie de 220 velas de 1h con tendencia alcista sólida y saludable sobre EMA200."""
    import math
    candles = []
    for i in range(220):
        t = now_ms - (219 - i) * 3600_000
        base = 100.0 + (i * 0.3) + math.sin(i) * 1.0
        high = base + 2.0
        low = base - 1.0
        open_ = base - 0.2
        close = base
        vol = 500.0 + i * 5
        candles.append([t, open_, high, low, close, vol])

    closed_candle = candles[-2]
    if rsi_high:
        # Picos extremos continuos para disparar sobrecompra RSI > 75
        for j in range(-15, 0):
            candles[j][1:5] = [200.0 + j * 5, 205.0 + j * 5, 199.0 + j * 5, 204.0 + j * 5]
    else:
        # Asegurar vela de cierre alcista sobre SMA20 y EMA200
        prev_sma20 = sum(c[4] for c in candles[-22:-2]) / 20.0
        closed_candle[1:5] = [prev_sma20 + 0.5, prev_sma20 + 3.0, prev_sma20 + 0.2, prev_sma20 + 2.5]
    return candles


def test_hyenuk_chu_timeframe_restriction():
    client = TestClient(main.app)
    # 15m rechazado con HTTP 422 para la estrategia Chu (solo 1h)
    res_15m = client.get(
        "/api/market/analysis?symbol=NVDA&timeframe=15m&engine=local&strategy=hyenuk_chu_multibagger"
    )
    assert res_15m.status_code == 422
    assert "solo admite temporalidades ['1h']" in res_15m.json()["detail"]


def test_hyenuk_chu_trend_signal(monkeypatch):
    now_ms = int(time.time() * 1000)
    candles = _generate_chu_candles(now_ms, rsi_high=False)
    monkeypatch.setattr(main, "get_ohlcv", lambda *args: candles)

    client = TestClient(main.app)
    response = client.get(
        "/api/market/analysis?symbol=NVDA&timeframe=1h&engine=local&strategy=hyenuk_chu_multibagger"
    )
    assert response.status_code == 200
    res = response.json()
    assert res["strategy"] == "hyenuk_chu_multibagger"
    assert res["signal"] == "COMPRAR"
    assert res["strategy_metrics"]["candidate_eligible"] is True
    assert "Gatillo cuantitativo Chu Trend" in res["reason"]


def test_hyenuk_chu_contrarian_filter(monkeypatch):
    now_ms = int(time.time() * 1000)
    candles = _generate_chu_candles(now_ms, rsi_high=True)
    monkeypatch.setattr(main, "get_ohlcv", lambda *args: candles)

    client = TestClient(main.app)
    response = client.get(
        "/api/market/analysis?symbol=NVDA&timeframe=1h&engine=local&strategy=hyenuk_chu_multibagger"
    )
    assert response.status_code == 200
    res = response.json()
    assert res["strategy"] == "hyenuk_chu_multibagger"
    assert res["signal"] == "MANTENER"
    assert res["strategy_metrics"]["candidate_eligible"] is False
    assert any("Filtro Contrario" in f for f in res["strategy_metrics"]["filter_failures"])

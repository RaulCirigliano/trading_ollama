import math
import time
from backend import main


def test_get_history_includes_vwap_bands(monkeypatch):
    now_ms = int(time.time() * 1000)
    candles = [
        [now_ms - (29 - i) * 3_600_000, 100.0 + i, 102.0 + i, 99.0 + i, 101.0 + i, 50.0 + i]
        for i in range(30)
    ]
    monkeypatch.setattr(main, "get_ohlcv", lambda symbol, timeframe, limit: candles)

    data = main.get_history(symbol="BTC/USDT", timeframe="1h", limit=30)

    assert isinstance(data, list)
    assert len(data) == 30
    assert any("vwap_upper" in row for row in data)
    assert any("vwap_lower" in row for row in data)
    assert "last_candle_age_s" in data[-1]

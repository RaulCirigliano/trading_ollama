import math
import time
from backend import main


def test_get_history_returns_only_finite_numbers(monkeypatch):
    now_ms = int(time.time() * 1000)
    candles = [
        [now_ms - (19 - i) * 60_000, 100.0 + i * 0.5, 101.0 + i * 0.5, 99.0 + i * 0.5, 100.2 + i * 0.5, 25.0 + i]
        for i in range(20)
    ]
    monkeypatch.setattr(main, "get_ohlcv", lambda symbol, timeframe, limit: candles)

    data = main.get_history(symbol="BTC/USDT", timeframe="1m", limit=20)

    assert isinstance(data, list)
    assert len(data) == 20
    for row in data:
        for key, value in row.items():
            if isinstance(value, float):
                assert math.isfinite(value), f"Valor no finito en {key}: {value}"

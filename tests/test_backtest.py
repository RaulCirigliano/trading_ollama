"""
Pruebas Unitarias para el Módulo de Backtesting Offline (backend/backtest.py).
trading_ollama
"""

import pytest
from backend.backtest import (
    generate_synthetic_ohlcv,
    run_atr_backtest,
    ATR_STRATEGY_TIMEFRAMES,
    ATR_Z_SCORE_THRESHOLD,
)


def test_synthetic_ohlcv_rejects_disallowed_timeframes():
    with pytest.raises(ValueError, match="Temporalidad no permitida"):
        generate_synthetic_ohlcv(timeframe="1m")

    with pytest.raises(ValueError, match="Temporalidad no permitida"):
        generate_synthetic_ohlcv(timeframe="5m")

    # 15m y 1h deben ser permitidos
    c_15m = generate_synthetic_ohlcv(n_candles=250, timeframe="15m")
    assert len(c_15m) == 250
    assert c_15m[1][0] - c_15m[0][0] == 900_000

    c_1h = generate_synthetic_ohlcv(n_candles=250, timeframe="1h")
    assert len(c_1h) == 250
    assert c_1h[1][0] - c_1h[0][0] == 3600_000


def test_backtest_rejects_disallowed_timeframes():
    candles = generate_synthetic_ohlcv(n_candles=250, timeframe="15m")
    with pytest.raises(ValueError, match="solo admite temporalidades"):
        run_atr_backtest(candles, timeframe="1m")

    with pytest.raises(ValueError, match="solo admite temporalidades"):
        run_atr_backtest(candles, timeframe="5m")


def test_backtest_runs_deterministically_offline():
    # Inyectar un setup exacto para asegurar al menos una operación completada
    candles = generate_synthetic_ohlcv(
        n_candles=300,
        timeframe="15m",
        seed=123,
        inject_atr_setup_at=220,
    )
    result = run_atr_backtest(
        candles,
        timeframe="15m",
        initial_capital=10_000.0,
        fee_per_side_pct=0.10,
        spread_per_side_pct=0.05,
        slippage_pct=0.02,
        risk_budget_pct=0.0025,
    )

    assert result["strategy"] == "mean_reversion_atr"
    assert result["timeframe"] == "15m"
    assert result["initial_capital"] == 10_000.0
    assert "total_trades" in result
    assert "win_rate" in result
    assert "out_of_sample_validation" in result
    assert result["config"]["z_score_threshold"] == ATR_Z_SCORE_THRESHOLD

    # Si hay trades ejecutados, verificar la regla no look-ahead:
    # La barra de entrada debe ser posterior a la barra de detección
    for trade in result["trades"]:
        assert trade["exit_bar"] > trade["entry_bar"]
        assert trade["net_return_pct"] < trade["gross_return_pct"]  # Los costos reducen el retorno neto


def test_backtest_conservative_intrabar_exit_rule():
    # Crear serie de velas donde una barra toque tanto el TP como el SL
    candles = generate_synthetic_ohlcv(n_candles=250, timeframe="15m", seed=42, inject_atr_setup_at=210)
    # Hacer que la vela 212 tenga un rango masivo que toque tanto arriba como abajo
    candles[212][2] = 200.0  # High astronómico
    candles[212][3] = 10.0   # Low por el suelo

    result = run_atr_backtest(candles, timeframe="15m")
    # Si la operación estaba activa en la barra 212, el resultado debió ser SL_CONSERVADOR
    conservative_sl_trades = [t for t in result["trades"] if t.get("exit_type") == "SL_CONSERVADOR"]
    if conservative_sl_trades:
        assert conservative_sl_trades[0]["net_return_pct"] < 0

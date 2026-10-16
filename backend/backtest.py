"""
Módulo de Backtesting Offline Reproducible para Estrategia Mean Reversion ATR (Argon).
trading_ollama - Arquitectura Cuantitativa

Características Clave:
1. Sin descargas externas ni dependencias de red (100% offline y reproducible).
2. Estricta restricción de temporalidad: solo admite '15m' o '1h'.
3. Sin sesgo de anticipación (No Look-Ahead Bias):
   - Los indicadores se calculan exclusivamente sobre velas cerradas hasta la barra i.
   - Las órdenes de entrada generadas en la barra i se ejecutan en la apertura (Open) de la barra i+1.
4. Modelado realista de costos:
   - Descuento de comisiones por orden (ida y vuelta).
   - Descuento de spread estimado (ida y vuelta).
   - Deslizamiento (slippage) por orden.
5. Gestión de riesgo:
   - Dimensionamiento por presupuesto de riesgo (Risk Budgeting).
   - Supuesto conservador intrabarra: si en una misma vela se tocan tanto TP como SL, se liquida por Stop Loss.
6. Integración con validación estadística de quant_risk (Wilson score lower bound).
"""

from typing import List, Dict, Any, Optional, Union
import math
import numpy as np
import pandas as pd
import ta

from backend.quant_risk import net_return_after_costs, estimate_out_of_sample_win_rate

ATR_STRATEGY_TIMEFRAMES = {"15m", "1h"}
ATR_Z_SCORE_THRESHOLD = -2.0
ATR_LOWER_WICK_RATIO_MIN = 0.25
ATR_RELATIVE_VOLUME_MAX = 3.5
ATR_TP_ATR_MULTIPLIER = 2.5
ATR_SL_ATR_MULTIPLIER = 1.5
ATR_COST_COVERAGE_MULTIPLIER = 3.5
ATR_MIN_NET_TP_PCT = 0.5
MIN_WARMUP_CANDLES = 205


def generate_synthetic_ohlcv(
    n_candles: int = 350,
    timeframe: str = "15m",
    initial_price: float = 100.0,
    seed: int = 42,
    inject_atr_setup_at: Optional[int] = None,
) -> List[List[float]]:
    """
    Genera un conjunto sintético y determinista de velas OHLCV para pruebas offline.
    Formato: [[timestamp_ms, open, high, low, close, volume], ...]
    """
    if timeframe not in ATR_STRATEGY_TIMEFRAMES:
        raise ValueError(f"Temporalidad no permitida para ATR: {timeframe}. Debe ser '15m' o '1h'.")
    if n_candles < MIN_WARMUP_CANDLES:
        raise ValueError(f"n_candles debe ser al menos {MIN_WARMUP_CANDLES} para calentar indicadores.")

    rng = np.random.RandomState(seed)
    tf_seconds = 900 if timeframe == "15m" else 3600
    base_ts_ms = 1_700_000_000_000  # Timestamp determinista fijo

    candles: List[List[float]] = []
    current_price = initial_price

    # Generar trayectoria de tendencia alcista moderada (para mantener EMA200 alcista)
    for i in range(n_candles):
        drift = 0.08  # Deriva alcista constante
        vol = rng.normal(0.0, 0.4)
        close_price = max(10.0, current_price + drift + vol)
        open_price = current_price
        high_price = max(open_price, close_price) + abs(rng.normal(0.2, 0.1))
        low_price = min(open_price, close_price) - abs(rng.normal(0.2, 0.1))
        volume = float(rng.uniform(80.0, 120.0))

        ts_ms = base_ts_ms + (i * tf_seconds * 1000)
        candles.append([
            float(ts_ms),
            round(open_price, 4),
            round(high_price, 4),
            round(low_price, 4),
            round(close_price, 4),
            round(volume, 2),
        ])
        current_price = close_price

    # Opcional: inyectar un setup exacto de mean_reversion_atr en un índice específico
    if inject_atr_setup_at is not None and MIN_WARMUP_CANDLES <= inject_atr_setup_at < n_candles - 5:
        idx = inject_atr_setup_at
        # Reducir el precio bruscamente para forzar Z-score <= -2.0 manteniéndose sobre EMA200
        prior_close = candles[idx - 1][4]
        # Creamos una vela con caída pronunciada pero absorción en la mecha inferior
        drop_close = prior_close * 0.965
        drop_open = prior_close * 0.975
        drop_low = drop_close - (prior_close * 0.02)  # Gran mecha inferior
        drop_high = drop_open + (prior_close * 0.002)

        candles[idx][1] = round(drop_open, 4)
        candles[idx][2] = round(drop_high, 4)
        candles[idx][3] = round(drop_low, 4)
        candles[idx][4] = round(drop_close, 4)
        candles[idx][5] = 130.0  # Volumen normal (RVOL <= 3.5)

    return candles


def run_atr_backtest(
    candles: Union[List[List[float]], pd.DataFrame],
    timeframe: str = "15m",
    initial_capital: float = 10_000.0,
    fee_per_side_pct: float = 0.10,
    spread_per_side_pct: float = 0.05,
    slippage_pct: float = 0.02,
    risk_budget_pct: float = 0.0025,  # 0.25% del capital por trade
    max_allocation_pct: float = 0.20,  # 20% máximo del capital asignado
    min_net_profit_pct: float = 0.50,
) -> Dict[str, Any]:
    """
    Ejecuta una simulación histórica determinista de la estrategia mean_reversion_atr.
    """
    if timeframe not in ATR_STRATEGY_TIMEFRAMES:
        raise ValueError(
            f"La estrategia 'mean_reversion_atr' solo admite temporalidades {sorted(list(ATR_STRATEGY_TIMEFRAMES))}. Recibido: '{timeframe}'."
        )

    if isinstance(candles, list):
        df = pd.DataFrame(candles, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
    elif isinstance(candles, pd.DataFrame):
        df = candles.copy()
    else:
        raise TypeError("candles debe ser una lista de listas o un DataFrame de pandas")

    if len(df) < MIN_WARMUP_CANDLES:
        raise ValueError(f"Se requieren al menos {MIN_WARMUP_CANDLES} velas cerradas para el calentamiento.")

    # 1. Cálculo Vectorizado de Indicadores Deterministas
    df['rsi'] = ta.momentum.RSIIndicator(close=df['close'], window=14).rsi()
    df['ema_200'] = df['close'].ewm(span=200, adjust=False, min_periods=200).mean()
    df['atr_14'] = ta.volatility.AverageTrueRange(
        high=df['high'], low=df['low'], close=df['close'], window=14
    ).average_true_range()

    # Z-Score con ventana de 20 períodos
    rolling_mean_20 = df['close'].rolling(window=20).mean()
    rolling_std_20 = df['close'].rolling(window=20).std(ddof=0)
    df['z_score'] = (df['close'] - rolling_mean_20) / rolling_std_20

    # Volumen relativo vs media de 20 períodos previos
    df['vol_mean_20'] = df['volume'].shift(1).rolling(window=20).mean()
    df['relative_volume'] = df['volume'] / df['vol_mean_20']

    # Mecha inferior (lower wick)
    candle_range = df['high'] - df['low']
    min_body = df[['open', 'close']].min(axis=1)
    df['lower_wick_ratio'] = np.where(candle_range > 0, (min_body - df['low']) / candle_range, 0.0)

    # Pendiente EMA200 a 5 velas
    df['ema_200_slope_pct'] = (df['ema_200'] - df['ema_200'].shift(5)) / df['ema_200'].shift(5) * 100.0

    round_trip_cost = round((fee_per_side_pct * 2.0) + (spread_per_side_pct * 2.0), 4)
    min_required_net_tp = max(ATR_MIN_NET_TP_PCT, min_net_profit_pct)

    capital = float(initial_capital)
    peak_capital = capital
    max_drawdown_pct = 0.0

    in_position = False
    entry_price = 0.0
    entry_bar_idx = 0
    trade_size_capital = 0.0
    units_bought = 0.0
    tp_price = 0.0
    sl_price = 0.0
    target_net_tp_pct = 0.0
    target_net_sl_pct = 0.0

    completed_trades: List[Dict[str, Any]] = []

    # 2. Bucle de Simulación Barra a Barra (Garantía No Look-Ahead Bias)
    # Comenzamos en MIN_WARMUP_CANDLES para asegurar indicadores estables
    for i in range(MIN_WARMUP_CANDLES, len(df) - 1):
        # Actualizar Drawdown
        if capital > peak_capital:
            peak_capital = capital
        current_dd = ((peak_capital - capital) / peak_capital) * 100.0 if peak_capital > 0 else 0.0
        if current_dd > max_drawdown_pct:
            max_drawdown_pct = current_dd

        row = df.iloc[i]
        next_open = float(df.iloc[i + 1]['open'])
        next_high = float(df.iloc[i + 1]['high'])
        next_low = float(df.iloc[i + 1]['low'])
        next_ts = int(df.iloc[i + 1]['timestamp'])

        if in_position:
            # Evaluar salida en la barra i+1
            # Supuesto conservador: si el rango contiene ambos niveles, el Stop Loss se ejecuta primero
            hit_tp = next_high >= tp_price
            hit_sl = next_low <= sl_price

            exit_triggered = False
            exit_type = ""
            raw_exit_price = 0.0

            if hit_sl and hit_tp:
                # Caso extremo de volatilidad intrabarra: asumir SL por preservación de capital
                exit_triggered = True
                exit_type = "SL_CONSERVADOR"
                raw_exit_price = sl_price
            elif hit_sl:
                exit_triggered = True
                exit_type = "SL"
                raw_exit_price = sl_price
            elif hit_tp:
                exit_triggered = True
                exit_type = "TP"
                raw_exit_price = tp_price

            if exit_triggered:
                # Aplicar slippage en la salida (precio de salida real penalizado por slippage)
                actual_exit_price = raw_exit_price * (1.0 - (slippage_pct / 100.0))
                gross_return_pct = ((actual_exit_price - entry_price) / entry_price) * 100.0
                net_return_pct = net_return_after_costs(gross_return_pct, fee_per_side_pct, spread_per_side_pct)

                pnl_dollars = trade_size_capital * (net_return_pct / 100.0)
                capital += pnl_dollars

                completed_trades.append({
                    "entry_bar": entry_bar_idx,
                    "exit_bar": i + 1,
                    "entry_ts": int(df.iloc[entry_bar_idx]['timestamp']),
                    "exit_ts": next_ts,
                    "entry_price": round(entry_price, 4),
                    "exit_price": round(actual_exit_price, 4),
                    "exit_type": exit_type,
                    "gross_return_pct": round(gross_return_pct, 4),
                    "net_return_pct": round(net_return_pct, 4),
                    "pnl_dollars": round(pnl_dollars, 4),
                    "capital_after": round(capital, 4),
                })

                in_position = False
                continue

        # Si no hay posición activa, evaluar si la vela cerrada 'i' genera una señal de compra
        if not in_position:
            z = row['z_score']
            ema = row['ema_200']
            slope = row['ema_200_slope_pct']
            close = float(row['close'])
            wick = row['lower_wick_ratio']
            rvol = row['relative_volume']
            atr = row['atr_14']

            if pd.isna(z) or pd.isna(ema) or pd.isna(slope) or pd.isna(atr) or atr <= 0:
                continue

            # Verificación de filtros cuantitativos deterministas
            if z > ATR_Z_SCORE_THRESHOLD:
                continue
            if close <= ema:
                continue
            if slope < 0:
                continue
            if wick < ATR_LOWER_WICK_RATIO_MIN:
                continue
            if pd.isna(rvol) or rvol > ATR_RELATIVE_VOLUME_MAX:
                continue

            tp_gross_pct = (ATR_TP_ATR_MULTIPLIER * atr / close) * 100.0
            sl_gross_pct = (ATR_SL_ATR_MULTIPLIER * atr / close) * 100.0

            if tp_gross_pct < round_trip_cost * ATR_COST_COVERAGE_MULTIPLIER:
                continue

            projected_net_tp = net_return_after_costs(tp_gross_pct, fee_per_side_pct, spread_per_side_pct)
            projected_net_sl = net_return_after_costs(-sl_gross_pct, fee_per_side_pct, spread_per_side_pct)

            if projected_net_tp < min_required_net_tp:
                continue

            # SEÑAL VÁLIDA: Entrada en la apertura de la siguiente vela (i+1) con penalización por slippage
            actual_entry_price = next_open * (1.0 + (slippage_pct / 100.0))
            tp_price = actual_entry_price * (1.0 + (tp_gross_pct / 100.0))
            sl_price = actual_entry_price * (1.0 - (sl_gross_pct / 100.0))

            # Dimensionamiento del capital según presupuesto de riesgo
            loss_pct_magnitude = abs(projected_net_sl) / 100.0
            if loss_pct_magnitude > 0:
                risk_sized_capital = (capital * risk_budget_pct) / loss_pct_magnitude
            else:
                risk_sized_capital = capital * max_allocation_pct

            trade_size_capital = min(risk_sized_capital, capital * max_allocation_pct, capital)
            if trade_size_capital <= 0:
                continue

            entry_price = actual_entry_price
            entry_bar_idx = i + 1
            target_net_tp_pct = projected_net_tp
            target_net_sl_pct = projected_net_sl
            in_position = True

    # 3. Resumen y Métricas Cuantitativas
    total_trades = len(completed_trades)
    winning_trades = sum(1 for t in completed_trades if t['net_return_pct'] > 0)
    losing_trades = sum(1 for t in completed_trades if t['net_return_pct'] <= 0)
    win_rate = winning_trades / total_trades if total_trades > 0 else 0.0

    total_net_pnl = capital - initial_capital
    total_return_pct = (total_net_pnl / initial_capital) * 100.0

    gross_gains = sum(t['pnl_dollars'] for t in completed_trades if t['pnl_dollars'] > 0)
    gross_losses = abs(sum(t['pnl_dollars'] for t in completed_trades if t['pnl_dollars'] < 0))
    profit_factor = (gross_gains / gross_losses) if gross_losses > 0 else (float("inf") if gross_gains > 0 else 0.0)

    # Evaluación Out-of-Sample usando Wilson score
    trade_returns = [t['net_return_pct'] for t in completed_trades]
    stat_eval = estimate_out_of_sample_win_rate(trade_returns, min_sample_size=30)

    return {
        "strategy": "mean_reversion_atr",
        "timeframe": timeframe,
        "initial_capital": initial_capital,
        "final_capital": round(capital, 4),
        "total_net_pnl": round(total_net_pnl, 4),
        "total_return_pct": round(total_return_pct, 4),
        "max_drawdown_pct": round(max_drawdown_pct, 4),
        "total_trades": total_trades,
        "winning_trades": winning_trades,
        "losing_trades": losing_trades,
        "win_rate": round(win_rate, 4),
        "profit_factor": round(profit_factor, 4) if math.isfinite(profit_factor) else None,
        "out_of_sample_validation": stat_eval,
        "trades": completed_trades,
        "config": {
            "fee_per_side_pct": fee_per_side_pct,
            "spread_per_side_pct": spread_per_side_pct,
            "slippage_pct": slippage_pct,
            "risk_budget_pct": risk_budget_pct,
            "max_allocation_pct": max_allocation_pct,
            "z_score_threshold": ATR_Z_SCORE_THRESHOLD,
        },
    }

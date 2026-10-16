"""
Pruebas Unitarias para quant_risk.py (Argon Quantitative Risk Management).
trading_ollama
"""

import math
import pytest
from backend.quant_risk import (
    net_return_after_costs,
    calculate_net_expected_value,
    calculate_quarter_kelly,
    estimate_out_of_sample_win_rate,
    get_atr_strategy_risk_status,
)


def test_net_return_after_costs_deducts_fees_and_spread():
    # Con 3% de subida bruta, 0.1% de comisión y 0.05% de spread
    net = net_return_after_costs(3.0, 0.1, 0.05)
    assert 2.6 < net < 2.8

    # Si el costo aumenta, el neto debe disminuir
    higher_cost_net = net_return_after_costs(3.0, 0.5, 0.05)
    assert higher_cost_net < net

    # En una pérdida bruta del -2%, el neto debe ser más negativo por los costos acumulados
    loss_net = net_return_after_costs(-2.0, 0.1, 0.05)
    assert loss_net < -2.0

    # Valores no finitos o absurdos retornan NaN
    assert math.isnan(net_return_after_costs(float("nan"), 0.1, 0.05))
    assert math.isnan(net_return_after_costs(3.0, -0.1, 0.05))
    assert math.isnan(net_return_after_costs(-150.0, 0.1, 0.05))


def test_calculate_net_expected_value_positive_and_negative():
    # Caso viable: P_w = 0.60, R_win = 2.5%, R_loss = 1.5%, fee = 0.1%, spread = 0.05%
    res_viable = calculate_net_expected_value(
        win_rate=0.60,
        r_win_gross_pct=2.5,
        r_loss_gross_pct=1.5,
        fee_per_side_pct=0.10,
        spread_per_side_pct=0.05,
        slippage_pct=0.02,
    )
    assert res_viable["viable"] is True
    assert res_viable["ev_net_pct"] > 0
    assert res_viable["r_win_net_pct"] > 0
    assert res_viable["r_loss_net_pct"] < 0
    assert res_viable["payoff_ratio"] > 1.0

    # Caso no viable (costos excesivos o bajo win rate): P_w = 0.30
    res_unviable = calculate_net_expected_value(
        win_rate=0.30,
        r_win_gross_pct=2.5,
        r_loss_gross_pct=1.5,
        fee_per_side_pct=0.10,
        spread_per_side_pct=0.05,
    )
    assert res_unviable["viable"] is False
    assert res_unviable["ev_net_pct"] < 0


def test_calculate_quarter_kelly_strictly_protects_capital():
    # 1. Esperanza neta negativa -> asignación CERO estricta
    res_neg_ev = calculate_quarter_kelly(
        win_rate=0.40,
        r_win_net_pct=1.0,
        r_loss_net_pct=-2.0,
        max_risk_budget_pct=0.01,
    )
    assert res_neg_ev["viable"] is False
    assert res_neg_ev["quarter_kelly_fraction"] == 0.0
    assert res_neg_ev["allocated_risk_budget"] == 0.0

    # 2. Esperanza positiva con payoff ratio 2:1 y 60% win rate
    # b = 2.0 / 1.0 = 2.0. Full Kelly = (0.6 * 2 - 0.4) / 2 = 0.8 / 2 = 0.40
    # Quarter Kelly = 0.25 * 0.40 = 0.10 (10%).
    # Si max_risk_budget_pct = 0.01 (1%), debe quedar acotado a 0.01.
    res_pos = calculate_quarter_kelly(
        win_rate=0.60,
        r_win_net_pct=2.0,
        r_loss_net_pct=-1.0,
        max_risk_budget_pct=0.01,
    )
    assert res_pos["viable"] is True
    assert round(res_pos["full_kelly_fraction"], 2) == 0.40
    assert round(res_pos["quarter_kelly_fraction"], 3) == 0.100
    assert res_pos["allocated_risk_budget"] == 0.01

    # 3. Datos corruptos o inconsistentes (r_loss positivo o win_rate > 1)
    res_invalid = calculate_quarter_kelly(
        win_rate=1.5,
        r_win_net_pct=2.0,
        r_loss_net_pct=-1.0,
    )
    assert res_invalid["viable"] is False
    assert res_invalid["allocated_risk_budget"] == 0.0


def test_estimate_out_of_sample_win_rate_enforces_sample_size():
    # Menos de 30 operaciones: rechaza validación out-of-sample
    small_sample = [True] * 15 + [False] * 5
    res_small = estimate_out_of_sample_win_rate(small_sample, min_sample_size=30)
    assert res_small["valid"] is False
    assert res_small["sample_size"] == 20
    assert "insuficiente" in res_small["reason"].lower()

    # Muestra suficiente: 40 operaciones con 28 aciertos (70%)
    large_sample = [1.5] * 28 + [-1.0] * 12
    res_large = estimate_out_of_sample_win_rate(large_sample, min_sample_size=30)
    assert res_large["valid"] is True
    assert res_large["sample_size"] == 40
    assert res_large["p_w_point"] == 0.70
    # El límite inferior conservador de Wilson debe ser menor a p_w_point pero mayor a 0.50
    assert 0.50 < res_large["p_w_conservative"] < 0.70
    assert res_large["p_w_upper"] > 0.70


def test_atr_strategy_risk_status_defaults():
    status = get_atr_strategy_risk_status()
    assert status["kelly_active"] is False
    assert status["default_mode"] == "fixed_risk_budget"
    assert status["fixed_risk_budget_pct"] == 0.0025
    assert status["status"] == "PENDIENTE_DE_VALIDACION_OUT_OF_SAMPLE"
    assert len(status["required_validations"]) >= 4

from datetime import datetime, timedelta, timezone
import json
import math
from types import SimpleNamespace
import time
from typing import get_type_hints
import sys
import importlib.util

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend import main, premarket_digest, radar_inbox


@pytest.fixture(autouse=True)
def clear_optional_api_token(monkeypatch):
    monkeypatch.delenv("APP_SECRET_TOKEN", raising=False)
    monkeypatch.delenv("APP_TOKEN", raising=False)


def test_premarket_annotations_resolve():
    assert "cancel_event" in get_type_hints(premarket_digest.run_premarket_digest)


def test_system_models_returns_real_names_and_caches_them(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"models": [{"name": "qwen2.5:3b"}, {"name": "deepseek-r1:8b"}, {"name": "../invalid"}]}

    monkeypatch.setattr(main.requests, "get", lambda *args, **kwargs: FakeResponse())
    response = TestClient(main.app).get("/api/system/models")

    assert response.status_code == 200
    assert response.json()["available"] is True
    assert response.json()["models"] == ["deepseek-r1:8b", "qwen2.5:3b"]


def test_system_models_degrades_gracefully_when_ollama_is_offline(monkeypatch):
    monkeypatch.setattr(main, "_OLLAMA_MODELS_CACHE", ["qwen2.5:3b"])
    monkeypatch.setattr(main, "_OLLAMA_MODELS_CACHE_TS", 123.0)

    def fail_request(*args, **kwargs):
        raise main.requests.ConnectionError("offline")

    monkeypatch.setattr(main.requests, "get", fail_request)
    response = TestClient(main.app).get("/api/system/models")

    assert response.status_code == 200
    assert response.json() == {
        "available": False,
        "models": ["qwen2.5:3b"],
        "cached_at": 123.0,
        "error": "Ollama no está disponible; se conserva la última lista conocida.",
    }


def test_system_brain_post_persists_valid_selection(monkeypatch, tmp_path):
    state_path = tmp_path / "backend-config" / "brain_state.json"
    monkeypatch.setattr(main, "BRAIN_STATE_PATH", str(state_path))
    response = TestClient(main.app).post(
        "/api/system/brain",
        json={"engine": "ollama", "model": "deepseek-r1:8b"},
    )

    assert response.status_code == 200
    assert response.json() == {"engine": "ollama", "model": "deepseek-r1:8b"}
    assert json.loads(state_path.read_text(encoding="utf-8")) == response.json()
    assert TestClient(main.app).get("/api/system/brain").json() == response.json()


def test_system_brain_rejects_invalid_selection():
    response = TestClient(main.app).post(
        "/api/system/brain",
        json={"engine": "ollama", "model": "../untrusted"},
    )

    assert response.status_code == 422


def test_system_brain_cors_allows_monitor_origin():
    response = TestClient(main.app).options(
        "/api/system/brain",
        headers={
            "Origin": "http://127.0.0.1:8520",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:8520"


def test_current_macro_promotes_timezone_aware_monitor_card(monkeypatch):
    card = SimpleNamespace(
        id="card-1",
        activo="SPY",
        impacto="POSITIVO",
        confianza=95,
        timestamp=datetime.now(timezone.utc).isoformat(),
        justificacion="Señal validada",
        titular="Titular",
    )

    class FakeInbox:
        def get_active_cards(self, hours_ttl):
            return [card]

    monkeypatch.setattr(radar_inbox, "RadarInbox", FakeInbox)
    monkeypatch.setattr(main, "INJECTED_MACRO", {"timestamp": None})

    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    result = main.get_current_injected_macro(request, None)

    assert result["asset"] == "SPY"
    assert result["source"] == "Monitor del Mercado (Auto)"
    assert result["text"] == "Señal validada"


def test_newer_manual_macro_wins_over_older_monitor_card(monkeypatch):
    now = datetime.now(timezone.utc)
    older_card = SimpleNamespace(
        id="old-card",
        activo="SPY",
        impacto="POSITIVO",
        confianza=95,
        timestamp=(now - timedelta(hours=1)).isoformat(),
        justificacion="Tesis anterior",
        titular="Titular anterior",
    )

    class FakeInbox:
        def get_active_cards(self, hours_ttl):
            return [older_card]

    monkeypatch.setattr(radar_inbox, "RadarInbox", FakeInbox)
    manual = {
        "id": "manual",
        "asset": "BTC/USDT",
        "text": "Tesis manual reciente",
        "timestamp": now.isoformat(),
    }
    monkeypatch.setattr(main, "INJECTED_MACRO", manual)
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))

    result = main.get_current_injected_macro(request, None)

    assert result["id"] == "manual"


def test_radar_inbox_keeps_recent_timezone_aware_cards(tmp_path):
    inbox = radar_inbox.RadarInbox(str(tmp_path / "radar.json"))
    card = radar_inbox.OpportunityCard(
        id="aware-card",
        timestamp=(datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(),
        activo="SPY",
        titular="Alerta reciente",
        impacto="POSITIVO",
        confianza=90,
        justificacion="Prueba aislada",
    )

    inbox.add_card(card)

    assert [active.id for active in inbox.get_active_cards()] == ["aware-card"]


def test_invalid_macro_confidence_returns_422_without_persisting():
    response = TestClient(main.app).post(
        "/api/macro/inject",
        json={"asset": "SPY", "text": "Alerta", "confidence": "no-es-numero"},
    )

    assert response.status_code == 422


def test_invalid_macro_timestamp_returns_400():
    response = TestClient(main.app).post(
        "/api/macro/inject",
        json={"asset": "SPY", "text": "Alerta", "timestamp": "ayer a las 10"},
    )

    assert response.status_code == 400


def test_macro_injection_accepts_valid_utc_payload(monkeypatch):
    saved = []

    class FakeInbox:
        def add_card(self, card):
            saved.append(card)

    monkeypatch.setattr(radar_inbox, "RadarInbox", FakeInbox)
    response = TestClient(main.app).post(
        "/api/macro/inject",
        json={
            "asset": "spy",
            "text": "Tesis de prueba",
            "confidence": 88,
            "timestamp": "2026-10-14T12:00:00Z",
        },
    )

    assert response.status_code == 200
    assert response.json()["data"]["asset"] == "SPY"
    assert response.json()["data"]["timestamp"] == "2026-10-14T12:00:00+00:00"
    assert saved[0].timestamp == "2026-10-14T12:00:00+00:00"


def test_macro_injection_rejects_non_local_client_without_token(monkeypatch):
    request = SimpleNamespace(client=SimpleNamespace(host="192.0.2.10"))
    payload = main.MacroInjectionRequest(asset="SPY", text="Tesis")

    with pytest.raises(HTTPException) as error:
        main.inject_macro_from_monitor(payload, request)

    assert error.value.status_code == 403


def test_macro_radar_requires_and_accepts_configured_token(monkeypatch):
    monkeypatch.setenv("APP_SECRET_TOKEN", "test-token")

    class EmptyInbox:
        def get_active_cards(self, hours_ttl):
            return []

    monkeypatch.setattr(radar_inbox, "RadarInbox", EmptyInbox)
    client = TestClient(main.app)

    assert client.get("/api/macro/radar?source=monitor").status_code == 401
    response = client.get(
        "/api/macro/radar?source=monitor",
        headers={"X-API-Token": "test-token"},
    )

    assert response.status_code == 200


def test_macro_radar_does_not_infer_when_rss_has_no_valid_titles(monkeypatch):
    def fail_request(*args, **kwargs):
        raise main.requests.ConnectionError("offline")

    monkeypatch.setattr(main.requests, "get", fail_request)
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))

    result = main.get_macro_radar(request, engine="gemini", source="native", x_api_token=None)

    assert result[0]["asset"] == "NO_DATA"
    assert "no se generó una conclusión" in result[0]["reason"]


def test_macro_radar_normalizes_gemini_object_response_to_list(monkeypatch):
    class FakeLLM:
        def invoke(self, prompt):
            return SimpleNamespace(
                content='{"asset":"SPY","type":"Oportunidad","confidence":87,"reason":"Tesis de prueba"}'
            )

    class FakeInbox:
        def add_cards(self, cards):
            self.cards = cards

        def get_active_cards(self, hours_ttl):
            return []

    class FakeFeedParser:
        @staticmethod
        def parse(content):
            return SimpleNamespace(entries=[SimpleNamespace(title="Titular de prueba")])

    monkeypatch.setenv("GEMINI_API_KEY", "test-key-not-real")
    monkeypatch.setattr(main.requests, "get", lambda *args, **kwargs: SimpleNamespace(status_code=200, content=b"rss"))
    monkeypatch.setattr(radar_inbox, "RadarInbox", FakeInbox)
    monkeypatch.setitem(sys.modules, "feedparser", FakeFeedParser)
    monkeypatch.setitem(
        sys.modules,
        "langchain_google_genai",
        SimpleNamespace(ChatGoogleGenerativeAI=lambda **kwargs: FakeLLM()),
    )
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))

    result = main.get_macro_radar(request, engine="gemini", source="hybrid", x_api_token=None)

    assert isinstance(result, list)
    assert result[0]["asset"] == "SPY"
    assert result[0]["confidence"] == 87


def test_market_history_malformed_data_returns_gateway_error(monkeypatch):
    monkeypatch.setattr(main, "get_ohlcv", lambda *args: [[1, 2]])

    response = TestClient(main.app).get("/api/market/history?symbol=BTC/USDT")

    assert response.status_code == 502


def test_external_ohlcv_nan_is_rejected_before_caching(monkeypatch):
    monkeypatch.setattr(
        main,
        "_fetch_raw_ohlcv",
        lambda *args: [[int(time.time() * 1000), 10, 11, 9, float("nan"), 1]],
    )

    response = TestClient(main.app).get(
        "/api/market/history?symbol=ETH/USDT&timeframe=1m"
    )

    assert response.status_code == 502
    assert "no finita" in response.json()["detail"]


def test_ohlcv_validation_sorts_and_deduplicates_identical_timestamps():
    candles = [
        [120_000, 11, 13, 10, 12, 5],
        [60_000, 10, 12, 9, 11, 4],
        [60_000, 10, 12, 9, 11, 4],
    ]

    normalized = main._validate_ohlcv_data(candles, "BTC/USDT")

    assert [candle[0] for candle in normalized] == [60_000, 120_000]


def test_ohlcv_validation_rejects_conflicting_duplicate_timestamps():
    candles = [
        [60_000, 10, 12, 9, 11, 4],
        [60_000, 10, 13, 9, 12, 5],
    ]

    with pytest.raises(ValueError, match="contradictorias"):
        main._validate_ohlcv_data(candles, "BTC/USDT")


def test_closed_ohlcv_data_excludes_in_progress_candle():
    candles = [
        [60_000, 10, 12, 9, 11, 4],
        [120_000, 11, 13, 10, 12, 5],
    ]

    closed = main._closed_ohlcv_data(candles, "BTC/USDT", "1m", now_ms=121_000)

    assert [candle[0] for candle in closed] == [60_000]


def test_continuous_crypto_ohlcv_rejects_missing_intervals():
    candles = [
        [60_000, 10, 12, 9, 11, 4],
        [180_000, 11, 13, 10, 12, 5],
    ]

    with pytest.raises(ValueError, match="Hueco OHLCV"):
        main._validate_ohlcv_continuity(candles, "BTC/USDT", "1m")


def test_equity_ohlcv_allows_expected_market_session_gaps():
    candles = [
        [60_000, 10, 12, 9, 11, 4],
        [86_460_000, 11, 13, 10, 12, 5],
    ]

    main._validate_ohlcv_continuity(candles, "SPY", "1m")


def test_external_non_finite_price_is_rejected(monkeypatch):
    monkeypatch.setattr(
        main.exchange,
        "fetch_ticker",
        lambda symbol: {"last": float("nan"), "timestamp": int(time.time() * 1000)},
    )

    response = TestClient(main.app).get("/api/market/price?symbol=ETH/USDT")

    assert response.status_code == 502
    assert "precio o timestamp inválido" in response.json()["detail"]


def test_market_analysis_returns_signal_from_mocked_market_data(monkeypatch):
    now_ms = int(time.time() * 1000)
    candles = []
    for index in range(300):
        close = 100 + index * 0.05 + math.sin(index / 4) * 2
        candles.append([
            now_ms - (299 - index) * 60_000,
            close,
            close + 1,
            close - 1,
            close,
            100 + index,
        ])
    monkeypatch.setattr(main, "get_ohlcv", lambda *args: candles)

    response = TestClient(main.app).get(
        "/api/market/analysis?symbol=BTC/USDT&timeframe=1m&engine=local"
    )

    assert response.status_code == 200
    assert response.json()["signal"] in {"COMPRAR", "VENDER", "MANTENER"}
    assert response.json()["indicators"]["current_price"] is not None
    fee_info = response.json()["fee_info"]
    assert fee_info["round_trip_spread"] == 0.1
    assert fee_info["round_trip_cost"] == 0.3
    assert fee_info["net_tp"] == pytest.approx(main.net_return_after_costs(3, 0.1, 0.05), abs=0.0001)


def test_market_analysis_uses_closed_candles_and_actual_lower_wick(monkeypatch):
    now_ms = int(time.time() * 1000)
    current_candle_open_ms = now_ms // 60_000 * 60_000
    candles = []
    for index in range(300):
        close = 100 + index * 0.05 + math.sin(index / 4) * 2
        candles.append([
            current_candle_open_ms - (299 - index) * 60_000,
            close,
            close + 1,
            close - 1,
            close,
            100 + index,
        ])

    closed_candle = candles[-2]
    closed_candle[1:5] = [100, 110, 90, 104]
    open_candle = candles[-1]
    open_candle[1:5] = [104, 10_001, 103, 10_000]
    fetch_calls = []

    def fake_get_ohlcv(*args):
        fetch_calls.append(args)
        return candles

    monkeypatch.setattr(main, "get_ohlcv", fake_get_ohlcv)
    response = TestClient(main.app).get(
        "/api/market/analysis?symbol=BTC/USDT&timeframe=1m&engine=local"
    )

    assert response.status_code == 200
    result = response.json()
    assert fetch_calls[0][2] == main.ANALYSIS_OHLCV_LIMIT
    assert result["signal_candle_ts"] == (current_candle_open_ms - 60_000) // 1000
    assert result["latest_candle"]["close"] == 104
    assert result["indicators"]["current_price"] == 104
    assert result["indicators"]["lower_wick_ratio"] == pytest.approx(0.5)
    assert result["indicators"]["ema_200"] is not None
    assert result["indicators"]["ema_200_slope_pct"] is not None


def test_market_analysis_rejects_insufficient_closed_candle_history(monkeypatch):
    now_ms = int(time.time() * 1000)
    candles = [
        [now_ms - (99 - index) * 60_000, 100, 101, 99, 100, 10]
        for index in range(100)
    ]
    monkeypatch.setattr(main, "get_ohlcv", lambda *args: candles)

    response = TestClient(main.app).get(
        "/api/market/analysis?symbol=BTC/USDT&timeframe=1m&engine=local"
    )

    assert response.status_code == 200
    result = response.json()
    assert result["signal"] == "MANTENER"
    assert "al menos 205" in result["reason"]


def _quant_strategy_candles(now_ms, extreme_volume=200, timeframe="15m"):
    step_ms = main.TIMEFRAME_SECONDS.get(timeframe, 900) * 1000
    current_candle_open_ms = now_ms // step_ms * step_ms
    candles = []
    for index in range(300):
        close = 100 + index * 0.1
        candles.append([
            current_candle_open_ms - (299 - index) * step_ms,
            close,
            close + 0.5,
            close - 0.5,
            close,
            100,
        ])
    candles[-2][1:5] = [129.8, 130.0, 126.0, 127.2]
    candles[-2][5] = extreme_volume
    candles[-1][1:5] = [127.2, 130.0, 126.0, 129.0]
    return candles


def test_atr_strategy_generates_candidate_from_deterministic_filters(monkeypatch):
    candles = _quant_strategy_candles(int(time.time() * 1000), timeframe="15m")
    monkeypatch.setattr(main, "get_ohlcv", lambda *args: candles)
    response = TestClient(main.app).get(
        "/api/market/analysis?symbol=BTC/USDT&timeframe=15m&engine=local&strategy=mean_reversion_atr"
    )

    assert response.status_code == 200
    result = response.json()
    assert result["strategy"] == "mean_reversion_atr"
    assert result["signal"] == "COMPRAR"
    assert result["strategy_metrics"]["candidate_eligible"] is True
    assert result["strategy_metrics"]["z_score"] <= -2
    assert result["strategy_metrics"]["lower_wick_ratio"] >= 0.25
    assert result["strategy_metrics"]["relative_volume"] <= 3.5
    assert result["strategy_metrics"]["tp_gross_pct"] >= result["fee_info"]["round_trip_cost"] * 3.5
    assert result["strategy_metrics"]["tp_net_pct"] >= 0.5


def test_atr_strategy_rejects_extreme_volume_deterministically(monkeypatch):
    candles = _quant_strategy_candles(int(time.time() * 1000), extreme_volume=500, timeframe="15m")
    monkeypatch.setattr(main, "get_ohlcv", lambda *args: candles)
    monkeypatch.setattr(
        main.requests,
        "post",
        lambda *args, **kwargs: pytest.fail("IA no debe llamarse cuando Python rechaza la candidata"),
    )
    response = TestClient(main.app).get(
        "/api/market/analysis?symbol=BTC/USDT&timeframe=15m&engine=qwen&strategy=mean_reversion_atr"
    )

    assert response.status_code == 200
    result = response.json()
    assert result["signal"] == "MANTENER"
    assert result["strategy_metrics"]["candidate_eligible"] is False
    assert any("Volumen relativo" in failure for failure in result["strategy_metrics"]["filter_failures"])


def test_selected_ai_can_veto_but_not_create_atr_candidate(monkeypatch):
    candles = _quant_strategy_candles(int(time.time() * 1000), timeframe="15m")
    monkeypatch.setattr(main, "get_ohlcv", lambda *args: candles)
    captured_payloads = []

    class FakeResponse:
        status_code = 200

        def __init__(self, response):
            self.response = response

        def json(self):
            return {"response": self.response}

    def fake_post(url, json, timeout):
        captured_payloads.append(json)
        return FakeResponse('{"signal":"MANTENER","reason":"veto contextual"}')

    monkeypatch.setattr(main.requests, "post", fake_post)
    response = TestClient(main.app).get(
        "/api/market/analysis?symbol=BTC/USDT&timeframe=15m&engine=qwen&strategy=mean_reversion_atr"
    )

    assert response.status_code == 200
    result = response.json()
    assert result["strategy_metrics"]["candidate_eligible"] is True
    assert result["signal"] == "MANTENER"
    assert "MODO AUDITOR CUANTITATIVO" in captured_payloads[0]["prompt"]
    assert captured_payloads[0].get("options", {}).get("temperature") == 0.0


def test_atr_strategy_rejects_1m_and_5m_timeframes_with_422(monkeypatch):
    def unexpected_call(*args, **kwargs):
        raise AssertionError("No se debe consultar mercado ni invocar LLMs para temporalidades rechazadas")

    monkeypatch.setattr(main, "get_ohlcv", unexpected_call)
    monkeypatch.setattr(main.requests, "post", unexpected_call)

    # 1m rechazado con 422
    res_1m = TestClient(main.app).get(
        "/api/market/analysis?symbol=BTC/USDT&timeframe=1m&engine=local&strategy=mean_reversion_atr"
    )
    assert res_1m.status_code == 422
    assert "solo admite temporalidades" in res_1m.json()["detail"]

    # 5m rechazado con 422
    res_5m = TestClient(main.app).get(
        "/api/market/analysis?symbol=BTC/USDT&timeframe=5m&engine=qwen&strategy=mean_reversion_atr"
    )
    assert res_5m.status_code == 422
    assert "solo admite temporalidades" in res_5m.json()["detail"]


def test_atr_strategy_accepts_1h_timeframe(monkeypatch):
    candles = _quant_strategy_candles(int(time.time() * 1000), timeframe="1h")
    monkeypatch.setattr(main, "get_ohlcv", lambda *args: candles)
    response = TestClient(main.app).get(
        "/api/market/analysis?symbol=BTC/USDT&timeframe=1h&engine=local&strategy=mean_reversion_atr"
    )
    assert response.status_code == 200
    assert response.json()["strategy"] == "mean_reversion_atr"


def test_atr_ai_auditor_error_or_timeout_fails_safe_to_mantener(monkeypatch):
    candles = _quant_strategy_candles(int(time.time() * 1000), timeframe="15m")
    monkeypatch.setattr(main, "get_ohlcv", lambda *args: candles)

    # 1. Simular timeout en el LLM
    def fake_timeout(*args, **kwargs):
        import requests
        raise requests.exceptions.Timeout("Timeout simulado en Qwen")

    monkeypatch.setattr(main.requests, "post", fake_timeout)
    response = TestClient(main.app).get(
        "/api/market/analysis?symbol=BTC/USDT&timeframe=15m&engine=qwen&strategy=mean_reversion_atr"
    )
    assert response.status_code == 200
    result = response.json()
    assert result["strategy_metrics"]["candidate_eligible"] is True
    assert result["signal"] == "MANTENER"
    assert "Fail-Safe" in result["reason"]

    # 2. Simular respuesta JSON malformada o inválida
    class FakeMalformedResponse:
        status_code = 200
        def json(self):
            return {"response": "Texto basura sin estructura JSON"}

    monkeypatch.setattr(main.requests, "post", lambda *args, **kwargs: FakeMalformedResponse())
    response_malformed = TestClient(main.app).get(
        "/api/market/analysis?symbol=BTC/USDT&timeframe=15m&engine=qwen&strategy=mean_reversion_atr"
    )
    assert response_malformed.status_code == 200
    result_malformed = response_malformed.json()
    assert result_malformed["signal"] == "MANTENER"


def test_manual_strategy_still_allows_1m_and_5m(monkeypatch):
    # Generar velas de 1m y 5m
    c_1m = _quant_strategy_candles(int(time.time() * 1000), timeframe="1m")
    monkeypatch.setattr(main, "get_ohlcv", lambda *args: c_1m)

    res_1m = TestClient(main.app).get(
        "/api/market/analysis?symbol=BTC/USDT&timeframe=1m&engine=local&strategy=manual"
    )
    assert res_1m.status_code == 200
    assert res_1m.json()["strategy"] == "manual"



def test_market_analysis_rejects_unknown_strategy():
    response = TestClient(main.app).get(
        "/api/market/analysis?symbol=BTC/USDT&strategy=unexpected"
    )
    assert response.status_code == 422


def test_market_analysis_blocks_non_positive_net_return(monkeypatch):
    def unexpected_market_fetch(*args):
        raise AssertionError("El filtro de costos debe actuar antes de obtener precios")

    monkeypatch.setattr(main, "get_ohlcv", unexpected_market_fetch)

    response = TestClient(main.app).get(
        "/api/market/analysis?symbol=BTC/USDT&timeframe=1m&engine=local&tp=1&fee=0.5"
    )

    assert response.status_code == 200
    result = response.json()
    assert result["signal"] == "MANTENER"
    assert result["fee_info"]["viable"] is False
    assert result["fee_info"]["round_trip_fee"] == 1


def test_market_analysis_does_not_double_count_deducted_costs(monkeypatch):
    now_ms = int(time.time() * 1000)
    candles = []
    for index in range(300):
        close = 100 + index * 0.05 + math.sin(index / 4) * 2
        candles.append([
            now_ms - (299 - index) * 60_000,
            close,
            close + 1,
            close - 1,
            close,
            100 + index,
        ])
    monkeypatch.setattr(main, "get_ohlcv", lambda *args: candles)

    response = TestClient(main.app).get(
        "/api/market/analysis?symbol=BTC/USDT&timeframe=1m&engine=local&tp=1.5&fee=0.5"
    )

    assert response.status_code == 200
    fee_info = response.json()["fee_info"]
    assert fee_info["net_tp"] > 0
    assert fee_info["net_tp"] < fee_info["round_trip_cost"]
    assert fee_info["viable"] is True


def test_market_analysis_uses_configured_minimum_net_profit(monkeypatch):
    def unexpected_market_fetch(*args):
        raise AssertionError("El mínimo neto debe filtrarse antes de consultar velas")

    monkeypatch.setattr(main, "get_ohlcv", unexpected_market_fetch)
    response = TestClient(main.app).get(
        "/api/market/analysis?symbol=BTC/USDT&timeframe=1m&engine=local&tp=1.5&fee=0.1&spread=0.05&min_profit_pct=1.3"
    )

    assert response.status_code == 200
    result = response.json()
    assert result["signal"] == "MANTENER"
    assert result["fee_info"]["net_tp"] < 1.3
    assert result["fee_info"]["min_profit_pct"] == 1.3
    assert result["fee_info"]["viable"] is False


def test_cost_filter_does_not_block_exit_analysis_for_open_positions(monkeypatch):
    now_ms = int(time.time() * 1000)
    candles = []
    for index in range(300):
        close = 100 + index * 0.05 + math.sin(index / 4) * 2
        candles.append([
            now_ms - (299 - index) * 60_000,
            close,
            close + 1,
            close - 1,
            close,
            100 + index,
        ])
    monkeypatch.setattr(main, "get_ohlcv", lambda *args: candles)

    response = TestClient(main.app).get(
        "/api/market/analysis?symbol=BTC/USDT&timeframe=1m&engine=local&tp=1&fee=0.5&has_position=true&entry_price=100"
    )

    assert response.status_code == 200
    result = response.json()
    assert result["indicators"]["current_price"] is not None
    assert result["fee_info"]["viable"] is False
    assert "rentabilidad neta no positiva" not in result["reason"]


def test_market_analysis_blocks_when_net_target_does_not_cover_fees_and_spread(monkeypatch):
    def unexpected_market_fetch(*args):
        raise AssertionError("El filtro de costos debe actuar antes de obtener precios")

    monkeypatch.setattr(main, "get_ohlcv", unexpected_market_fetch)
    response = TestClient(main.app).get(
        "/api/market/analysis?symbol=BTC/USDT&timeframe=1m&engine=local&tp=1&fee=0.1&spread=0.4"
    )

    assert response.status_code == 200
    result = response.json()
    assert result["signal"] == "MANTENER"
    assert result["fee_info"]["round_trip_cost"] == 1
    assert result["fee_info"]["net_tp"] < result["fee_info"]["round_trip_cost"]


def test_market_analysis_rejects_invalid_financial_parameters():
    client = TestClient(main.app)
    for params in [
        "fee=-0.1",
        "fee=nan",
        "spread=-0.1",
        "spread=5.1",
        "min_profit_pct=-0.1",
        "min_profit_pct=5.1",
        "tp=inf",
        "risk=1.1",
        "sentiment=2",
        "entry_price=-1",
    ]:
        response = client.get(f"/api/market/analysis?symbol=BTC/USDT&{params}")
        assert response.status_code == 422, params


def test_cio_bridge_script_attaches_configured_api_token(monkeypatch):
    script_path = (
        main.PROJECT_ROOT
        + "/.agents/skills/macro-cio-auditor/scripts/audit_and_inject.py"
    )
    spec = importlib.util.spec_from_file_location("macro_cio_script", script_path)
    script = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(script)

    monkeypatch.delenv("TRADING_OLLAMA_API_TOKEN", raising=False)
    monkeypatch.setenv("APP_SECRET_TOKEN", "test-secret")
    assert script.auth_headers()["X-API-Token"] == "test-secret"

    monkeypatch.delenv("APP_SECRET_TOKEN")
    monkeypatch.setenv("TRADING_OLLAMA_API_TOKEN", "bridge-secret")
    assert script.auth_headers()["X-API-Token"] == "bridge-secret"


def test_trade_log_rejects_non_finite_or_negative_values():
    client = TestClient(main.app)
    trade = {
        "timeString": "2026-10-14 12:00:00",
        "symbol": "BTC/USDT",
        "signal": "COMPRAR",
        "price": 100,
        "status": "Ejecutada",
        "mode": "Paper",
        "qty": 1,
        "fee": 0.1,
    }
    with pytest.raises(ValidationError):
        main.TradeLogRequest(**{**trade, "price": float("nan")})
    for invalid in [{"qty": -1}, {"fee": -0.1}]:
        response = client.post("/api/log_trade", json={**trade, **invalid})
        assert response.status_code == 422


def test_trade_log_storage_failure_returns_http_error(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "CSV_FILE_PATH", str(tmp_path / "missing" / "trades.csv"))
    trade = {
        "timeString": "2026-10-14 12:00:00",
        "symbol": "BTC/USDT",
        "signal": "COMPRAR",
        "price": 100,
        "status": "Ejecutada",
        "mode": "Paper",
        "qty": 1,
        "fee": 0.1,
    }

    response = TestClient(main.app).post("/api/log_trade", json=trade)

    assert response.status_code == 500
    assert response.json()["detail"] == "No se pudo guardar el registro de la operación."


def test_trade_log_persists_valid_paper_trade_to_configured_path(monkeypatch, tmp_path):
    path = tmp_path / "trades.csv"
    monkeypatch.setattr(main, "CSV_FILE_PATH", str(path))
    trade = {
        "timeString": "2026-10-14 12:00:00",
        "symbol": "BTC/USDT",
        "signal": "COMPRAR",
        "price": 100,
        "status": "Ejecutada",
        "mode": "Paper",
        "qty": 1,
        "fee": 0.1,
    }

    response = TestClient(main.app).post("/api/log_trade", json=trade)

    assert response.status_code == 200
    lines = path.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    assert "BTC/USDT" in lines[1]


def test_invalid_symbol_is_rejected_without_market_request():
    response = TestClient(main.app).get("/api/market/price?symbol=NOT-A-SYMBOL")

    assert response.status_code == 400


def test_purge_does_not_release_an_active_inference_lock(monkeypatch):
    def fail_request(*args, **kwargs):
        raise main.requests.ConnectionError("offline")

    monkeypatch.setattr(main.requests, "get", fail_request)
    monkeypatch.setattr(main.requests, "post", lambda *args, **kwargs: None)
    assert main.OLLAMA_LOCK.acquire(blocking=False)
    try:
        main.purge_ollama_models()
        assert main.OLLAMA_LOCK.locked()
    finally:
        main.OLLAMA_LOCK.release()


def test_premarket_reports_ollama_unavailable_without_external_calls(monkeypatch):
    class EmptyInbox:
        def get_active_cards(self, hours_ttl):
            return []

    def fail_request(*args, **kwargs):
        raise main.requests.ConnectionError("offline")

    monkeypatch.setattr(premarket_digest, "RadarInbox", EmptyInbox)
    monkeypatch.setattr(premarket_digest, "fetch_contrarian_and_market_news", lambda: ["Titular de prueba"])
    monkeypatch.setattr(premarket_digest.requests, "post", fail_request)

    result = premarket_digest.run_premarket_digest(engine="qwen")

    assert result["status"] == "error"
    assert "no responde" in result["message"]


def test_empty_premarket_data_returns_idle_without_external_calls(monkeypatch):
    class EmptyInbox:
        def get_active_cards(self, hours_ttl):
            return []

    monkeypatch.setattr(premarket_digest, "RadarInbox", EmptyInbox)
    monkeypatch.setattr(premarket_digest, "fetch_contrarian_and_market_news", lambda: [])

    result = premarket_digest.run_premarket_digest(engine="qwen")

    assert result == {
        "status": "idle",
        "message": "Buzón vacío y sin noticias frescas disponibles para procesar.",
    }

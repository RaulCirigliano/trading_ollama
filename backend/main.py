from fastapi import FastAPI, HTTPException, Request, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel, Field
import ccxt
import os
import time
import re
import hmac
import csv
import json
import threading
import requests
import math
from datetime import datetime
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv

# Constantes de Raíz y Rutas Absolutas (Bloque 5 item 8)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE_PATH = os.path.join(PROJECT_ROOT, ".env")
CSV_FILE_PATH = os.path.join(PROJECT_ROOT, "historial_trades.csv")
CSV_LEGACY_PATH = os.path.join(PROJECT_ROOT, "historial_trades_legacy.csv")
SHARED_DIRECTIVES_PATH = os.path.join(PROJECT_ROOT, "guias", "directivas_cerebro.md")
BRAIN_STATE_PATH = os.path.join(PROJECT_ROOT, "backend", "config", "brain_state.json")

# Cargar variables de entorno desde la raíz del proyecto
load_dotenv(ENV_FILE_PATH)

app = FastAPI(title="Trading AI API", description="API para el agente de trading")

# Seguridad: TrustedHostMiddleware (Bloque 5 item 6)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["127.0.0.1", "localhost", "testserver", "192.168.100.16", "192.168.100.10", "100.79.33.85", "ArteBarro"]
)

# Seguridad: CORS restrictivo con puertos realmente utilizados (Bloque 5 item 6)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1",
        "http://localhost",
        "http://127.0.0.1:18767",
        "http://localhost:18767",
        "http://127.0.0.1:18087",
        "http://localhost:18087",
        "http://127.0.0.1:8520",
        "http://localhost:8520",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|100\.\d+\.\d+\.\d+)(:(18767|18087|8520|8080|3000|5500|5173))?$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Locks de concurrencia a nivel de proceso
OLLAMA_LOCK = threading.Lock()
PREMARKET_CANCEL_EVENT = threading.Event()
CSV_LOCK = threading.Lock()
_CACHE_LOCK = threading.Lock()
_KEY_LOCKS: Dict[str, threading.Lock] = {}
_CACHE_DATA: Dict[str, Dict[str, Any]] = {}
_BRAIN_STATE_LOCK = threading.Lock()
_OLLAMA_MODELS_LOCK = threading.Lock()
_OLLAMA_MODELS_CACHE: List[str] = []
_OLLAMA_MODELS_CACHE_TS = 0.0

# Símbolos soportados alineados estrictamente con el selector del frontend (Bloque 5 item 3)
SUPPORTED_SYMBOLS = [
    # Criptomonedas
    "BTC/USDT", "ETH/USDT", "SOL/USDT", "BTC-USD", "ETH-USD", "SOL-USD", "BNB/USDT", "XRP/USDT", "ADA/USDT", "DOGE/USDT",
    # Materias Primas y Energía
    "CL=F", "GC=F", "SI=F", "NG=F",
    # Bonos e Índices Macro
    "TLT", "^GSPC", "SPY", "QQQ",
    # Acciones y Empresas Globales
    "BABA", "NVDA", "AAPL", "TSLA", "MSFT",
    # Mercado Argentino (Acciones / CEDEARs)
    "GGAL.BA", "YPFD.BA", "PAMP.BA", "BMA.BA", "ALUA.BA", "TXAR.BA",
    # China y ETFs Temáticos
    "MCHI", "KWEB", "BOTZ"
]

def validate_symbol(symbol: str):
    """Valida que el símbolo pertenezca a la lista oficial soportada."""
    if not symbol or symbol not in SUPPORTED_SYMBOLS:
        raise HTTPException(status_code=400, detail=f"Símbolo no soportado: '{symbol}'. Símbolos permitidos: {SUPPORTED_SYMBOLS}")

VALID_TIMEFRAMES = {"1m", "5m", "15m", "1h"}
TIMEFRAME_SECONDS = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600}
ANALYSIS_OHLCV_LIMIT = 1000
MIN_ANALYSIS_CLOSED_CANDLES = 205
CONTINUOUS_MARKET_SYMBOLS = {"BTC-USD", "ETH-USD", "SOL-USD"}

from backend.quant_analysis import (
    ATR_STRATEGY_TIMEFRAMES,
    ATR_Z_SCORE_THRESHOLD,
    ATR_LOWER_WICK_RATIO_MIN,
    ATR_RELATIVE_VOLUME_MAX,
    ATR_TP_ATR_MULTIPLIER,
    ATR_SL_ATR_MULTIPLIER,
    ATR_COST_COVERAGE_MULTIPLIER,
    ATR_MIN_NET_TP_PCT,
    net_return_after_costs,
    normalize_signal,
    sanitize_ctx,
    build_macro_directive,
    compute_technical_indicators,
    evaluate_strategy_metrics,
    evaluate_local_engine_signal,
)
from backend.estrategias import (
    get_supported_strategy_ids,
    get_allowed_timeframes,
    list_strategies,
    get_strategy,
)


def validate_timeframe(timeframe: str):
    """Valida que el timeframe pertenezca al conjunto oficial permitido (Bloque 5 item 3)."""
    if not timeframe or timeframe not in VALID_TIMEFRAMES:
        raise HTTPException(status_code=400, detail=f"Timeframe no soportado: '{timeframe}'. Timeframes permitidos: {list(VALID_TIMEFRAMES)}")

def verify_auth_token(request: Request, x_api_token: Optional[str] = Header(None)):
    """Validación de seguridad usando hmac.compare_digest para prevenir timing attacks (Bloque 5 item 6)."""
    secret_token = os.getenv("APP_SECRET_TOKEN") or os.getenv("APP_TOKEN")
    if secret_token:
        if not x_api_token or not hmac.compare_digest(str(x_api_token), str(secret_token)):
            raise HTTPException(status_code=401, detail="Token de API inválido o ausente.")
    else:
        client_host = request.client.host if request.client else ""
        if client_host not in ["127.0.0.1", "localhost", "::1", "testclient"]:
            raise HTTPException(status_code=403, detail="Acceso restringido a localhost.")

# Inicializamos el exchange ccxt (Binance para cripto)
exchange = ccxt.binance()

# Helper para locks granulares por clave de caché
def _get_key_lock(key: str) -> threading.Lock:
    with _CACHE_LOCK:
        if key not in _KEY_LOCKS:
            _KEY_LOCKS[key] = threading.Lock()
        return _KEY_LOCKS[key]

# --- LECTURA DE MERCADO CON CACHÉ TTL Y PREVENCIÓN DE DESCARGAS DUPLICADAS (Bloque 5 item 4) ---
def _validate_ohlcv_data(data: Any, symbol: str) -> List[List[float]]:
    if not isinstance(data, list) or not data:
        raise ValueError(f"Feed vacío o inválido para {symbol}")

    validated = []
    for index, candle in enumerate(data):
        if not isinstance(candle, (list, tuple)) or len(candle) < 6:
            raise ValueError(f"Vela OHLCV mal formada para {symbol} en la posición {index}")
        try:
            values = [float(value) for value in candle[:6]]
        except (TypeError, ValueError, OverflowError) as exc:
            raise ValueError(f"Vela OHLCV no numérica para {symbol} en la posición {index}") from exc
        if not all(math.isfinite(value) for value in values):
            raise ValueError(f"Vela OHLCV no finita para {symbol} en la posición {index}")
        timestamp, open_price, high, low, close, volume = values
        if timestamp <= 0 or min(open_price, high, low, close) <= 0 or volume < 0:
            raise ValueError(f"Vela OHLCV fuera de rango para {symbol} en la posición {index}")
        if low > high or not (low <= open_price <= high) or not (low <= close <= high):
            raise ValueError(f"Rango OHLCV inconsistente para {symbol} en la posición {index}")
        validated.append([int(timestamp), open_price, high, low, close, volume])

    candles_by_timestamp: Dict[int, List[float]] = {}
    for candle in validated:
        timestamp = int(candle[0])
        previous = candles_by_timestamp.get(timestamp)
        if previous is not None and previous != candle:
            raise ValueError(f"Velas OHLCV contradictorias con el mismo timestamp para {symbol}: {timestamp}")
        candles_by_timestamp[timestamp] = candle
    return [candles_by_timestamp[timestamp] for timestamp in sorted(candles_by_timestamp)]

def _closed_ohlcv_data(data: Any, symbol: str, timeframe: str, now_ms: Optional[int] = None) -> List[List[float]]:
    """Devuelve únicamente velas completas; los timestamps OHLCV marcan el inicio de cada vela."""
    validate_timeframe(timeframe)
    candles = _validate_ohlcv_data(data, symbol)
    current_time_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    candle_duration_ms = TIMEFRAME_SECONDS[timeframe] * 1000
    return [
        candle
        for candle in candles
        if candle[0] + candle_duration_ms <= current_time_ms
    ]

def _validate_ohlcv_continuity(candles: List[List[float]], symbol: str, timeframe: str) -> None:
    if '/' not in symbol and symbol not in CONTINUOUS_MARKET_SYMBOLS:
        return
    expected_interval_ms = TIMEFRAME_SECONDS[timeframe] * 1000
    for previous, current in zip(candles, candles[1:]):
        interval_ms = int(current[0] - previous[0])
        if interval_ms != expected_interval_ms:
            raise ValueError(
                f"Hueco OHLCV para {symbol}: intervalo esperado {expected_interval_ms}ms, "
                f"recibido {interval_ms}ms entre {int(previous[0])} y {int(current[0])}"
            )

def _fetch_raw_ohlcv(symbol: str, timeframe: str, limit: int):
    if '/' not in symbol:
        import yfinance as yf
        period = '5d' if timeframe in ['1m', '5m'] else '60d'
        ticker = yf.Ticker(symbol)
        df_yf = ticker.history(period=period, interval=timeframe)
        if df_yf.empty:
            raise Exception(f'No se encontraron datos de {symbol} en Yahoo Finance')
        df_yf.reset_index(inplace=True)
        col_name = df_yf.columns[0]
        df_yf['timestamp'] = df_yf[col_name].apply(lambda x: int(x.timestamp() * 1000))
        df_yf.rename(columns={'Open': 'open', 'High': 'high', 'Low': 'low', 'Close': 'close', 'Volume': 'volume'}, inplace=True)
        data = df_yf[['timestamp', 'open', 'high', 'low', 'close', 'volume']].tail(limit).values.tolist()
    else:
        data = exchange.fetch_ohlcv(symbol, timeframe, limit=limit)
    return data

def get_ohlcv(symbol: str, timeframe: str, limit: int):
    ttl = 2.0 if '/' in symbol else 15.0
    cache_key = f"ohlcv:{symbol}:{timeframe}:{limit}"
    now = time.time()
    with _CACHE_LOCK:
        entry = _CACHE_DATA.get(cache_key)
        if entry and now < entry["expires_at"]:
            return entry["data"]

    key_lock = _get_key_lock(cache_key)
    with key_lock:
        with _CACHE_LOCK:
            entry = _CACHE_DATA.get(cache_key)
            if entry and time.time() < entry["expires_at"]:
                return entry["data"]
        data = _validate_ohlcv_data(_fetch_raw_ohlcv(symbol, timeframe, limit), symbol)
        with _CACHE_LOCK:
            _CACHE_DATA[cache_key] = {"data": data, "expires_at": time.time() + ttl}
        return data

def _fetch_raw_price(symbol: str):
    if '/' in symbol:
        ticker = exchange.fetch_ticker(symbol)
        quote_ts = int(ticker.get('timestamp') or (time.time() * 1000))
        price = float(ticker['last'])
    else:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period='1d', interval='1m')
        if hist.empty:
            hist = ticker.history(period='5d', interval='1m')
        if not hist.empty:
            price = float(hist['Close'].iloc[-1])
            quote_ts = int(hist.index[-1].timestamp() * 1000)
        else:
            raise Exception(f"No se pudieron obtener cotizaciones de {symbol} en Yahoo Finance")
    if not math.isfinite(price) or price <= 0 or not math.isfinite(float(quote_ts)) or quote_ts <= 0:
        raise ValueError(f"Feed devolvió precio o timestamp inválido para {symbol}")
    return float(price), int(quote_ts)

def get_cached_price(symbol: str):
    ttl = 2.0 if '/' in symbol else 15.0
    cache_key = f"price:{symbol}"
    now = time.time()
    with _CACHE_LOCK:
        entry = _CACHE_DATA.get(cache_key)
        if entry and now < entry["expires_at"]:
            return entry["data"]

    key_lock = _get_key_lock(cache_key)
    with key_lock:
        with _CACHE_LOCK:
            entry = _CACHE_DATA.get(cache_key)
            if entry and time.time() < entry["expires_at"]:
                return entry["data"]
        price, quote_ts = _fetch_raw_price(symbol)
        result = {"price": price, "ts": int(time.time() * 1000), "quote_ts": quote_ts}
        with _CACHE_LOCK:
            _CACHE_DATA[cache_key] = {"data": result, "expires_at": time.time() + ttl}
        return result

# --- ENDPOINTS DE CONFIGURACIÓN Y ESTADO ---
class ApiKeyRequest(BaseModel):
    api_key: str


class BrainStateRequest(BaseModel):
    engine: str = Field(min_length=1, max_length=40)
    model: Optional[str] = Field(default=None, max_length=120)

class MacroInjectionRequest(BaseModel):
    asset: str = Field(min_length=1, max_length=30, pattern=r"^[A-Za-z0-9_=./^\-]+$")
    text: str = Field(min_length=1, max_length=5000)
    confidence: float = Field(default=80, ge=0, le=100, allow_inf_nan=False)
    type: str = Field(default="Oportunidad", max_length=50)
    source: str = Field(default="Monitor de Mercado", max_length=120)
    timestamp: Optional[str] = Field(default=None, max_length=64)
    id: Optional[str] = Field(default=None, max_length=100)

@app.post("/api/config/gemini")
def save_gemini_key(req: ApiKeyRequest, request: Request, x_api_token: Optional[str] = Header(None)):
    verify_auth_token(request, x_api_token)
    # Validación con regex (Bloque 5 item 6)
    if not re.match(r'^[A-Za-z0-9_\-]{20,128}$', req.api_key):
        raise HTTPException(status_code=400, detail="Formato de API Key inválido. Debe contener entre 20 y 128 caracteres alfanuméricos.")

    lines = []
    found = False
    if os.path.exists(ENV_FILE_PATH):
        with open(ENV_FILE_PATH, "r", encoding="utf-8") as f:
            lines = f.readlines()
    new_lines = []
    for line in lines:
        if line.strip().startswith("GEMINI_API_KEY="):
            new_lines.append(f'GEMINI_API_KEY="{req.api_key}"\n')
            found = True
        else:
            new_lines.append(line)
    if not found:
        new_lines.append(f'GEMINI_API_KEY="{req.api_key}"\n')

    with open(ENV_FILE_PATH, "w", encoding="utf-8") as f:
        f.writelines(new_lines)
    try:
        os.chmod(ENV_FILE_PATH, 0o600)
    except Exception:
        pass

    os.environ["GEMINI_API_KEY"] = req.api_key
    return {"status": "ok", "message": "API Key de Gemini configurada con éxito en .env."}

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Motor de Trading AI en línea"}


def _read_brain_state() -> Dict[str, Optional[str]]:
    if not os.path.exists(BRAIN_STATE_PATH):
        return {"engine": "ollama", "model": None}
    try:
        with open(BRAIN_STATE_PATH, "r", encoding="utf-8") as state_file:
            state = json.load(state_file)
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail="No se pudo leer la configuración central del cerebro.") from exc
    if not isinstance(state, dict):
        raise HTTPException(status_code=500, detail="La configuración central del cerebro tiene un formato inválido.")
    return _validate_brain_state(state.get("engine"), state.get("model"))


def _validate_brain_state(engine: Any, model: Any) -> Dict[str, Optional[str]]:
    if not isinstance(engine, str) or engine not in {"ollama", "gemini", "local", "antigravity_cio"}:
        raise HTTPException(status_code=422, detail="Motor de cerebro no soportado.")
    clean_model = model.strip() if isinstance(model, str) else None
    if engine == "ollama":
        if not _is_valid_ollama_model_name(clean_model):
            raise HTTPException(status_code=422, detail="Selecciona un modelo Ollama válido.")
    elif clean_model and not re.fullmatch(r"[A-Za-z0-9._:/-]{1,120}", clean_model):
        raise HTTPException(status_code=422, detail="Nombre de modelo inválido.")
    return {"engine": engine, "model": clean_model or None}


def _is_valid_ollama_model_name(model: Any) -> bool:
    if not isinstance(model, str) or not re.fullmatch(r"[A-Za-z0-9._:/-]{1,120}", model):
        return False
    return all(part not in {"", ".", ".."} for part in model.split("/"))


def _shared_brain_directives() -> str:
    try:
        with open(SHARED_DIRECTIVES_PATH, "r", encoding="utf-8") as directives_file:
            return directives_file.read()
    except OSError as exc:
        raise HTTPException(status_code=500, detail="No se pudieron leer las directivas canónicas del cerebro.") from exc


@app.get("/api/system/models")
def get_system_models(request: Request, x_api_token: Optional[str] = Header(None)):
    verify_auth_token(request, x_api_token)
    global _OLLAMA_MODELS_CACHE_TS
    try:
        response = requests.get("http://localhost:11434/api/tags", timeout=3)
        response.raise_for_status()
        payload = response.json()
        raw_models = payload.get("models", []) if isinstance(payload, dict) else []
        models = sorted({
            item.get("name", "").strip()
            for item in raw_models
            if isinstance(item, dict)
            and isinstance(item.get("name"), str)
            and _is_valid_ollama_model_name(item["name"].strip())
        })
        with _OLLAMA_MODELS_LOCK:
            _OLLAMA_MODELS_CACHE[:] = models
            _OLLAMA_MODELS_CACHE_TS = time.time()
        return {"available": True, "models": models, "cached_at": _OLLAMA_MODELS_CACHE_TS}
    except (requests.RequestException, ValueError, TypeError) as exc:
        with _OLLAMA_MODELS_LOCK:
            cached_models = list(_OLLAMA_MODELS_CACHE)
            cached_at = _OLLAMA_MODELS_CACHE_TS or None
        return {
            "available": False,
            "models": cached_models,
            "cached_at": cached_at,
            "error": "Ollama no está disponible; se conserva la última lista conocida." if cached_models
                else "Ollama no está disponible y todavía no hay una lista de modelos en caché.",
        }


@app.get("/api/system/brain")
def get_system_brain(request: Request, x_api_token: Optional[str] = Header(None)):
    verify_auth_token(request, x_api_token)
    with _BRAIN_STATE_LOCK:
        return _read_brain_state()


@app.post("/api/system/brain")
def set_system_brain(
    req: BrainStateRequest,
    request: Request,
    x_api_token: Optional[str] = Header(None),
):
    verify_auth_token(request, x_api_token)
    state = _validate_brain_state(req.engine, req.model)
    state_dir = os.path.dirname(BRAIN_STATE_PATH)
    temp_path = f"{BRAIN_STATE_PATH}.tmp"
    try:
        os.makedirs(state_dir, exist_ok=True)
        with _BRAIN_STATE_LOCK:
            with open(temp_path, "w", encoding="utf-8") as state_file:
                json.dump(state, state_file, ensure_ascii=False, indent=2)
                state_file.flush()
                os.fsync(state_file.fileno())
            os.replace(temp_path, BRAIN_STATE_PATH)
    except OSError as exc:
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except OSError:
            pass
        raise HTTPException(status_code=500, detail="No se pudo guardar la configuración central del cerebro.") from exc
    return state


@app.get("/api/strategies")
@app.get("/api/estrategias")
def get_available_strategies():
    """Retorna el catálogo completo de estrategias disponibles (modulares)."""
    return list_strategies()


@app.get("/api/market/price")
def get_price(symbol: str = "BTC/USDT"):
    validate_symbol(symbol)
    try:
        cached = get_cached_price(symbol)
        now_s = time.time()
        quote_ts = cached.get("quote_ts", cached.get("ts"))
        quote_ts_s = (quote_ts / 1000.0) if quote_ts > 1e11 else quote_ts
        quote_age_s = max(0, int(now_s - quote_ts_s))
        stale_threshold_s = 20 if '/' in symbol else 150
        market_open = bool(quote_age_s < 900 or (symbol.endswith('.BA') and quote_age_s < 1800))
        feed_delayed = bool(quote_age_s > stale_threshold_s and market_open)
        return {
            "symbol": symbol,
            "price": cached["price"],
            "ts": cached["ts"],
            "quote_ts": int(quote_ts_s * 1000),
            "quote_age_s": quote_age_s,
            "data_age_s": quote_age_s,
            "stale_threshold_s": stale_threshold_s,
            "market_open": market_open,
            "feed_delayed": feed_delayed
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

@app.get("/api/market/history")
def get_history(symbol: str = "BTC/USDT", timeframe: str = "1h", limit: int = 100):
    validate_symbol(symbol)
    validate_timeframe(timeframe)
    # Acotar limit a rango seguro 10..500 (Bloque 5 item 3)
    bounded_limit = max(10, min(500, int(limit)))
    try:
        ohlcv = get_ohlcv(symbol, timeframe, bounded_limit)
        import pandas as pd
        import ta
        df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        df['sma_20'] = ta.trend.SMAIndicator(close=df['close'], window=20).sma_indicator()
        df['vwap'] = ta.volume.VolumeWeightedAveragePrice(high=df['high'], low=df['low'], close=df['close'], volume=df['volume'], window=14).volume_weighted_average_price()
        
        vwap_std = df['close'].rolling(window=14).std()
        df['vwap_upper'] = df['vwap'] + vwap_std
        df['vwap_lower'] = df['vwap'] - vwap_std
        
        formatted_data = []
        for index, row in df.iterrows():
            item = {
                "time": int(row['timestamp'] / 1000),
                "open": row['open'],
                "high": row['high'],
                "low": row['low'],
                "close": row['close'],
                "volume": row['volume']
            }
            if not pd.isna(row['sma_20']):
                item["sma_20"] = round(row['sma_20'], 2)
            if not pd.isna(row['vwap']):
                item["vwap"] = round(row['vwap'], 2)
            if not pd.isna(row['vwap_upper']):
                item["vwap_upper"] = round(row['vwap_upper'], 2)
            if not pd.isna(row['vwap_lower']):
                item["vwap_lower"] = round(row['vwap_lower'], 2)
            formatted_data.append(item)
            
        if formatted_data and not df.empty:
            latest_ts_raw = df.iloc[-1]['timestamp']
            latest_ts_s = (latest_ts_raw / 1000.0) if latest_ts_raw > 1e11 else latest_ts_raw
            formatted_data[-1]["last_candle_age_s"] = max(0, int(time.time() - latest_ts_s))
            
        return formatted_data
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

# --- PUENTE CON MONITOR DEL MERCADO (PROYECTO EXTERNO) ---
INJECTED_MACRO: Dict[str, Any] = {
    "id": None,
    "asset": "",
    "text": "",
    "confidence": 75,
    "type": "Oportunidad",
    "source": "Monitor de Mercado",
    "timestamp": None
}

@app.post("/api/macro/inject")
def inject_macro_from_monitor(data: MacroInjectionRequest, request: Request, x_api_token: Optional[str] = Header(None)):
    """
    Recibe la oportunidad y tesis macro validada desde el proyecto independiente Monitor del Mercado.
    Registra la tarjeta en el Buzón Persistente (buzon_radar.json) y actualiza el estado inyectado en vivo.
    """
    global INJECTED_MACRO
    verify_auth_token(request, x_api_token)
    import uuid
    from backend.radar_inbox import RadarInbox, OpportunityCard, parse_iso_timestamp

    asset = data.asset.strip().upper()
    text = data.text.strip()
    if not asset or not text:
        raise HTTPException(status_code=400, detail="Faltan campos obligatorios: 'asset' y 'text'")

    conf = int(data.confidence)
    raw_type = data.type.strip()
    impact = "POSITIVO" if raw_type.upper() in ["OPORTUNIDAD", "POSITIVO"] else ("NEGATIVO" if raw_type.upper() in ["PELIGRO", "NEGATIVO"] else "NEUTRAL")
    if data.timestamp:
        try:
            ts = parse_iso_timestamp(data.timestamp).isoformat()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="El campo 'timestamp' debe ser una fecha ISO-8601 válida.") from exc
    else:
        ts = datetime.now().astimezone().isoformat()
    card_id = data.id or str(uuid.uuid4())

    INJECTED_MACRO = {
        "id": card_id,
        "asset": asset,
        "text": text,
        "confidence": conf,
        "type": raw_type,
        "source": data.source,
        "timestamp": ts
    }

    # Guardar también en el buzón persistente
    try:
        inbox = RadarInbox()
        inbox.add_card(OpportunityCard(
            id=card_id,
            timestamp=ts,
            activo=asset,
            titular=f"Alerta Monitor: {asset} ({raw_type})",
            impacto=impact,
            confianza=conf,
            justificacion=text[:300]
        ))
    except Exception as e:
        print(f"Advertencia guardando en buzón radar: {e}")

    return {
        "status": "ok",
        "message": f"Directiva macro inyectada con éxito para {asset}.",
        "data": INJECTED_MACRO
    }

@app.get("/api/macro/current_injected")
def get_current_injected_macro(request: Request, x_api_token: Optional[str] = Header(None)):
    """Permite al frontend consultar la directiva activa más reciente: inyección manual del CIO o auto-promoción de alertas frescas (>=80% confianza) desde buzon_radar.json."""
    global INJECTED_MACRO
    verify_auth_token(request, x_api_token)
    from backend.radar_inbox import RadarInbox, parse_iso_timestamp
    
    injected_ts = None
    if INJECTED_MACRO and INJECTED_MACRO.get("timestamp"):
        try:
            injected_ts = parse_iso_timestamp(INJECTED_MACRO.get("timestamp")).timestamp()
        except Exception:
            pass

    # Evaluar la alerta fresca más calificada en el buzón satélite
    best_monitor_card = None
    best_monitor_ts = None
    try:
        cards = RadarInbox().get_active_cards(hours_ttl=24)
        for c in reversed(cards):
            raw_imp = str(c.impacto).strip().upper()
            is_opp = raw_imp in ["POSITIVO", "OPORTUNIDAD"]
            c_asset = str(c.activo or "").strip().upper()
            if is_opp and c.confianza >= 80 and c_asset and c_asset not in {"GENERAL", "NONE", "N/A"}:
                try:
                    c_ts = parse_iso_timestamp(c.timestamp).timestamp()
                    best_monitor_card = c
                    best_monitor_ts = c_ts
                    break
                except Exception:
                    continue
    except Exception as e:
        print(f"Advertencia evaluando auto-promoción en buzon_radar: {e}")

    # Prioridad por timestamp: si la alerta del monitor es más nueva que la inyección previa, auto-promoverla
    if best_monitor_card and best_monitor_ts:
        if not injected_ts or best_monitor_ts > injected_ts:
            return {
                "id": best_monitor_card.id,
                "asset": best_monitor_card.activo,
                "text": best_monitor_card.justificacion or best_monitor_card.titular,
                "confidence": best_monitor_card.confianza,
                "type": "Oportunidad",
                "source": "Monitor del Mercado (Auto)",
                "timestamp": best_monitor_card.timestamp
            }

    if INJECTED_MACRO and INJECTED_MACRO.get("timestamp"):
        return INJECTED_MACRO

    if best_monitor_card:
        return {
            "id": best_monitor_card.id,
            "asset": best_monitor_card.activo,
            "text": best_monitor_card.justificacion or best_monitor_card.titular,
            "confidence": best_monitor_card.confianza,
            "type": "Oportunidad",
            "source": "Monitor del Mercado (Auto)",
            "timestamp": best_monitor_card.timestamp
        }

    return INJECTED_MACRO

# --- MACRO RADAR Y BUZÓN ---
@app.get("/api/macro/radar")
def get_macro_radar(
    request: Request,
    engine: str = "ollama",
    source: str = "native",
    model: Optional[str] = None,
    x_api_token: Optional[str] = Header(None),
):
    verify_auth_token(request, x_api_token)
    if engine not in {"gemini", "ai", "ollama", "qwen", "deepseek"}:
        return {"status": "error", "message": "El motor seleccionado no está disponible para informes Pre-Market."}
    if engine in {"ollama", "qwen", "deepseek"} and model and not _is_valid_ollama_model_name(model):
        raise HTTPException(status_code=422, detail="Nombre de modelo inválido.")
    try:
        import requests
        import feedparser
        import json
        import uuid
        from datetime import datetime
        from backend.radar_inbox import RadarInbox, OpportunityCard

        # Si se solicita exclusivamente la fuente del Monitor de Mercado
        if source == "monitor":
            inbox = RadarInbox()
            active_cards = inbox.get_active_cards(hours_ttl=72)
            if active_cards:
                res = []
                for c in reversed(active_cards):
                    res.append({
                        "asset": c.activo,
                        "type": "Oportunidad" if c.impacto == "POSITIVO" else ("Peligro" if c.impacto == "NEGATIVO" else "Neutral"),
                        "confidence": c.confianza,
                        "reason": c.justificacion,
                        "titular": c.titular,
                        "schedule": "Inmediato",
                        "source": "Monitor de Mercado"
                    })
                return res
            else:
                return [{"asset": "MONITOR_ESPERA", "type": "Neutral", "confidence": 0, "reason": "Buzón satélite vacío. Listo para recibir alertas desde Monitor de Mercado.", "schedule": "-", "source": "Monitor de Mercado"}]

        def save_to_inbox(signals):
            """Valida CADA tarjeta individualmente dentro de su propio try (Bloque 5 item 10)."""
            try:
                inbox = RadarInbox()
                cards_to_add = []
                if isinstance(signals, dict):
                    signals = [signals]
                if not isinstance(signals, list):
                    return

                for s in signals:
                    try:
                        if not isinstance(s, dict):
                            continue
                        raw_asset = str(s.get("asset", "GENERAL")).strip().upper()
                        if not re.match(r'^[A-Za-z0-9=./\-]{1,15}$', raw_asset):
                            raw_asset = "GENERAL"

                        raw_conf = s.get("confidence", 50)
                        if isinstance(raw_conf, str):
                            raw_conf = raw_conf.replace("%", "").strip()
                        try:
                            conf = int(float(raw_conf))
                        except Exception:
                            conf = 50
                        conf = max(0, min(100, conf))

                        raw_type = str(s.get("type", s.get("impacto", "NEUTRAL"))).strip().upper()
                        impact_map = {
                            "OPORTUNIDAD": "POSITIVO",
                            "PELIGRO": "NEGATIVO",
                            "POSITIVO": "POSITIVO",
                            "NEGATIVO": "NEGATIVO",
                            "NEUTRAL": "NEUTRAL"
                        }
                        impacto = impact_map.get(raw_type, "NEUTRAL")

                        reason = str(s.get("reason", s.get("justificacion", "")))[:300]
                        raw_title = str(s.get("titular", s.get("title", "")))[:300].strip()
                        if not raw_title or raw_title.lower() == reason.lower():
                            titular = f"Alerta Radar: {raw_asset} ({impacto})"
                        else:
                            titular = raw_title

                        cards_to_add.append(OpportunityCard(
                            id=str(uuid.uuid4()),
                            timestamp=datetime.now().isoformat(),
                            activo=raw_asset,
                            titular=titular,
                            impacto=impacto,
                            confianza=conf,
                            justificacion=reason
                        ))
                    except Exception as card_err:
                        print(f"Error procesando tarjeta individual: {card_err}")
                        continue

                if cards_to_add:
                    inbox.add_cards(cards_to_add)
            except Exception as e:
                print("Error general guardando en buzón:", e)

        # 1. Extraer titulares generales, cripto y referentes de mercado
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        rss_queries = [
            ({'q': 'economy global markets finance', 'hl': 'en-US', 'gl': 'US', 'ceid': 'US:en'}, 3),
            ({'q': 'mercado financiero bitcoin acciones OR bolsa', 'hl': 'es-419', 'gl': 'AR', 'ceid': 'AR:es-419'}, 3),
            ({'q': 'Carlos Maslaton mercado OR bitcoin OR bolsa', 'hl': 'es-419', 'gl': 'AR', 'ceid': 'AR:es-419'}, 3)
        ]
        titulares = []
        for params, p_limit in rss_queries:
            try:
                r = requests.get('https://news.google.com/rss/search', params=params, headers=headers, timeout=6)
                if r.status_code == 200:
                    feed = feedparser.parse(r.content)
                    for entry in feed.entries[:p_limit]:
                        clean_t = str(entry.title).strip()
                        if clean_t and clean_t not in titulares:
                            titulares.append(clean_t)
            except Exception:
                continue

        news_text = "\n".join(titulares)

        shared_directives = _shared_brain_directives() if engine not in {"local", "antigravity_cio"} else ""
        prompt = f'''
        DIRECTIVAS CANÓNICAS COMPARTIDAS:
        {shared_directives}

        Eres un Analista Macro y Agente de Inversiones Institucional.
        Mantén tu razonamiento interno muy breve.
        Lee los siguientes titulares recientes:
        {news_text}

        Identifica hasta 3 activos específicos (ej. SPY, GC=F, BTC, TSLA, AAPL) que presenten una Oportunidad o Riesgo inminente según las noticias.
        Responde EXCLUSIVAMENTE en formato JSON válido con la siguiente estructura de lista de objetos:
        [
          {{
            "asset": "Símbolo",
            "type": "Oportunidad" o "Peligro",
            "confidence": 85,
            "reason": "Resumen muy breve",
            "titular": "Titular representativo de la noticia",
            "schedule": "Horario sugerido o Inmediato"
          }}
        ]
        No incluyas markdown, responde directamente con el array [].
        '''

        def append_monitor_cards(res_list):
            if source == "hybrid":
                try:
                    inbox = RadarInbox()
                    for c in inbox.get_active_cards(hours_ttl=72):
                        res_list.append({
                            "asset": c.activo,
                            "type": "Oportunidad" if c.impacto == "POSITIVO" else ("Peligro" if c.impacto == "NEGATIVO" else "Neutral"),
                            "confidence": c.confianza,
                            "reason": c.justificacion,
                            "titular": c.titular,
                            "schedule": "Inmediato",
                            "source": "Monitor de Mercado"
                        })
                except Exception as h_err:
                    print(f"Error adjuntando tarjetas híbridas: {h_err}")
            return res_list

        if not titulares:
            return append_monitor_cards([{
                "asset": "NO_DATA",
                "type": "Neutral",
                "confidence": 0,
                "reason": "No se recibieron titulares RSS válidos; no se generó una conclusión de mercado.",
                "schedule": "-"
            }])

        if engine == "local":
            return append_monitor_cards([{"asset": "LOCAL_MKT", "type": "NEUTRAL", "confidence": 0, "reason": "Radar inactivo en modo Cuantitativo Local (sin LLM).", "schedule": "-"}])
        elif engine in ["ai", "gemini"]:
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key or api_key == "tu_clave_aqui_sin_comillas":
                return append_monitor_cards([{"asset": "GEMINI_OFF", "type": "Peligro", "confidence": 0, "reason": "Falta API Key", "schedule": "-"}])

            from langchain_google_genai import ChatGoogleGenerativeAI
            gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
            llm = ChatGoogleGenerativeAI(model=gemini_model, google_api_key=api_key, temperature=0.3)
            response = llm.invoke(prompt)

            if isinstance(response.content, list):
                txt = "".join([str(p.get("text", p)) if isinstance(p, dict) else str(p) for p in response.content]).strip()
            else:
                txt = str(response.content).strip()

            # Extracción robusta de JSON por regex (Bloque 5 item 10)
            json_match = re.search(r'\[.*\]', txt, re.DOTALL)
            if json_match:
                parsed_res = json.loads(json_match.group(0))
            else:
                parsed_res = json.loads(txt.replace("```json", "").replace("```", "").strip())

            if isinstance(parsed_res, dict):
                parsed_res = [parsed_res]
            elif not isinstance(parsed_res, list):
                raise ValueError("La respuesta Gemini debe ser una lista u objeto de alertas.")
            parsed_res = [item for item in parsed_res if isinstance(item, dict)]

            save_to_inbox(parsed_res)
            return append_monitor_cards(parsed_res)

        else: # Motor Ollama con OLLAMA_LOCK no bloqueante (Bloque 5 item 2)
            acquired = OLLAMA_LOCK.acquire(blocking=False)
            if not acquired:
                return append_monitor_cards([{"asset": "BUSY", "type": "Peligro", "confidence": 0, "reason": "Ollama ocupado", "schedule": "-"}])
            try:
                opp_model = model or ("trader-qwen" if engine == "qwen" else ("trader-deepseek" if engine == "deepseek" else "trader-ia"))
                payload = {
                    "model": opp_model,
                    "system": shared_directives,
                    "prompt": prompt,
                    "stream": False
                }
                if engine != "deepseek":
                    payload["format"] = "json"
                else:
                    payload["options"] = {
                        "num_predict": 700,
                        "temperature": 0.1,
                        "repeat_penalty": 1.15
                    }
                res = requests.post("http://localhost:11434/api/generate", json=payload, timeout=90 if engine == "deepseek" else 120)
                if res.status_code == 404 and engine == "qwen":
                    payload["model"] = "qwen2.5:3b"
                    res = requests.post("http://localhost:11434/api/generate", json=payload, timeout=120)
                if res.status_code == 200:
                    resp_json = res.json().get("response", "[]")
                    clean_resp = re.sub(r'<think>.*?</think>', '', resp_json, flags=re.DOTALL | re.IGNORECASE).strip()
                    target_resp = clean_resp if clean_resp else resp_json
                    json_match = re.search(r'\[.*\]', target_resp, re.DOTALL)
                    if json_match:
                        final_res = json.loads(json_match.group(0))
                    else:
                        parsed = json.loads(target_resp)
                        final_res = parsed
                        if isinstance(parsed, dict):
                            for k, v in parsed.items():
                                if isinstance(v, list):
                                    final_res = v
                                    break
                            if isinstance(final_res, dict):
                                final_res = [parsed]

                    save_to_inbox(final_res)
                    return append_monitor_cards(final_res)
                else:
                    return append_monitor_cards([{"asset": "ERROR", "type": "Peligro", "confidence": 0, "reason": "Ollama inactivo", "schedule": "-"}])
            finally:
                OLLAMA_LOCK.release()

    except Exception as e:
        return [{"asset": "SYS_ERR", "type": "Peligro", "confidence": 0, "reason": str(e), "schedule": "-"}]

@app.get("/api/macro/premarket")
def get_premarket_digest(
    request: Request,
    engine: str = "gemini",
    model: Optional[str] = None,
    x_api_token: Optional[str] = Header(None),
):
    verify_auth_token(request, x_api_token)
    if model and not _is_valid_ollama_model_name(model):
        raise HTTPException(status_code=422, detail="Nombre de modelo inválido.")
    PREMARKET_CANCEL_EVENT.clear()
    try:
        from backend.premarket_digest import run_premarket_digest
        if engine != "gemini" and engine != "ai":
            acquired = OLLAMA_LOCK.acquire(blocking=False)
            if not acquired:
                return {"status": "busy", "message": "Ollama ocupado procesando otra tarea."}
            try:
                return run_premarket_digest(engine=engine, model=model, cancel_event=PREMARKET_CANCEL_EVENT)
            finally:
                OLLAMA_LOCK.release()
        else:
            return run_premarket_digest(engine=engine, model=model, cancel_event=PREMARKET_CANCEL_EVENT)
    except ImportError:
        return {"status": "error", "message": "Módulo backend.premarket_digest no disponible."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def purge_ollama_models() -> List[str]:
    """Consulta los modelos activos en Ollama (/api/ps) y los desaloja forzosamente de RAM (keep_alive: 0)."""
    unloaded = []
    try:
        ps_res = requests.get("http://localhost:11434/api/ps", timeout=3)
        if ps_res.status_code == 200:
            running_models = ps_res.json().get("models", [])
            for m in running_models:
                name = m.get("name") or m.get("model")
                if name:
                    try:
                        requests.post("http://localhost:11434/api/generate", json={"model": name, "keep_alive": 0}, timeout=4)
                        unloaded.append(name)
                    except Exception:
                        pass
    except Exception:
        pass
    
    # Fallback asegurado para todos los modelos conocidos de trading si /api/ps falló o no los reportó
    for fallback_name in ["trader-deepseek", "trader-ia", "trader-qwen", "qwen2.5:3b", "deepseek-r1:8b", "deepseek-r1:1.5b", "llama3:latest"]:
        if fallback_name not in unloaded:
            try:
                requests.post("http://localhost:11434/api/generate", json={"model": fallback_name, "keep_alive": 0}, timeout=2)
            except Exception:
                pass

    return unloaded

@app.post("/api/macro/premarket/cancel")
def cancel_premarket_digest(request: Request, x_api_token: Optional[str] = Header(None)):
    verify_auth_token(request, x_api_token)
    PREMARKET_CANCEL_EVENT.set()
    unloaded = purge_ollama_models()
    return {
        "status": "cancelled",
        "message": "Proceso Pre-Market cancelado exitosamente y memoria RAM liberada.",
        "unloaded_models": unloaded
    }

@app.post("/api/ollama/purge")
def purge_ollama_endpoint(request: Request, x_api_token: Optional[str] = Header(None)):
    verify_auth_token(request, x_api_token)
    PREMARKET_CANCEL_EVENT.set()
    unloaded = purge_ollama_models()
    return {
        "status": "success",
        "message": "Memoria RAM de Ollama purgada exitosamente. Procesos y modelos desalojados.",
        "unloaded_models": unloaded
    }

@app.get("/api/market/sentiment")
def get_sentiment(symbol: str = "BTC/USDT", source: str = "coindesk"):
    validate_symbol(symbol)
    try:
        import requests
        import feedparser
        from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

        base_asset = symbol.split('/')[0].upper()
        nombres = {"BTC": "Bitcoin", "ETH": "Ethereum", "SOL": "Solana"}
        nombre_completo = nombres.get(base_asset, base_asset)

        if source == "twitter":
            return {
                "score": 0,
                "estado": "OFFLINE",
                "noticias": [{"title": "⚠️ La API de Twitter/X requiere configurar una Clave PRO en el archivo .env", "score": 0}]
            }

        is_crypto = base_asset in ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA"] or "USDT" in symbol
        if source == "auto" or (source == "coindesk" and not is_crypto):
            source = "coindesk" if is_crypto else "yahoo"

        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

        if source == "yahoo":
            query_term = base_asset.replace(".BA", "").replace("GC=F", "Gold")
            # Consulta segura con params en vez de concatenación f-string (Bloque 5 item 3)
            r = requests.get(
                'https://news.google.com/rss/search',
                params={'q': f'{query_term} stock', 'hl': 'en-US', 'gl': 'US', 'ceid': 'US:en'},
                headers=headers,
                timeout=10
            )
            feed = feedparser.parse(r.content)
        else:
            r = requests.get('https://www.coindesk.com/arc/outboundfeeds/rss/', headers=headers, timeout=10)
            feed = feedparser.parse(r.content)

        analyzer = SentimentIntensityAnalyzer()
        total_score = 0
        news_list = []

        for entry in feed.entries:
            title = entry.title
            is_relevant = (source == "yahoo") or (base_asset.lower() in title.lower() or nombre_completo.lower() in title.lower())
            if is_relevant:
                score = analyzer.polarity_scores(title)
                compound = score['compound']
                total_score += compound
                news_list.append({"title": title, "score": round(compound, 2)})
                if len(news_list) >= 5:
                    break

        if len(news_list) == 0:
            return {"score": 0, "estado": "NEUTRAL", "fuente": "Google News" if source == "yahoo" else "CoinDesk", "noticias": [{"title": f"Sin noticias recientes de {nombre_completo}", "score": 0}]}

        avg_score = total_score / len(news_list)
        estado = "BULLISH" if avg_score > 0.15 else ("BEARISH" if avg_score < -0.15 else "NEUTRAL")

        return {
            "score": round(avg_score, 2),
            "estado": estado,
            "fuente": "Google News" if source == "yahoo" else "CoinDesk",
            "noticias": news_list
        }
    except Exception as e:
        return {"error": str(e)}

# --- MOTOR CUANTITATIVO Y ORQUESTADOR DE ANÁLISIS ---
@app.get("/api/market/analysis")
def get_analysis(
    request: Request,
    symbol: str = "BTC/USDT",
    timeframe: str = "1m",
    engine: str = "local",
    model: Optional[str] = None,
    strategy: str = "manual",
    tp: float = Query(3.0, gt=0, le=100, allow_inf_nan=False),
    sl: float = Query(2.0, gt=0, le=100, allow_inf_nan=False),
    risk: float = Query(1.0, ge=0, le=1, allow_inf_nan=False),
    sentiment: float = Query(0.0, ge=-1, le=1, allow_inf_nan=False),
    macro: str = "",
    fee: float = Query(0.1, ge=0, le=10, allow_inf_nan=False),
    spread: float = Query(0.05, ge=0, le=5, allow_inf_nan=False),
    min_profit_pct: float = Query(0.15, ge=0, le=5, allow_inf_nan=False),
    has_position: bool = False,
    entry_price: float = Query(0.0, ge=0, allow_inf_nan=False),
    x_api_token: Optional[str] = Header(None)
):
    verify_auth_token(request, x_api_token)
    validate_symbol(symbol)
    validate_timeframe(timeframe)
    if strategy not in get_supported_strategy_ids():
        raise HTTPException(status_code=422, detail="Estrategia no soportada.")
    if engine not in {"local", "ai", "gemini", "deepseek", "ollama", "qwen"}:
        raise HTTPException(
            status_code=422,
            detail="Este motor no está conectado como analista de señales de la Trinchera.",
        )
    if model and not _is_valid_ollama_model_name(model):
        raise HTTPException(status_code=422, detail="Nombre de modelo inválido.")
    allowed_tfs = get_allowed_timeframes(strategy)
    if timeframe not in allowed_tfs:
        raise HTTPException(
            status_code=422,
            detail=f"La estrategia '{strategy}' solo admite temporalidades {sorted(list(allowed_tfs))}. Recibido: '{timeframe}'."
        )

    try:
        import pandas as pd

        round_trip_fee = round(fee * 2.0, 3)
        round_trip_spread = round(spread * 2.0, 3)
        round_trip_cost = round(round_trip_fee + round_trip_spread, 3)
        net_tp = round(net_return_after_costs(tp, fee, spread), 4)
        shared_directives = _shared_brain_directives() if engine != "local" else ""

        # Fees and spread are already deducted by net_return_after_costs.
        if strategy == "manual" and not has_position and net_tp < min_profit_pct:
            return {
                "symbol": symbol,
                "signal": "MANTENER",
                "reason": f"Filtro de beneficio mínimo: rentabilidad neta estimada ({net_tp}%) inferior al mínimo configurado ({min_profit_pct}%).",
                "fee_info": {
                    "fee_per_order": fee,
                    "round_trip_fee": round_trip_fee,
                    "spread_per_side": spread,
                    "round_trip_spread": round_trip_spread,
                    "round_trip_cost": round_trip_cost,
                    "net_tp": net_tp,
                    "min_profit_pct": min_profit_pct,
                    "viable": False,
                },
                "indicators": {"rsi": None, "sma_20": None, "sma_50": None, "current_price": None},
                "latest_candle": None
            }

        raw_ohlcv = get_ohlcv(symbol, timeframe, ANALYSIS_OHLCV_LIMIT)
        ohlcv = _closed_ohlcv_data(raw_ohlcv, symbol, timeframe)
        _validate_ohlcv_continuity(ohlcv, symbol, timeframe)
        df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])

        if len(df) < MIN_ANALYSIS_CLOSED_CANDLES:
            current_close = float(df.iloc[-1]['close']) if not df.empty else None
            return {
                "symbol": symbol,
                "signal": "MANTENER",
                "reason": (
                    f"Historial insuficiente para análisis estable ({len(df)} velas cerradas; "
                    f"se requieren al menos {MIN_ANALYSIS_CLOSED_CANDLES} para calentar indicadores de largo plazo)."
                ),
                "fee_info": {
                    "fee_per_order": fee,
                    "round_trip_fee": round_trip_fee,
                    "spread_per_side": spread,
                    "round_trip_spread": round_trip_spread,
                    "round_trip_cost": round_trip_cost,
                    "net_tp": net_tp,
                    "min_profit_pct": min_profit_pct,
                    "viable": False,
                },
                "indicators": {"rsi": None, "sma_20": None, "sma_50": None, "current_price": current_close},
                "latest_candle": None
            }

        # Freshness is measured from the close of the last completed candle.
        tf_sec = TIMEFRAME_SECONDS[timeframe]
        latest_candle_open_ts_ms = int(df.iloc[-1]['timestamp'])
        latest_candle_close_ts_s = (latest_candle_open_ts_ms / 1000.0) + tf_sec
        last_candle_age_s = max(0, int(time.time() - latest_candle_close_ts_s))
        signal_candle_ts = int(latest_candle_open_ts_ms / 1000)

        # Si age > 3*timeframe_segundos => MANTENER por datos obsoletos / mercado cerrado
        if last_candle_age_s > (3 * tf_sec):
            return {
                "symbol": symbol,
                "signal": "MANTENER",
                "reason": f"Datos obsoletos / mercado cerrado (antigüedad de datos: {last_candle_age_s}s > {3 * tf_sec}s).",
                "data_age_s": last_candle_age_s,
                "signal_candle_ts": signal_candle_ts,
                "fee_info": {
                    "fee_per_order": fee,
                    "round_trip_fee": round_trip_fee,
                    "spread_per_side": spread,
                    "round_trip_spread": round_trip_spread,
                    "round_trip_cost": round_trip_cost,
                    "net_tp": net_tp,
                    "min_profit_pct": min_profit_pct,
                    "viable": False,
                },
                "indicators": {"rsi": None, "sma_20": None, "sma_50": None, "current_price": float(df.iloc[-1]['close'])},
                "latest_candle": None
            }

        ind = compute_technical_indicators(df)
        latest = ind["latest"]
        previous = ind["previous"]
        current_price_real = ind["current_price_real"]
        ema_200_value = ind["ema_200_value"]
        ema_200_slope_pct = ind["ema_200_slope_pct"]
        lower_wick_ratio = ind["lower_wick_ratio"]
        lower_wick_ratio_val = ind["lower_wick_ratio_val"]
        z_score = ind["z_score"]
        atr_14 = ind["atr_14"]
        relative_volume = ind["relative_volume"]

        (
            strategy_metrics,
            net_tp,
            quant_candidate_eligible,
            quant_filter_failures,
            minimum_strategy_net_tp,
        ) = evaluate_strategy_metrics(
            strategy=strategy,
            ind=ind,
            tp=tp,
            sl=sl,
            fee=fee,
            spread=spread,
            min_profit_pct=min_profit_pct,
            round_trip_cost=round_trip_cost,
            net_tp_manual=net_tp,
            df=df,
        )
        tp_gross_pct = strategy_metrics["tp_gross_pct"]
        sl_gross_pct = strategy_metrics["sl_gross_pct"]
        strategy_net_tp = strategy_metrics["tp_net_pct"]
        strategy_net_sl = strategy_metrics["sl_net_pct"]
        is_quant_strategy = strategy != "manual"
        prompt_tp = tp_gross_pct if is_quant_strategy and tp_gross_pct is not None else tp
        prompt_sl = sl_gross_pct if is_quant_strategy and sl_gross_pct is not None else sl
        quant_prompt_block = ""
        expected_sig = strategy_metrics.get("suggested_signal", "COMPRAR")
        if is_quant_strategy and quant_candidate_eligible and not has_position and engine != "local":
            quant_prompt_block = (
                f"\nMODO AUDITOR CUANTITATIVO: Python ya calculó todas las métricas y habilitó una candidata {expected_sig}. "
                "No recalcules métricas ni inventes datos. Tu única autoridad es vetar (responde MANTENER) si ves una "
                "contradicción contextual clara, datos/tesis inconsistentes o riesgo excepcional. No puedes autorizar "
                f"una compra si Python no la habilitó ni cambiar las reglas de costos/riesgo. Si no hay motivo concreto "
                f"para vetar, devuelve {expected_sig}. Devuelve el JSON del formato solicitado.\n"
                f"Métricas deterministas: {strategy_metrics}\n"
            )

        signal = "MANTENER"
        reason = "El mercado está en zona neutral."

        rsi_val = round(latest['rsi'], 2)
        sma20_val = round(latest['sma_20'], 2)
        price_val = round(latest['close'], 2)
        macd_curr = latest['macd_diff']
        macd_prev = previous['macd_diff']
        bb_low = latest['bb_low']
        bb_high = latest['bb_high']
        vwap_val = latest['vwap'] if not pd.isna(latest['vwap']) else price_val

        # La estrategia ATR / Araujo / Chu requiere pasar primero todos los filtros deterministas.
        if strategy == "mean_reversion_atr" and not has_position and not quant_candidate_eligible:
            signal = "MANTENER"
            reason = "Filtro cuantitativo ATR: " + "; ".join(quant_filter_failures)
        elif strategy == "mean_reversion_atr" and not has_position and engine == "local":
            signal = "COMPRAR"
            reason = (
                f"Candidata cuantitativa válida: Z-Score {z_score:.2f}, EMA200 alcista, "
                f"absorción {lower_wick_ratio:.2f}, RVOL {relative_volume:.2f}; "
                f"TP neto estimado +{strategy_net_tp:.3f}% y SL neto {strategy_net_sl:.3f}%."
            )
        elif strategy == "nasdaq_araujo_vwap" and not has_position and not quant_candidate_eligible:
            signal = "MANTENER"
            reason = "Filtro cuantitativo Araujo (VWAP + M15): " + ("; ".join(quant_filter_failures) if quant_filter_failures else "En espera de confluencia.")
        elif strategy == "nasdaq_araujo_vwap" and not has_position and engine == "local":
            signal = expected_sig
            reason = (
                f"Gatillo cuantitativo Araujo ({signal}): Sesión {strategy_metrics.get('bias')}, "
                f"VWAP={strategy_metrics.get('vwap')}, Rango Londres [{strategy_metrics.get('london_low')} - {strategy_metrics.get('london_high')}], "
                f"Extremos M15 [{strategy_metrics.get('m15_low')} - {strategy_metrics.get('m15_high')}]; "
                f"TP neto estimado +{strategy_net_tp:.3f}% y SL neto {strategy_net_sl:.3f}%."
            )
        elif strategy == "hyenuk_chu_multibagger" and not has_position and not quant_candidate_eligible:
            signal = "MANTENER"
            reason = "Filtro cuantitativo Chu (Trend 1h): " + ("; ".join(quant_filter_failures) if quant_filter_failures else "En espera de alineación tendencial.")
        elif strategy == "hyenuk_chu_multibagger" and not has_position and engine == "local":
            signal = expected_sig
            reason = (
                f"Gatillo cuantitativo Chu Trend ({signal}): Precio ${strategy_metrics.get('current_price')} > SMA20 (${strategy_metrics.get('sma_20')}) "
                f"> EMA200 (${strategy_metrics.get('ema_200')}), RSI={strategy_metrics.get('rsi')}, RVOL={strategy_metrics.get('relative_volume')}. "
                f"Hito neto TP +{strategy_net_tp:.2f}% (política Trim) y SL neto {strategy_net_sl:.2f}%."
            )
        elif engine == "local":
            signal, reason = evaluate_local_engine_signal(
                has_position=has_position,
                entry_price=entry_price,
                price_val=price_val,
                vwap_val=vwap_val,
                rsi_val=rsi_val,
                macd_prev=macd_prev,
                macd_curr=macd_curr,
                bb_low=bb_low,
                bb_high=bb_high,
                net_tp=net_tp,
                min_profit_pct=min_profit_pct,
            )

        # --- MOTOR 2: GEMINI AI ---
        elif engine == "ai":
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key or api_key == "tu_clave_aqui_sin_comillas":
                signal = "ERROR"
                reason = "[AVISO] Falta GEMINI_API_KEY en ajustes. IA Desconectada."
            else:
                try:
                    from langchain_google_genai import ChatGoogleGenerativeAI
                    from langchain_core.prompts import PromptTemplate
                    import json

                    gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
                    gemini_temp = 0.0 if is_quant_strategy else 0.2
                    llm = ChatGoogleGenerativeAI(model=gemini_model, google_api_key=api_key, temperature=gemini_temp)


                    # PromptTemplate con llaves escapadas {{ }} en el JSON de ejemplo (Bloque 5 items 1 y 7)
                    prompt_tmpl = PromptTemplate.from_template(
                        "{shared_directives}\n\nEres un Senior Quantitative Trader Institucional operando algorítmicamente.\n"
                        "El usuario opera en velas de {timeframe}, arriesgando el {riesgo}%.\n"
                        "TP (+{tp}%) y SL (-{sl}%) son movimientos BRUTOS de precio. La rentabilidad neta estimada del TP tras costos es +{net_tp}%.\n\n"
                        "COSTOS DEL BROKER:\n"
                        "- Comisión por orden: {fee}%\n"
                        "- Comisión ida y vuelta: {round_trip}%\n"
                        "- Spread estimado por lado: {spread}% (ida y vuelta: {round_trip_spread}%)\n"
                        "- Costo total estimado ida y vuelta: {round_trip_cost}%\n"
                        "- Ganancia neta proyectada al acierto: +{net_tp}%\n\n"
                        "- Beneficio neto mínimo configurado para tomar ganancias: {min_profit_pct}%\n\n"
                        "ESTADO DE POSICIÓN ACTUAL:\n"
                        "- {posicion_info}\n\n"
                        "ESTRUCTURA TÉCNICA DEL ACTIVO {symbol}:\n"
                        "- Precio: ${precio} | VWAP: ${vwap} | EMA200: ${ema_200} (pendiente 5 velas: {ema_200_slope}%) | RSI(14): {rsi} | MACD: {macd}\n"
                        "- Bandas Bollinger: Inf=${bb_low}, Sup=${bb_high} | Mecha inferior de vela cerrada (ratio del rango): {lower_wick_ratio}\n"
                        "- Sentimiento del Mercado: {sentiment}\n\n"
                        "CONTEXTO MACRO:\n{macro}\n\n"
                        "{quant_prompt_block}"
                        "REGLAS ANTI-OVERTRADING:\n"
                        "1. Si ya hay una posición abierta, está PROHIBIDO comprar de nuevo; responde MANTENER o VENDER.\n"
                        "2. Si no hay posición, solo compra si el TP neto estimado alcanza el beneficio neto mínimo configurado ({min_profit_pct}%).\n"
                        "3. Con posición abierta, no propongas una toma de ganancias si el PnL neto positivo no alcanza ese mínimo. Una salida por pérdida/invalidez de tesis sí puede proponerse; nunca retengas una posición para evitar un Stop Loss o cierre de protección.\n\n"
                        "Tu respuesta debe ser EXCLUSIVAMENTE en formato JSON válido estricto sin markdown:\n"
                        '{{"signal": "COMPRAR", "reason": "Justificación concisa"}}'
                    )

                    pos_info = f"Posición ACTIVA ya abierta a ${entry_price}." if has_position else "Sin posición abierta (100% liquidez)."
                    chain = prompt_tmpl | llm
                    respuesta = chain.invoke({
                        "shared_directives": shared_directives,
                        "timeframe": timeframe,
                        "riesgo": int(risk * 100),
                        "tp": prompt_tp,
                        "sl": prompt_sl,
                        "fee": fee,
                        "round_trip": round_trip_fee,
                        "spread": spread,
                        "round_trip_spread": round_trip_spread,
                        "round_trip_cost": round_trip_cost,
                        "net_tp": net_tp,
                        "min_profit_pct": min_profit_pct,
                        "posicion_info": pos_info,
                        "symbol": symbol,
                        "precio": price_val,
                        "vwap": round(latest['vwap'], 2) if not pd.isna(latest['vwap']) else "N/A",
                        "ema_200": round(ema_200_value, 2) if ema_200_value is not None else "N/A",
                        "ema_200_slope": round(ema_200_slope_pct, 4) if ema_200_slope_pct is not None else "N/A",
                        "rsi": rsi_val,
                        "macd": round(latest['macd_diff'], 2) if not pd.isna(latest['macd_diff']) else "N/A",
                        "lower_wick_ratio": lower_wick_ratio_val,
                        "bb_low": round(bb_low, 2) if not pd.isna(bb_low) else "N/A",
                        "bb_high": round(bb_high, 2) if not pd.isna(bb_high) else "N/A",
                        "sentiment": sentiment,
                        "macro": build_macro_directive(macro),
                        "quant_prompt_block": quant_prompt_block,
                    })

                    # Manejo de respuesta.content si es lista o string (Bloque 5 item 1)
                    if isinstance(respuesta.content, list):
                        content_str = "".join([str(p.get("text", p)) if isinstance(p, dict) else str(p) for p in respuesta.content]).strip()
                    else:
                        content_str = str(respuesta.content).strip()

                    json_match = re.search(r'\{.*\}', content_str, re.DOTALL)
                    if json_match:
                        ia_decision = json.loads(json_match.group(0))
                        signal = normalize_signal(ia_decision.get("signal", "MANTENER"))
                        reason = str(ia_decision.get("reason", "Decisión procesada por Gemini."))
                    else:
                        signal = "MANTENER"
                        reason = "Gemini no devolvió una estructura JSON válida."
                except Exception as e:
                    signal = "ERROR"
                    reason = f"Error en el Agente Gemini: {str(e)}"

        # --- MOTOR 3: DEEPSEEK (VÍA OLLAMA) CON OLLAMA_LOCK (Bloque 5 item 2) ---
        elif engine == "deepseek":
            import requests
            import json

            acquired = OLLAMA_LOCK.acquire(timeout=100)
            if not acquired:
                signal = "ERROR"
                reason = "Ollama ocupado."
            else:
                try:
                    pos_info = f"Posición abierta a ${entry_price}." if has_position else "Sin posición previa."
                    macro_block = build_macro_directive(macro)
                    prompt_text = f'''
                    DIRECTIVAS CANÓNICAS COMPARTIDAS:
                    {shared_directives}

                    Eres un Senior Quantitative Trader Institucional operando algorítmicamente.
                    Mercado: {symbol}. Velas: {timeframe}. Riesgo: {int(risk * 100)}%. TP bruto: +{prompt_tp}% de precio. SL bruto: -{prompt_sl}% de precio.
                    Comisión: {fee}% por orden ({round_trip_fee}% ida y vuelta). Spread estimado: {spread}% por lado ({round_trip_spread}% ida y vuelta).
                    Costo total estimado ida y vuelta: {round_trip_cost}%. Ganancia neta estimada al TP: +{net_tp}%.
                    Beneficio neto mínimo configurado para tomar ganancias: {min_profit_pct}%.
                    Estado de Posición: {pos_info}

                    DATOS TÉCNICOS:
                    - Precio: ${price_val} | VWAP: ${round(vwap_val, 2) if not pd.isna(vwap_val) else "N/A"} | EMA200: ${round(ema_200_value, 2) if ema_200_value is not None else "N/A"} (pendiente 5 velas: {round(ema_200_slope_pct, 4) if ema_200_slope_pct is not None else "N/A"}%) | RSI: {rsi_val}
                    - MACD: {round(latest['macd_diff'], 2) if not pd.isna(latest['macd_diff']) else "N/A"}
                    - Bollinger: Inf=${round(bb_low, 2) if not pd.isna(bb_low) else "N/A"}, Sup=${round(bb_high, 2) if not pd.isna(bb_high) else "N/A"}
                    - Mecha inferior de la vela cerrada (ratio del rango): {lower_wick_ratio_val}
                    - Sentimiento: {sentiment}

                    CONTEXTO MACRO:
                    {macro_block}
                    {quant_prompt_block}

                    REGLA ESTRICTA ANTI-OVERTRADING:
                    - Con posición abierta: NO compres de nuevo; responde [MANTENER] o [VENDER].
                    - Sin posición: exige que el TP neto alcance {min_profit_pct}%.
                    - Con posición: no tomes ganancias con PnL neto positivo inferior a {min_profit_pct}%; sí puedes vender para salir de una tesis invalidada o limitar pérdidas. Nunca ignores un Stop Loss o cierre de protección.

                    DIRECTIVA DE PENSAMIENTO LINEAL Y TIEMPO ACOTADO:
                    1. Formula tu premisa técnica y cuantitativa en máximo 150 palabras.
                    2. Extrae una conclusión intermedia directa sin dudar ni reiniciar el razonamiento.
                    3. Si hay duda, contradicción o bajo ratio riesgo/beneficio, concluye inmediatamente MANTENER.

                    Al final de tu respuesta, da tu veredicto usando OBLIGATORIAMENTE entre corchetes:
                    [COMPRAR] o [VENDER] o [MANTENER]
                    '''

                    ds_temp = 0.0 if is_quant_strategy else 0.1
                    payload = {
                        "model": "trader-deepseek",
                        "prompt": prompt_text,
                        "stream": False,
                        "options": {
                            "num_predict": 700,
                            "temperature": ds_temp,
                            "repeat_penalty": 1.15
                        }
                    }
                    res = requests.post("http://localhost:11434/api/generate", json=payload, timeout=90)
                    if res.status_code == 200:
                        data = res.json()
                        resp_text = data.get("response", "").strip()
                        think_text = data.get("thinking", "").strip()

                        # 1. Limpieza de think tags si están incrustadas en response
                        clean_text = re.sub(r'<think>.*?</think>', '', resp_text, flags=re.DOTALL | re.IGNORECASE).strip()
                        target_text = clean_text if clean_text else resp_text

                        matches = re.findall(r'\[(COMPRAR|VENDER|MANTENER)\]', target_text, flags=re.IGNORECASE)
                        if not matches:
                            matches = re.findall(r'\b(COMPRAR|VENDER|MANTENER)\b', target_text, flags=re.IGNORECASE)

                        # 2. Dual-Catch: Si response vino vacío (se cortó durante el thinking), rescatar veredicto del thinking
                        if not matches and think_text:
                            think_matches = re.findall(r'\[(COMPRAR|VENDER|MANTENER)\]', think_text, flags=re.IGNORECASE)
                            if not think_matches:
                                think_matches = re.findall(r'\b(COMPRAR|VENDER|MANTENER)\b', think_text, flags=re.IGNORECASE)
                            if think_matches:
                                matches = think_matches
                                target_text = f"[Veredicto en razonamiento]: {think_text[-250:]}"

                        if matches:
                            signal = normalize_signal(matches[-1])
                        else:
                            signal = "MANTENER"

                        display_reason = target_text if target_text else (think_text[-250:] if think_text else "Conclusión: MANTENER por preservación de capital.")
                        reason = display_reason[:300] + "..." if len(display_reason) > 300 else display_reason
                    else:
                        signal = "ERROR"
                        reason = "Error del servidor Ollama (DeepSeek)."
                except requests.exceptions.Timeout:
                    signal = "MANTENER"
                    reason = "DeepSeek superó el tiempo máximo (90s). Veredicto de seguridad: MANTENER."
                except Exception as e:
                    signal = "ERROR"
                    reason = f"DeepSeek no responde: {str(e)}"
                finally:
                    OLLAMA_LOCK.release()

        # --- MOTOR 4: OLLAMA CON OLLAMA_LOCK (Bloque 5 item 2) ---
        elif engine == "ollama":
            import requests
            import json

            acquired = OLLAMA_LOCK.acquire(timeout=100)
            if not acquired:
                signal = "ERROR"
                reason = "Ollama ocupado."
            else:
                try:
                    pos_info = f"Posición abierta a ${entry_price}." if has_position else "Sin posición."
                    macro_block = build_macro_directive(macro)
                    prompt_text = f'''
                    DIRECTIVAS CANÓNICAS COMPARTIDAS:
                    {shared_directives}

                    Eres un Senior Quantitative Trader Institucional operando algorítmicamente.
                    Mercado: {symbol}. Velas: {timeframe}. Riesgo: {int(risk * 100)}%. TP bruto: +{prompt_tp}% de precio. SL bruto: -{prompt_sl}% de precio.
                    Comisión: {fee}% por orden ({round_trip_fee}% ida y vuelta). Spread estimado: {spread}% por lado ({round_trip_spread}% ida y vuelta).
                    Costo total estimado ida y vuelta: {round_trip_cost}%. Ganancia neta estimada al TP: +{net_tp}%.
                    Beneficio neto mínimo configurado para tomar ganancias: {min_profit_pct}%.
                    Estado de Posición: {pos_info}

                    DATOS TÉCNICOS:
                    - Precio: ${price_val} | VWAP: ${round(vwap_val, 2) if not pd.isna(vwap_val) else "N/A"} | EMA200: ${round(ema_200_value, 2) if ema_200_value is not None else "N/A"} (pendiente 5 velas: {round(ema_200_slope_pct, 4) if ema_200_slope_pct is not None else "N/A"}%) | RSI: {rsi_val}
                    - MACD: {round(latest['macd_diff'], 2) if not pd.isna(latest['macd_diff']) else "N/A"}
                    - Bollinger: Inf=${round(bb_low, 2) if not pd.isna(bb_low) else "N/A"}, Sup=${round(bb_high, 2) if not pd.isna(bb_high) else "N/A"}
                    - Mecha inferior de la vela cerrada (ratio del rango): {lower_wick_ratio_val}
                    - Sentimiento: {sentiment}

                    CONTEXTO MACRO:
                    {macro_block}
                    {quant_prompt_block}

                    REGLA ANTI-OVERTRADING:
                    - Con posición abierta, responde MANTENER o VENDER. Prohibido COMPRAR.
                    - Sin posición, exige que el TP neto alcance {min_profit_pct}%.
                    - Con posición, no tomes ganancias con PnL neto positivo inferior a {min_profit_pct}%; sí puedes vender para salir de una tesis invalidada o limitar pérdidas. Nunca ignores un Stop Loss o cierre de protección.

                    Responde EXCLUSIVAMENTE con este formato JSON y NADA MAS:
                    {{"signal": "COMPRAR", "reason": "Justificacion breve combinando datos y contexto."}}
                    '''

                    payload = {
                        "model": model or (_read_brain_state().get("model") if engine == "ollama" else None) or "trader-ia",
                        "system": shared_directives,
                        "prompt": prompt_text,
                        "stream": False,
                        "format": "json"
                    }
                    if is_quant_strategy:
                        payload["options"] = {"temperature": 0.0}

                    res = requests.post("http://localhost:11434/api/generate", json=payload, timeout=110)
                    if res.status_code == 200:
                        respuesta = res.json().get("response", "")
                        json_match = re.search(r'\{.*\}', respuesta, re.DOTALL)
                        if json_match:
                            ia_decision = json.loads(json_match.group(0))
                            signal = normalize_signal(ia_decision.get("signal", "MANTENER"))
                            reason = str(ia_decision.get("reason", "Decisión procesada por Ollama."))
                        else:
                            signal = "MANTENER"
                            reason = "Ollama no devolvió una estructura JSON válida."
                    else:
                        signal = "ERROR"
                        reason = "Error del servidor Ollama."
                except requests.exceptions.Timeout:
                    signal = "ERROR"
                    reason = "Timeout del motor Ollama (110s)."
                except Exception as e:
                    signal = "ERROR"
                    reason = f"Ollama no responde: {str(e)}"
                finally:
                    OLLAMA_LOCK.release()

        # --- MOTOR 5: QWEN 2.5 (VÍA OLLAMA) CON OLLAMA_LOCK ---
        elif engine == "qwen":
            import requests
            import json

            acquired = OLLAMA_LOCK.acquire(timeout=60)
            if not acquired:
                signal = "ERROR"
                reason = "Ollama ocupado."
            else:
                try:
                    pos_info = f"Posición abierta a ${entry_price}." if has_position else "Sin posición."
                    macro_block = build_macro_directive(macro)
                    prompt_text = f'''
                    DIRECTIVAS CANÓNICAS COMPARTIDAS:
                    {shared_directives}

                    Eres un Senior Quantitative Trader Institucional operando algorítmicamente.
                    Mercado: {symbol}. Velas: {timeframe}. Riesgo: {int(risk * 100)}%. TP bruto: +{prompt_tp}% de precio. SL bruto: -{prompt_sl}% de precio.
                    Comisión: {fee}% por orden ({round_trip_fee}% ida y vuelta). Spread estimado: {spread}% por lado ({round_trip_spread}% ida y vuelta).
                    Costo total estimado ida y vuelta: {round_trip_cost}%. Ganancia neta estimada al TP: +{net_tp}%.
                    Beneficio neto mínimo configurado para tomar ganancias: {min_profit_pct}%.
                    Estado de Posición: {pos_info}

                    DATOS TÉCNICOS:
                    - Precio: ${price_val} | VWAP: ${round(vwap_val, 2) if not pd.isna(vwap_val) else "N/A"} | EMA200: ${round(ema_200_value, 2) if ema_200_value is not None else "N/A"} (pendiente 5 velas: {round(ema_200_slope_pct, 4) if ema_200_slope_pct is not None else "N/A"}%) | RSI: {rsi_val}
                    - MACD: {round(latest['macd_diff'], 2) if not pd.isna(latest['macd_diff']) else "N/A"}
                    - Bollinger: Inf=${round(bb_low, 2) if not pd.isna(bb_low) else "N/A"}, Sup=${round(bb_high, 2) if not pd.isna(bb_high) else "N/A"}
                    - Mecha inferior de la vela cerrada (ratio del rango): {lower_wick_ratio_val}
                    - Sentimiento: {sentiment}

                    CONTEXTO MACRO:
                    {macro_block}
                    {quant_prompt_block}

                    REGLAS ANTI-OVERTRADING:
                    - Si hay posición abierta, responde MANTENER o VENDER. Prohibido COMPRAR con posición abierta.
                    - Si no hay posición, compra solo si el TP neto alcanza el beneficio neto mínimo ({min_profit_pct}%).
                    - Con posición, no tomes ganancias con PnL neto positivo inferior a {min_profit_pct}%; sí puedes vender para salir de una tesis invalidada o limitar pérdidas. Nunca ignores un Stop Loss o cierre de protección.

                    Responde EXCLUSIVAMENTE con este formato JSON y NADA MAS:
                    {{"signal": "COMPRAR", "reason": "Justificacion breve combinando datos y contexto."}}
                    '''

                    payload = {
                        "model": "trader-qwen",
                        "prompt": prompt_text,
                        "stream": False,
                        "format": "json"
                    }
                    if is_quant_strategy:
                        payload["options"] = {"temperature": 0.0}
                    res = requests.post("http://localhost:11434/api/generate", json=payload, timeout=60)
                    if res.status_code == 404:
                        payload["model"] = "qwen2.5:3b"
                        res = requests.post("http://localhost:11434/api/generate", json=payload, timeout=60)

                    if res.status_code == 200:
                        respuesta = res.json().get("response", "")
                        json_match = re.search(r'\{.*\}', respuesta, re.DOTALL)
                        if json_match:
                            ia_decision = json.loads(json_match.group(0))
                            signal = normalize_signal(ia_decision.get("signal", "MANTENER"))
                            reason = str(ia_decision.get("reason", "Decisión procesada por Qwen 2.5."))
                        else:
                            signal = "MANTENER"
                            reason = "Qwen no devolvió una estructura JSON válida."
                    else:
                        signal = "ERROR"
                        reason = f"Error del servidor Ollama (Qwen): HTTP {res.status_code}."
                except requests.exceptions.Timeout:
                    signal = "ERROR"
                    reason = "Timeout del motor Qwen (60s)."
                except Exception as e:
                    signal = "ERROR"
                    reason = f"Qwen no responde: {str(e)}"
                finally:
                    OLLAMA_LOCK.release()

        # Red de seguridad final en servidor contra DCA / overtrading
        if signal != "ERROR":
            signal = normalize_signal(signal)
            if has_position and signal == "COMPRAR":
                signal = "MANTENER"
                reason = "Servidor: posición abierta detectada, compras bloqueadas para evitar overtrading/DCA."
            elif not has_position and signal == "VENDER":
                signal = "MANTENER"
                reason = "Servidor: sin posición abierta, venta ignorada."
        if (
            is_quant_strategy
            and not has_position
            and quant_candidate_eligible
        ):
            target_signal = strategy_metrics.get("suggested_signal", "COMPRAR")
            if signal != target_signal:
                fail_safe_detail = reason if signal == "ERROR" else "El auditor de IA vetó o no confirmó la candidata cuantitativa."
                signal = "MANTENER"
                reason = f"Auditor de IA (Veto / Fail-Safe): {fail_safe_detail}"


        return {
            "symbol": symbol,
            "strategy": strategy,
            "signal": signal,
            "reason": reason,
            "data_age_s": last_candle_age_s,
            "signal_candle_ts": signal_candle_ts,
            "fee_info": {
                "fee_per_order": fee,
                "round_trip_fee": round_trip_fee,
                "spread_per_side": spread,
                "round_trip_spread": round_trip_spread,
                "round_trip_cost": round_trip_cost,
                "net_tp": net_tp,
                "min_profit_pct": min_profit_pct,
                "viable": net_tp >= minimum_strategy_net_tp
            },
            "indicators": {
                "rsi": round(latest['rsi'], 2) if not pd.isna(latest['rsi']) else None,
                "sma_20": round(latest['sma_20'], 2) if not pd.isna(latest['sma_20']) else None,
                "sma_50": round(latest['sma_50'], 2) if not pd.isna(latest['sma_50']) else None,
                "ema_200": ema_200_value,
                "ema_200_slope_pct": ema_200_slope_pct,
                "current_price": current_price_real,
                "z_score": strategy_metrics.get("z_score"),
                "atr_14": strategy_metrics.get("atr_14"),
                "relative_volume": strategy_metrics.get("relative_volume"),
                "lower_wick_ratio": lower_wick_ratio
            },
            "strategy_metrics": strategy_metrics,
            "latest_candle": {
                "time": int(latest['timestamp'] / 1000),
                "open": latest['open'],
                "high": latest['high'],
                "low": latest['low'],
                "close": latest['close']
            }
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

# --- REGISTRO DE TRADES EN CSV CON MIGRACIÓN DE ENCABEZADO ANTIGUO (Bloque 5 item 9) ---
class TradeLogRequest(BaseModel):
    timeString: str = Field(min_length=1, max_length=64)
    symbol: str = Field(min_length=1, max_length=30)
    signal: str = Field(min_length=1, max_length=30)
    price: float = Field(gt=0, allow_inf_nan=False)
    status: str = Field(min_length=1, max_length=40)
    mode: str = Field(min_length=1, max_length=40)
    qty: float = Field(default=0.0, ge=0, allow_inf_nan=False)
    fee: float = Field(default=0.0, ge=0, allow_inf_nan=False)
    session_id: int = Field(default=1, ge=1)

@app.post("/api/log_trade")
def log_trade(trade: TradeLogRequest, request: Request, x_api_token: Optional[str] = Header(None)):
    verify_auth_token(request, x_api_token)
    with CSV_LOCK:
        try:
            if os.path.isfile(CSV_FILE_PATH):
                with open(CSV_FILE_PATH, "r", encoding="utf-8") as f:
                    first_line = f.readline().strip()
                # Si el archivo tiene formato legacy (6 columnas o sin SessionId), migrarlo
                cols = [c.strip() for c in first_line.split(",")]
                if len(cols) == 6 or "SessionId" not in first_line:
                    try:
                        os.replace(CSV_FILE_PATH, CSV_LEGACY_PATH)
                    except Exception as m_err:
                        print(f"Aviso migrando CSV legacy: {m_err}")

            file_exists = os.path.isfile(CSV_FILE_PATH)
            with open(CSV_FILE_PATH, mode='a', newline='', encoding='utf-8') as file:
                writer = csv.writer(file)
                if not file_exists:
                    writer.writerow(["Time", "Symbol", "Signal", "Price", "Qty", "Fee", "Status", "Mode", "SessionId"])
                writer.writerow([trade.timeString, trade.symbol, trade.signal, trade.price, trade.qty, trade.fee, trade.status, trade.mode, trade.session_id])
            return {"status": "success", "message": "Trade logged successfully"}
        except Exception as e:
            raise HTTPException(status_code=500, detail="No se pudo guardar el registro de la operación.") from e


# --- ENDPOINTS CONTABLES DE DOBLE PARTIDA Y CUENTAS ÓMNIBUS (SQLite) ---
@app.get("/api/ledger/state")
def get_ledger_state(request: Request, x_api_token: Optional[str] = Header(None)):
    """
    Expone el estado contable de doble partida en SQLite:
    Bóveda (VAULT), Billeteras Operativas (OPERATIONAL en $0.00 en reposo),
    posiciones abiertas, integridad contable y estado del Circuit Breaker por divisa.
    """
    verify_auth_token(request, x_api_token)
    from backend.db.ledger import get_default_ledger, SUPPORTED_CURRENCIES

    ledger = get_default_ledger()
    balances = ledger.get_omnibus_balances()
    integrity = ledger.verify_double_entry_integrity()
    risk_by_currency = {
        curr: ledger.check_circuit_breaker(curr) for curr in SUPPORTED_CURRENCIES
    }
    return {
        "status": "ok",
        "balances": balances,
        "open_positions": ledger.get_open_positions(),
        "risk_state": risk_by_currency,
        "double_entry_integrity": integrity,
    }


@app.post("/api/ledger/reset_circuit_breaker")
def reset_ledger_circuit_breaker(
    request: Request,
    currency: Optional[str] = None,
    x_api_token: Optional[str] = Header(None),
):
    """Permite al operador reiniciar el Circuit Breaker transaccional en SQLite."""
    verify_auth_token(request, x_api_token)
    from backend.db.ledger import get_default_ledger, SUPPORTED_CURRENCIES

    if currency and currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail=f"Divisa no soportada: {currency}")
    ledger = get_default_ledger()
    ledger.reset_circuit_breaker(currency)
    return {
        "status": "ok",
        "message": f"Circuit Breaker reiniciado para {currency or 'todas las divisas'}.",
    }


if __name__ == "__main__":
    import uvicorn
    # Arranque estandarizado backend.main:app (Bloque 5 item 8)
    uvicorn.run("backend.main:app", host="127.0.0.1", port=18767, reload=False)

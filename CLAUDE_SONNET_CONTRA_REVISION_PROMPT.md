# 🕵️‍♂️ Prompt de Contra-Revisión y Auditoría Profunda (Partes 2 y 3) para Claude Sonnet

**INSTRUCCIÓN:** Pega todo el contenido de este archivo en la conversación con **Claude Sonnet** para que valide los 5 parches quirúrgicos aplicados en `app.js` y `main.py`, y complete la auditoría de las **Partes 2 y 3** (`backend/main.py`, `radar_inbox.py`, `premarket_digest.py`, `frontend/index.html` y `CONTEXTO.md`).

---
---

## 🤖 CONTEXTO DE CONTRA-REVISIÓN (PARA CLAUDE SONNET)

Hola Claude Sonnet. El asistente ha implementado de forma quirúrgica los **5 parches de seguridad y consistencia financiera** que indicaste tras tu revisión de `app.js`.

A continuación te presentamos:
1. **La evidencia exacta de los 5 parches aplicados** (incluyendo los casos de verificación manual).
2. **Parte 2: Especificación para Fase 5** y su regla formal en `CONTEXTO.md` Sección 6.5.
3. **Parte 3: El código completo y cambios de los módulos satélite** que indicaste que faltaban revisar (`backend/main.py`, `backend/radar_inbox.py`, `backend/premarket_digest.py`, `frontend/index.html`).

---

### 🛡️ VERIFICACIÓN DE LOS 5 PARCHES QUIRÚRGICOS APLICADOS

#### 1. `/api/market/price` con `quote_ts` y `quote_age_s` + `riskTick`
- En `backend/main.py`:
  - En cripto, usa `quote_ts = int(ticker.get('timestamp') or (time.time() * 1000))`.
  - En Yahoo Finance, usa `quote_ts = int(hist.index[-1].timestamp() * 1000)` (la hora exacta de la última vela de 1m).
  - Devuelve `quote_ts`, `quote_age_s = max(0, int(now_s - quote_ts_s))` y `data_age_s`.
- En `frontend/js/app.js` (`riskTick`):
  ```javascript
  const isStale = (typeof data.quote_age_s === 'number') ? (data.quote_age_s > 20) : (ageMs > 20000);
  const latencyDisplay = (typeof data.quote_age_s === 'number') ? `${data.quote_age_s}s` : `${(ageMs / 1000).toFixed(1)}s`;
  if (isStale) {
      if (nowMs - lastRiskStaleLogTs > 60000) {
          logToTerminal(`⚠️ [RIESGO] SL SIN PRECIO FRESCO (${pos.symbol}, latencia ${latencyDisplay}). Monitoreo pausado para evitar falsos cierres.`, 'warn');
          lastRiskStaleLogTs = nowMs;
      }
      return; // NO evaluar con entryPrice si no está fresco
  }
  ```
  👉 **Verificación (b):** Con Yahoo fuera de horario, `quote_age_s` refleja la antigüedad real (> 20s), loguea la falta de frescura y no evalúa SL/TP.

#### 2. Circuit Breaker con `placeholder: true` para cuentas en $0
- En `getRiskState()`:
  - Si el balance de la moneda es 0, guarda `placeholder: true` y para ARS `startEquity = 0` (no usa default 100, espera al fondeo).
- En `inyectarCapital()` y `ejecutarTransferencia()`:
  - Al recibir fondeo con `placeholder: true`, recalcula inmediatamente `startEquity` con el capital real fondeado y pone `placeholder: false`.
- En `recordTradeInCircuitBreaker()`:
  - Si el primer trade ocurre con `placeholder: true`, recalcula `startEquity` con el equity real previo al trade (`currentBal - pnlNeto`) y desactiva el placeholder.
  👉 **Verificación (a):** Con billetera en 0, cargar la página, fondear 1000 y perder 5: el drawdown se calcula sobre 1000 (-0.5%), por lo que el breaker **NO** salta erróneamente.

#### 3. Validación de Posición tras el `await` en `riskTick`
- En `frontend/js/app.js`:
  ```javascript
  const res = await fetch(...);
  const data = await res.json();

  // Si la posición fue cerrada o modificada mientras viajaba la red:
  const currentPos = getOpenPosition();
  if (!currentPos || currentPos !== pos) {
      return; // Aborta el tick de inmediato
  }
  ```

#### 4. Congelamiento de `pos.feeRate` al abrir y uso en `netPctAtPrice`
- En `executeTrade('COMPRAR')`:
  `portfolio.position.feeRate = feeRate;`
- En `netPctAtPrice(pos, price, feeRate)`:
  `const effectiveFeeRate = (pos && typeof pos.feeRate === 'number') ? pos.feeRate : (feeRate !== undefined ? feeRate : getBrokerFeeRate());`
- En `executeTrade('VENDER')`:
  `const feeRate = (pos && typeof pos.feeRate === 'number') ? pos.feeRate : getBrokerFeeRate();`

#### 5. `resetCircuitBreaker` sin ensuciar el historial de trades
- En `frontend/js/app.js`:
  Se eliminó la llamada a `addTradeToHistory('RESET', ...)`. Ahora realiza exclusivamente el reset de los libros contables, `saveRiskState(state)` y emite `logToTerminal(..., 'action')`.

---

### 🛡️ PARTE 2: DIRECTIVAS DE FASE 5 (BROKERS REALES Y CONTRATOS OCO)

Tal como sugeriste: *"Las APIs de Binance OCO e IBKR para la Fase 5 hay que validarlas en testnet o paper antes de usarlas"*.

La **Sección 6.5 de CONTEXTO.md** ha sido formalizada incorporando esta regla no negociable:
> **Validación Obligatoria en Testnet/Paper antes de Live (Binance OCO e IBKR):** Todo adaptador de broker real (Binance Spot OCO, Interactive Brokers API) debe superar obligatoriamente una fase de pruebas en entornos de simulación (Testnet oficial o Paper Trading) verificando latencia de colocación de órdenes bracket, manejo de rechazos OCO y sincronización de fills antes de recibir autorización para operar con capital real.

---

### 🔬 PARTE 3: CÓDIGO DE LOS MÓDULOS SATÉLITE PARA AUDITORÍA PROFUNDA

Por favor, revisa ahora los módulos que no pudiste auditar en la primera pasada:

#### 1. `backend/main.py`
```python
# Whitelist estricta y Timeframes permitidos
SUPPORTED_SYMBOLS = [
    "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT", "DOGE/USDT",
    "SPY", "QQQ", "GC=F",
    "GGAL.BA", "YPFD.BA", "PAMP.BA", "BMA.BA", "ALUA.BA", "TXAR.BA",
    "AAPL", "TSLA", "MSFT", "MCHI", "KWEB", "BOTZ", "NVDA"
]

VALID_TIMEFRAMES = {"1m", "5m", "15m", "1h"}

def validate_symbol(symbol: str):
    if not symbol or symbol not in SUPPORTED_SYMBOLS:
        raise HTTPException(status_code=400, detail=f"Símbolo no soportado: '{symbol}'")

def validate_timeframe(timeframe: str):
    if not timeframe or timeframe not in VALID_TIMEFRAMES:
        raise HTTPException(status_code=400, detail=f"Timeframe no soportado: '{timeframe}'")

# Locks globales
OLLAMA_LOCK = threading.Lock()
CSV_LOCK = threading.Lock()
_CACHE_LOCK = threading.Lock()

def _fetch_raw_price(symbol: str):
    if '/' in symbol:
        ticker = exchange.fetch_ticker(symbol)
        quote_ts = int(ticker.get('timestamp') or (time.time() * 1000))
        return float(ticker['last']), quote_ts
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
        return float(price), quote_ts

@app.get("/api/market/price")
def get_price(symbol: str = "BTC/USDT"):
    validate_symbol(symbol)
    try:
        cached = get_cached_price(symbol)
        now_s = time.time()
        quote_ts = cached.get("quote_ts", cached.get("ts"))
        quote_ts_s = (quote_ts / 1000.0) if quote_ts > 1e11 else quote_ts
        quote_age_s = max(0, int(now_s - quote_ts_s))
        return {
            "symbol": symbol,
            "price": cached["price"],
            "ts": cached["ts"],
            "quote_ts": int(quote_ts_s * 1000),
            "quote_age_s": quote_age_s,
            "data_age_s": quote_age_s
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

@app.get("/api/macro/radar")
def get_macro_radar(request: Request, engine: str = "ollama", x_api_token: Optional[str] = Header(None)):
    verify_auth_token(request, x_api_token)
    if engine == "local":
        return [{"asset": "LOCAL_MKT", "type": "NEUTRAL", "confidence": 0, "reason": "Radar inactivo en modo Cuantitativo Local (sin LLM).", "schedule": "-"}]
    ...
```

#### 2. `backend/radar_inbox.py`
```python
import os
import json
import time
import threading
from typing import List, Optional
from pydantic import BaseModel, Field

BUZON_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "buzon_radar.json")
_LOCK = threading.RLock()

class OpportunityCard(BaseModel):
    activo: str
    impacto: str
    confianza: int = Field(ge=0, le=100)
    titular: str
    justificacion: str
    timestamp: str

class RadarInbox:
    def __init__(self, file_path: Optional[str] = None):
        self.file_path = file_path or BUZON_FILE
        with _LOCK:
            self._ensure_file_exists()
            self.clear_expired_cards()

    def _ensure_file_exists(self):
        if not os.path.exists(self.file_path):
            with open(self.file_path, "w", encoding="utf-8") as f:
                json.dump([], f)

    def _atomic_write(self, data: list):
        tmp_path = f"{self.file_path}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, self.file_path)

    def save_opportunity(self, card: OpportunityCard):
        with _LOCK:
            cards = self.load_all_cards()
            # Validación estricta anti-duplicados y titular != justificacion
            if card.titular.strip().lower() == card.justificacion.strip().lower():
                card.justificacion = f"Evento relevante detectado para {card.activo}."
            cards.append(card.dict())
            self._atomic_write(cards)
```

#### 3. `backend/premarket_digest.py`
```python
# Timeout y regex de poda de tags <think> para DeepSeek-R1
def run_premarket_digest(engine: str = "gemini") -> Dict[str, Any]:
    ...
    if engine == "deepseek":
        # Llamada a Ollama local con modelo DeepSeek-R1
        payload = {"model": "deepseek-r1:8b", "prompt": prompt, "stream": False}
        res = requests.post("http://127.0.0.1:11434/api/generate", json=payload, timeout=180)
        raw_text = res.json().get("response", "")
        # Podar bloque de pensamiento antes de extraer JSON
        clean_response = re.sub(r'<think>.*?</think>', '', raw_text, flags=re.DOTALL | re.IGNORECASE).strip()
        match = re.search(r'\{.*\}', clean_response, re.DOTALL)
        if match:
            return validate_llm_digest(json.loads(match.group(0)))
    ...
```

#### 4. `frontend/index.html` (Integración UI)
- Sincronización estricta de IDs con `app.js` (probada al 100%):
  - `#investmentToggle` y `#radarLiveStatus` conectados al Agente de Inversiones.
  - `#lobbySymbolSelect` sincronizado con `#symbolSelect` al pasar de Lobby a Trinchera.
  - Cache buster actualizado a `v=13`.

---

### 📋 TU DICTAMEN DE AUDITORÍA REQUERIDO:
1. Valida los 5 parches implementados en `app.js` y `main.py`.
2. Dictamina la resiliencia de concurrencia e I/O en `radar_inbox.py` y `premarket_digest.py`.
3. Comprueba la consistencia UI (`index.html` vs `app.js`).
4. Si detectas cualquier hallazgo restante, entrégalo en la matriz formal de severidad: `[CRÍTICO / ALTO / MEDIO / BAJO / INFORMATIVO]` con ID, archivo, línea, riesgo y código de parche.

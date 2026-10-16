# Prompt Maestro para el Proyecto "Monitor del Mercado" (`monitor del mercado`)

Copia y pega el siguiente bloque completo en el chat de tu proyecto **Monitor del Mercado** (`/home/raul/Escritorio/proyectos/monitor del mercado`) para que el asistente de ese repositorio entienda cómo se conecta con `trading_ollama`, audite su pipeline de recolección/IA e implemente todas las mejoras (incluyendo el selector de motor **Ollama Local vs. Antigravity CIO**).

---

```markdown
Actúa como Arquitecto Cuantitativo Senior e Ingeniero de Sistemas Distribuídos.

Este proyecto (`monitor del mercado`, corriendo en el puerto `18087`) funciona como el **Radar Macro y Satélite de Inteligencia Contrarian** de mi sistema principal de ejecución algorítmica: **`trading_ollama`** (ubicado en `/home/raul/Escritorio/proyectos/trading_ollama`, corriendo en `http://127.0.0.1:18767`).

Acabamos de auditar ambos proyectos de extremo a extremo. Necesito que comprendas cómo está integrado este Monitor con `trading_ollama`, revises cómo la IA de este proyecto recolecta y evalúa la información actualmente, y ejecutes un plan de 6 mejoras concretas.

---

## PARTE 1: CÓMO ESTÁ INTEGRADO ESTE PROYECTO CON `trading_ollama` Y OLLAMA

1. **Puente HTTP Directo (`POST http://127.0.0.1:18767/api/macro/inject`):**
   - En `src/dashboard/server.py` (`_handle_inject_to_trading_bot`) y `web/app.js` (`injectToTradingBot` y `autoInjectReport`), este Monitor envía oportunidades y alertas hacia `trading_ollama`.
   - `trading_ollama` valida el esquema `MacroInjectionRequest`:
     - `asset`: string (`^[A-Za-z0-9_=./^\-]+$`)
     - `text`: string (tesis macro/contrarian)
     - `confidence`: float (`0` a `100`)
     - `type`: `"Oportunidad"` | `"Peligro"` | `"Neutral"`
     - `source`: `"Monitor del Mercado"`, `"Monitor del Mercado (Auto)"` o `"Antigravity CIO"`
     - `timestamp`: ISO-8601 con zona horaria.
     - `id`: UUID o identificador único.
   - Si en `trading_ollama` está configurada la variable de entorno `APP_SECRET_TOKEN` (o `APP_TOKEN`), el endpoint `/api/macro/inject` exige el header `X-API-Token`. Actualmente `src/dashboard/server.py` NO envía ese header.

2. **Buzón Satélite Persistente (`buzon_radar.json`) y Auto-Promoción:**
   - Cada inyección recibida por `trading_ollama` se guarda en `buzon_radar.json` con un TTL de 24 horas.
   - El endpoint `GET /api/macro/current_injected` y el guardia frontend `trading_guards.js` (`isEligibleMacroDirective` + `matchDirectiveSymbol`) de `trading_ollama` solo promueven directivas para operar automáticamente cuando:
     - `type` es `"Oportunidad"` o `"Positivo"` (las alertas de `"Peligro"` NO abren cortos, ya que `trading_ollama` es *Long-Only* en su arquitectura actual de Cuentas Ómnibus).
     - `confidence >= 80`.
     - Antigüedad `<= 24 horas`.
     - `asset` coincide sin ambigüedad con los símbolos soportados en `trading_ollama`.

3. **Universo Oficial de Activos Operables en `trading_ollama` (`SUPPORTED_SYMBOLS`):**
   - **Cripto:** `BTC/USDT`, `ETH/USDT`, `SOL/USDT` (y alias `BTC-USD`, `ETH-USD`, `SOL-USD`).
   - **Materias Primas y Energía:** `CL=F`, `GC=F`, `SI=F`, `NG=F`.
   - **Bonos e Índices Macro:** `TLT`, `^GSPC`, `SPY`, `QQQ`.
   - **Acciones Globales:** `BABA`, `NVDA`, `AAPL`, `TSLA`, `MSFT`.
   - **Mercado Argentino (BYMA / Merval):** `GGAL.BA`, `YPFD.BA`, `PAMP.BA`, `BMA.BA`, `ALUA.BA`, `TXAR.BA`.
   - **China y ETFs Temáticos:** `MCHI`, `KWEB`, `BOTZ`.
   - *Nota crítica:* Cualquier alerta inyectada con `asset: "GENERAL"` o `DX-Y.NYB` no es directamente operable en la Trinchera de `trading_ollama`.

4. **Convivencia de Recursos en Ollama (`http://localhost:11434`):**
   - Ambos proyectos comparten la misma instancia local de Ollama (`qwen2.5:3b` / `trader-qwen`).
   - `trading_ollama` utiliza el motor cuantitativo **Plan Argon (`mean_reversion_atr`)** en temporalidades intradía de **`15m` y `1h`** ($Z\text{-Score} \le -2.0$, $\text{EMA}_{200}$ alcista, absorción de mecha inferior $\ge 0.40$, $\text{RVOL} \le 3.5$) y usa a Ollama/Gemini únicamente como **Auditor con poder de Veto** (`temperature: 0.0`).

---

## PARTE 2: AUDITORÍA DE CÓMO RECOLECTA Y EVALÚA INFORMACIÓN ESTE PROYECTO ACTUALMENTE

Revisa los siguientes archivos de este repositorio (`monitor del mercado`) donde detectamos estos cuellos de botella:

1. **Ingesta RSS limitada y sesgada al inglés (`config/feeds.yaml` y `src/ingestion/rss_collector.py`):**
   - `config/feeds.yaml` solo tiene 7 fuentes en inglés (Yahoo, MarketWatch, CNBC, OilPrice, Mining, CoinDesk, Cointelegraph). No tiene ninguna fuente para el **Mercado Argentino** (`GGAL.BA`, `YPFD.BA`, `PAMP.BA`, `BMA.BA`, `ALUA.BA`, `TXAR.BA`) ni cobertura específica para **Acciones Globales / China / IA** (`BABA`, `NVDA`, `AAPL`, `TSLA`, `MSFT`, `MCHI`, `KWEB`, `BOTZ`).
   - En `src/ingestion/rss_collector.py`, el diccionario `KEYWORD_TICKER_MAP` solo mapea 11 activos (`BTC-USD`, `ETH-USD`, `SOL-USD`, `CL=F`, `GC=F`, `SI=F`, `NG=F`, `^GSPC`, `QQQ`, `TLT`, `DX-Y.NYB`). Si una noticia habla de "Nvidia", "Apple", "Tesla", "Microsoft", "Alibaba", "YPF", "Vaca Muerta", "Galicia", "Pampa Energía", "S&P 500 ETF", "China Tech" o "Robótica", `_extract_tickers()` devuelve lista vacía `[]` a menos que el texto traiga explícitamente `$NVDA` o `(NASDAQ: NVDA)`.
   - Cuando `_extract_tickers()` devuelve `[]`, la noticia llega al Paso 2 sin `AssetSnapshot` real de `yfinance`, forzando a `qwen2.5:3b` a adivinar el ticker o devolver `"GENERAL"`.

2. **Métricas Técnicas Insuficientes en `src/ingestion/market_data.py` (`MarketDataFetcher`) y `src/models.py` (`AssetSnapshot`):**
   - Actualmente `MarketDataFetcher.get_snapshot()` solo calcula precio actual, variación 24h, máximo/mínimo de 52 semanas y `rsi_14` diario.
   - No calcula métricas cuantitativas clave que el evaluador Contrarian y `trading_ollama` necesitan para validar si una caída es pánico irracional o deterioro estructural:
     - **SMA 50 y EMA 200 diaria** (distancia porcentual a la media de 200 ruedas para distinguir tendencia alcista primaria vs. cuchillo cayendo).
     - **Z-Score de 20 periodos** ($\frac{\text{Close} - \text{SMA}_{20}}{\sigma_{20}}$) para medir estadísticamente la sobreventa extrema.
     - **Volumen Relativo (`RVOL`)** respecto a la media de 20 días para detectar capitulación institucional vs. falta de liquidez.
     - **ATR(14) porcentual (`atr_pct`)** para dimensionar la volatilidad real del activo en vez de pedirle al LLM que invente precios objetivo.
   - Además, `self._cache[ticker] = snapshot` en `MarketDataFetcher` no tiene TTL (Time-To-Live): si el servidor web (`src/dashboard/server.py`) corre durante horas en Modo Radar Continuo, el caché en memoria podría servir cotizaciones viejas si se reutiliza la instancia.

3. **Alucinación Numérica Inducida por el Prompt (`src/intelligence/prompts.py` y `src/intelligence/contrarian_evaluator.py`):**
   - En `STEP2_OPPORTUNITY_SYSTEM` (`src/intelligence/prompts.py`), se le pide a un modelo pequeño (`qwen2.5:3b` de 3B parámetros) que invente en texto libre:
     - `"precio_entrada_sugerido": "65.00 - 68.00 USD"`
     - `"stop_loss": "59.50 USD (-10%)"`
     - `"take_profit": "85.00 USD (+28%)"`
     - `"ratio_riesgo_beneficio": 4.4`
   - Un LLM de 3B parámetros no debe inventar niveles de Stop Loss ni ratios R/R a ojo; esos niveles deben calcularse **determinísticamente en Python** a partir del `current_price` y el `ATR(14)` real del `AssetSnapshot` (por ejemplo: Entrada en zona actual, SL sugerido a $-2.0 \times \text{ATR}$, TP sugerido a $+3.0 \times \text{ATR}$) y pasarse ya calculados al prompt o inyectarse desde Python en el `OpportunityReport`.

4. **Puente de Inyección en `src/dashboard/server.py` y `web/app.js`:**
   - En `src/dashboard/server.py` (`_handle_inject_to_trading_bot`), falta leer `os.environ.get("TRADING_OLLAMA_API_TOKEN") or os.environ.get("APP_SECRET_TOKEN") or os.environ.get("APP_TOKEN")` y enviarlo en el header `X-API-Token` al hacer `POST` a `http://127.0.0.1:18767/api/macro/inject`.
   - En `web/app.js` (`autoInjectReport`), si un reporte o alerta no tiene ticker operable (o cae en `"GENERAL"`), igual dispara la auto-inyección hacia `trading_ollama`. Además, cuando el ticker es `DX-Y.NYB` (Índice Dólar), debería excluirse de la auto-inyección operativa directa salvo que tenga un activo operable asociado.

---

## PARTE 3: PLAN DE TRABAJO QUE DEBES EJECUTAR EN ESTE PROYECTO (`monitor del mercado`)

Por favor, revisa primero los archivos mencionados y propón/implementa las siguientes 6 mejoras manteniendo el 100% de los tests actuales en verde (`./.venv/bin/pytest -q`):

1. **Alinear el Universo de Activos (`src/ingestion/rss_collector.py`, `src/pipeline.py` y `config/feeds.yaml`):**
   - Ampliar `KEYWORD_TICKER_MAP` en `src/ingestion/rss_collector.py` para cubrir todos los activos operables de `trading_ollama`:
     - Acciones US/Global: `NVDA` (nvidia, blackwell, geforce), `AAPL` (apple, iphone, cupertino), `TSLA` (tesla, elon musk, cybertruck), `MSFT` (microsoft, azure, copilot), `BABA` (alibaba, jack ma, aliexpress), `SPY` (spdr s&p).
     - ETFs China/IA: `MCHI` (msci china), `KWEB` (china internet, krane), `BOTZ` (robotics, artificial intelligence etf).
     - Argentina (BYMA): `YPFD.BA` (ypf, vaca muerta), `GGAL.BA` (grupo financiero galicia, banco galicia), `PAMP.BA` (pampa energia, pampa energía), `BMA.BA` (banco macro), `ALUA.BA` (aluar), `TXAR.BA` (ternium).
   - Actualizar `KEY_TICKERS` en `src/pipeline.py` para incluir los principales referentes de ese universo sin ralentizar el arranque (usando descarga bajo demanda para los tickers detectados en noticias).
   - Agregar en `config/feeds.yaml` al menos 1 o 2 fuentes RSS financieras en español / Latinoamérica / Argentina (con manejo resiliente si algún feed falla) y actualizar la extracción de palabras clave bilingüe (español/inglés).

2. **Enriquecer `AssetSnapshot` y `MarketDataFetcher` (`src/models.py` y `src/ingestion/market_data.py`):**
   - Añadir campos opcionales a `AssetSnapshot`: `sma_50`, `ema_200`, `z_score_20`, `atr_14`, `atr_pct`, `rvol_20`.
   - Calcular estas métricas en `MarketDataFetcher.get_snapshot(ticker)` sobre la serie histórica de `yfinance` (`hist`).
   - Añadir un TTL al caché de `MarketDataFetcher` (ej. 300 segundos) para que en modo servidor continuo nunca sirva precios obsoletos.

3. **Cálculo Determinista de Niveles y Mejora del Evaluador (`src/intelligence/contrarian_evaluator.py` y `src/intelligence/prompts.py`):**
   - En `_format_market_context()`, incluir las nuevas métricas cuantitativas (`Z-Score`, `EMA200`, `ATR%`, `RVOL`) para que `qwen2.5:3b` evalúe con datos duros reales.
   - Calcular en Python niveles orientativos basados en `ATR(14)` cuando exista `AssetSnapshot` para respaldar o corregir los campos `entry_price_range`, `stop_loss`, `take_profit` y `risk_reward_ratio` si el LLM devuelve valores vacíos o incoherentes.
   - En `src/intelligence/ollama_client.py`, asegurar un manejo limpio de opciones (`temperature`, `num_ctx`) para convivir de forma óptima en RAM con `trading_ollama`.

4. **Sincronizar el Puente de Inyección (`src/dashboard/server.py` y `web/app.js`):**
   - En `src/dashboard/server.py` (`_handle_inject_to_trading_bot`), adjuntar el header `X-API-Token` si existe `TRADING_OLLAMA_API_TOKEN`, `APP_SECRET_TOKEN` o `APP_TOKEN` en las variables de entorno.
   - En `web/app.js` (`autoInjectReport`), evitar auto-inyectar reportes cuyo ticker sea `"GENERAL"`, vacío o no operable (`DX-Y.NYB`), y en la carga útil incluir en `text` un resumen cuantitativo claro (`RSI`, `Z-Score`, `% vs 52w High`, `Tesis Contrarian`) para que el Auditor de IA de `trading_ollama` tenga todo el contexto duro al decidir si veta o aprueba una entrada.

5. **Implementar Selector Dual de Motor de Inteligencia (`Ollama Local [Predeterminado]` vs. `Antigravity CIO`):**
   - **En la interfaz web (`web/index.html` y `web/app.js`):**
     - Agregar un selector de motor de análisis con dos modos:
       1. **`ollama` (Predeterminado - `Ollama Local qwen2.5:3b`):** Flujo autónomo local actual.
       2. **`antigravity_cio` (`Antigravity CIO - Investigador & Auditor Élite`):** Modo en el que el Monitor recolecta noticias RSS y calcula todas las métricas cuantitativas en Python (`AssetSnapshot` con `RSI`, `Z-Score`, `EMA200`, `ATR`), dejando los candidatos listos para ser auditados/enriquecidos por el agente CIO de Antigravity (con búsqueda web en vivo y las Tres Verdades Contraintuitivas), o haciendo *fallback* opcional a Ollama si se solicita evaluación inmediata sin agente externo conectado.
   - **En el servidor backend (`src/dashboard/server.py`):**
     - Exponer `GET /api/cio/candidates`: devuelve las noticias filtradas recientes junto con los `AssetSnapshot` cuantitativos completos (`rsi_14`, `z_score_20`, `ema_200`, `atr_14`, `pct_from_52w_high`, etc.) pendientes de evaluación por el CIO.
     - Exponer `POST /api/cio/publish`: permite que el agente `Antigravity CIO` publique directamente un `OpportunityReport` o `MarketAlert` validado en el estado del Monitor (`STATE.latest_result`), para que se visualice inmediatamente en el Dashboard del Monitor y, si el puente automático está activo, se inyecte en `trading_ollama` (`http://127.0.0.1:18767/api/macro/inject`) con `source: "Antigravity CIO"`.
   - **Crear la Skill de Antigravity en este repositorio (`.agents/skills/monitor-cio-researcher/SKILL.md`):**
     - Siguiendo el estándar de `.agents/skills/macro-cio-auditor/SKILL.md` de `trading_ollama`, crear la skill del **CIO Investigador del Monitor del Mercado**:
       - Lee los candidatos crudos y sus métricas desde `http://127.0.0.1:18087/api/cio/candidates`.
       - Utiliza búsqueda web en tiempo real para verificar el contexto fundamental detrás de la caída o catalizador del activo.
       - Evalúa bajo las **Tres Verdades Contraintuitivas** (1. Comprar el dolor / pánico irracional, 2. Activos con viento de cola secular dentro de `SUPPORTED_SYMBOLS`, 3. Asimetría matemática R/R $\ge 2:1$ basada en ATR).
       - Publica el informe en `http://127.0.0.1:18087/api/cio/publish` y/o lo inyecta en `http://127.0.0.1:18767/api/macro/inject`.
       - Soporta **Modo A (Automático cada 15 min con `/schedule`)**, **Modo B (A demanda)** y **Desconexión / Standby**.

6. **Tests Automatizados (`tests/`):**
   - Añadir pruebas unitarias para:
     - La detección de los nuevos tickers (incluyendo acciones argentinas `.BA`, tecnológicas y ETFs).
     - Las nuevas métricas matemáticas de `MarketDataFetcher` (`z_score_20`, `ema_200`, `atr_14`, TTL de caché).
     - Los nuevos endpoints del modo dual (`/api/cio/candidates` y `/api/cio/publish`) y el envío de `X-API-Token` en el puente hacia `trading_ollama`.
```
---

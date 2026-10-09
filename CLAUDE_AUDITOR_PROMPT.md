# 🕵️‍♂️ Prompt de Auditoría para Claude 3.5 Sonnet (Revisión de Seguridad y Lógica)

**INSTRUCCIÓN PARA EL USUARIO:** Copia todo el contenido de este archivo (o súbelo directamente) al chat de **Claude 3.5 Sonnet**. Él se encargará de auditar el código como un Ingeniero de Seguridad Financiera.

---
---

## 🤖 CONTEXTO PARA CLAUDE 3.5 SONNET
Actúa como un **Ingeniero de Software Senior Especialista en HFT (High-Frequency Trading) y Ciberseguridad**. 

He construido una plataforma de simulación de trading algorítmico (Paper Trading V2) donde un agente de Inteligencia Artificial (Ollama / Gemini) analiza el mercado y ejecuta órdenes de compra/venta usando estrategias de análisis técnico (MACD, Bollinger, VWAP, RSI).

El proyecto actualmente está en fase de "Simulador", pero me preparo para migrar a "Dinero Real" conectando las APIs de exchanges y brokers. Existe un riesgo latente de que la IA sufra alucinaciones o errores de formato, o que el código tenga *race conditions* que puedan liquidar los fondos de las billeteras operativas.

### 🎯 TU MISIÓN
Quiero que analices minuciosamente la arquitectura, el flujo de datos y el código fuente adjunto. Tu objetivo es:
1. **Buscar errores de lógica matemática o financiera** (especialmente en el sistema Multi-Billetera de `app.js`).
2. **Detectar vulnerabilidades de estado:** ¿Qué pasa si la conexión falla en medio de un trade? ¿Qué pasa si el usuario refresca la página? ¿Qué pasa si la IA devuelve un JSON malformado?
3. **Auditar el Agente de Riesgo:** Evalúa la lógica de Stop Loss y Take Profit.
4. **Diseñar un Plan de Acción (Corrección):** Entrega una lista priorizada de *bugs* encontrados y propone el código exacto para mitigar cada uno de esos riesgos.

---

## 🏗️ ARQUITECTURA DEL PROYECTO
- **Frontend:** HTML5, TailwindCSS, Vanilla JS (`app.js`), Lightweight Charts (TradingView).
- **Backend:** Python 3, FastAPI, Uvicorn (Puerto 18767).
- **Librerías Python:** `ccxt`, `yfinance`, `pandas`, `ta` (Technical Analysis), `requests`, `langchain-google-genai`.
- **Motor IA Local:** `ollama` con el modelo `llama3` (nombrado 'trader-ia') y un `timeout` de 120s.

### Lógica Actual Implementada (Multi-Billetera V2)
En lugar de un saldo unificado, el usuario tiene 3 billeteras independientes guardadas en `localStorage`:
- **USDT:** Para criptomonedas (ej. BTC/USDT).
- **USD:** Para Wall Street (ej. AAPL, TSLA).
- **ARS:** Para mercado argentino (ej. YPFD.BA, GGAL.BA).
La función `getCurrency()` detecta el tipo de moneda según el símbolo, y `executeTrade()` descuenta el capital y calcula promedios de entrada (DCA).

---

## 💻 CÓDIGO FUENTE ACTUAL (PARA AUDITORÍA)

### 1. Backend (`backend/main.py`)
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import ccxt
import os

app = FastAPI(title="Trading AI API", description="API para el agente de trading")

# Configurar CORS para permitir que el frontend HTML acceda a esta API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Permite cualquier origen durante desarrollo
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicializamos el exchange (usamos Binance por su mayor estabilidad y mejores rate limits)
exchange = ccxt.binance()

class ApiKeyRequest(BaseModel):
    api_key: str

@app.post("/api/config/gemini")
def save_gemini_key(req: ApiKeyRequest):
    with open(".env", "w") as f:
        f.write(f'GEMINI_API_KEY="{req.api_key}"\n')
    os.environ["GEMINI_API_KEY"] = req.api_key
    return {"status": "ok", "message": "API Key de Gemini configurada con éxito."}
def get_ohlcv(symbol, timeframe, limit):
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
        return df_yf[['timestamp', 'open', 'high', 'low', 'close', 'volume']].tail(limit).values.tolist()
    else:
        return exchange.fetch_ohlcv(symbol, timeframe, limit=limit)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Motor de Trading AI en línea"}

@app.get("/api/market/price")
def get_price(symbol: str = "BTC/USDT"):
    """
    Obtiene el precio actual y el volumen de un activo.
    """
    try:
        ticker = exchange.fetch_ticker(symbol)
        return {
            "symbol": symbol,
            "price": ticker['last'],
            "high": ticker['high'],
            "low": ticker['low'],
            "volume": ticker['quoteVolume']
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/market/history")
def get_history(symbol: str = "BTC/USDT", timeframe: str = "1h", limit: int = 100):
    """
    Obtiene el histórico de velas (OHLCV) listo para graficar con su Media Móvil.
    """
    try:
        # fetch_ohlcv devuelve: [timestamp, open, high, low, close, volume]
        ohlcv = get_ohlcv(symbol, timeframe, limit)
        
        import pandas as pd
        import ta
        df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        df['sma_20'] = ta.trend.SMAIndicator(close=df['close'], window=20).sma_indicator()
        df['vwap'] = ta.volume.VolumeWeightedAveragePrice(high=df['high'], low=df['low'], close=df['close'], volume=df['volume'], window=14).volume_weighted_average_price()
        
        # Lo formateamos para que Lightweight Charts lo entienda fácilmente
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
            formatted_data.append(item)
            
        return formatted_data
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/market/sentiment")
def get_sentiment(symbol: str = "BTC/USDT", source: str = "coindesk"):
    """
    Agente de Sentimiento con selección de fuente.
    """
    try:
        import feedparser
        from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
        
        # Mapeo de monedas
        base_asset = symbol.split('/')[0].upper()
        nombres = {"BTC": "Bitcoin", "ETH": "Ethereum", "SOL": "Solana"}
        nombre_completo = nombres.get(base_asset, base_asset)
        
        if source == "twitter":
            return {
                "score": 0,
                "estado": "OFFLINE",
                "noticias": [
                    {
                        "title": "⚠️ La API de Twitter/X requiere configurar una Clave PRO en el archivo .env",
                        "score": 0
                    }
                ]
            }
        
        # Si es CoinDesk
        feed = feedparser.parse('https://www.coindesk.com/arc/outboundfeeds/rss/')
        analyzer = SentimentIntensityAnalyzer()
        
        total_score = 0
        news_list = []
        
        # Filtrar noticias que hablen de nuestro activo
        for entry in feed.entries:
            title = entry.title
            # Buscar menciones (ignorar mayúsculas)
            if base_asset.lower() in title.lower() or nombre_completo.lower() in title.lower():
                score = analyzer.polarity_scores(title)
                compound = score['compound']
                total_score += compound
                
                news_list.append({
                    "title": title,
                    "score": round(compound, 2)
                })
                
                if len(news_list) >= 5: # Quedarnos con máximo 5 noticias relevantes
                    break
                    
        # Si no hay noticias recientes sobre esta moneda, ser neutrales
        if len(news_list) == 0:
            return {"score": 0, "estado": "NEUTRAL", "noticias": [{"title": f"Sin noticias recientes de {nombre_completo}", "score": 0}]}
            
        avg_score = total_score / len(news_list)
        
        if avg_score > 0.15:
            estado = "BULLISH"
        elif avg_score < -0.15:
            estado = "BEARISH"
        else:
            estado = "NEUTRAL"
            
        return {
            "score": round(avg_score, 2),
            "estado": estado,
            "noticias": news_list
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/market/analysis")
def get_analysis(symbol: str = "BTC/USDT", timeframe: str = "1m", engine: str = "local", tp: float = 3.0, sl: float = 2.0, risk: float = 1.0):
    """
    Realiza análisis técnico cuantitativo de las últimas velas.
    """
    try:
        import pandas as pd
        import ta
        
        ohlcv = get_ohlcv(symbol, timeframe, 100)
        df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        
        # Calcular RSI (14 periodos)
        df['rsi'] = ta.momentum.RSIIndicator(close=df['close'], window=14).rsi()
        
        # Calcular Medias Móviles (SMA 20 y SMA 50)
        df['sma_20'] = ta.trend.SMAIndicator(close=df['close'], window=20).sma_indicator()
        df['vwap'] = ta.volume.VolumeWeightedAveragePrice(high=df['high'], low=df['low'], close=df['close'], volume=df['volume'], window=14).volume_weighted_average_price()
        df['sma_50'] = ta.trend.SMAIndicator(close=df['close'], window=50).sma_indicator()
        
        # Calcular Bandas de Bollinger y MACD
        bb = ta.volatility.BollingerBands(close=df['close'], window=20, window_dev=2)
        df['bb_high'] = bb.bollinger_hband()
        df['bb_low'] = bb.bollinger_lband()
        
        macd = ta.trend.MACD(close=df['close'])
        df['macd_diff'] = macd.macd_diff() # Histograma MACD
        
        latest = df.iloc[-1]
        previous = df.iloc[-2]
        
        # Lógica del Agente Orquestador (IA Gemini vs Matemático Avanzado)
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
        if engine == "local":
            
            
            cruce_alcista = (macd_prev < 0) and (macd_curr > 0)
            cruce_bajista = (macd_prev > 0) and (macd_curr < 0)
            
            # 1. Estrategia Tendencial (MACD + Filtro Institucional VWAP)
            if cruce_alcista and (price_val > vwap_val) and rsi_val < 65:
                signal = "COMPRAR"
                reason = "MACD alcista respaldado por VWAP (Institucional)."
            elif cruce_bajista and (price_val < vwap_val) and rsi_val > 35:
                signal = "VENDER"
                reason = "MACD bajista bajo resistencia VWAP."
            
            # 2. Estrategia de Extremos / Rebote (Bollinger + RSI)
            elif price_val < bb_low and rsi_val < 30:
                signal = "COMPRAR"
                reason = "Pánico extremo: Precio bajo BB inf. Buscando rebote al VWAP."
            elif price_val > bb_high and rsi_val > 70:
                signal = "VENDER"
                reason = "Euforia: Precio sobre BB sup. Regreso a la media inminente."
                
            else:
                signal = "MANTENER"
                reason = f"Esperando confluencia. Precio vs VWAP: "
        elif engine == "ai":
            from dotenv import load_dotenv
            import os
            from langchain_google_genai import ChatGoogleGenerativeAI
            from langchain_core.prompts import PromptTemplate
            import json

            load_dotenv()
            api_key = os.getenv("GEMINI_API_KEY")

            if not api_key or api_key == "tu_clave_aqui_sin_comillas":
                reason = "[AVISO] Falta GEMINI_API_KEY en ajustes. IA Desconectada."
                signal = "ERROR"
            else:
                try:
                    llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", google_api_key=api_key, temperature=0.2)
                    
                    prompt = PromptTemplate.from_template(
                        "Eres un Senior Quantitative Trader Institucional operando algorítmicamente. "
                        "El usuario está en velas de {timeframe}, asumiendo un riesgo del {riesgo}%, "
                        "buscando +{tp}% de ganancia y un límite de pérdida de -{sl}%.\n\n"
                        "ANALIZA LA ESTRUCTURA DEL ACTIVO {symbol}:\n"
                        "- Precio Actual: ${precio}\n"
                        "- VWAP (Institucional): ${vwap}\n"
                        "- RSI (14): {rsi}\n"
                        "- Histograma MACD: {macd}\n"
                        "- Bandas Bollinger: Inf=${bb_low}, Sup=${bb_high}\n\n"
                        "INSTRUCCIÓN CORE: Tu decisión principal debe girar en torno al VWAP. Si el Precio > VWAP, hay soporte institucional (alcista). Si Precio < VWAP, hay resistencia institucional (bajista). "
                        "Cruza esta información con el RSI (sobrecomprado/sobrevendido) y las Bandas. "
                        "Tu respuesta debe ser EXCLUSIVAMENTE en formato JSON válido estricto sin markdown:\n"
                        '{"signal": "COMPRAR", "reason": "Justificación de 15 palabras centrada en VWAP"}'
                    )
                    
                    chain = prompt | llm
                    respuesta = chain.invoke({
                        "timeframe": timeframe,
                        "riesgo": int(risk * 100),
                        "tp": tp,
                        "sl": sl,
                        "symbol": symbol,
                        "precio": price_val,
                        "vwap": round(latest['vwap'], 2) if not pd.isna(latest['vwap']) else "N/A",
                        "rsi": rsi_val,
                        "macd": round(latest['macd_diff'], 2) if not pd.isna(latest['macd_diff']) else "N/A",
                        "bb_low": round(bb_low, 2) if not pd.isna(bb_low) else "N/A",
                        "bb_high": round(bb_high, 2) if not pd.isna(bb_high) else "N/A"
                    })
                    
                    raw_json = respuesta.content.replace("`json", "").replace("`", "").strip()
                    ia_decision = json.loads(raw_json)
                    
                    signal = ia_decision.get("signal", "MANTENER").upper()
                    reason = ia_decision.get("reason", "")
                except Exception as e:
                    signal = "ERROR"
                    reason = f"Error en el Agente Gemini: {str(e)}"
                    
        elif engine == "ollama":
            import requests
            import json
            
            prompt_text = f'''
            Eres un Senior Quantitative Trader Institucional operando algorítmicamente.
            Mercado: {symbol}. Velas de {timeframe}. Riesgo: {int(risk * 100)}%. TP: +{tp}%. SL: -{sl}%.
            
            DATOS TÉCNICOS ACTUALES:
            - Precio: ${price_val}
            - VWAP: ${round(vwap_val, 2) if not pd.isna(vwap_val) else "N/A"}
            - RSI (14): {rsi_val}
            - MACD: {round(latest['macd_diff'], 2) if not pd.isna(latest['macd_diff']) else "N/A"}
            - Bandas Bollinger: Inf=${round(bb_low, 2) if not pd.isna(bb_low) else "N/A"}, Sup=${round(bb_high, 2) if not pd.isna(bb_high) else "N/A"}
            
            Responde EXCLUSIVAMENTE con este formato JSON y NADA MAS:
            {{"signal": "COMPRAR", "reason": "Justificacion de 15 palabras centrada en VWAP"}}
            (Opciones de signal: COMPRAR, VENDER, MANTENER).
            '''
            
            try:
                payload = {
                    "model": "trader-ia",
                    "prompt": prompt_text,
                    "stream": False,
                    "format": "json"
                }
                res = requests.post("http://localhost:11434/api/generate", json=payload, timeout=120)
                if res.status_code == 200:
                    respuesta = res.json()["response"]
                    ia_decision = json.loads(respuesta)
                    signal = ia_decision.get("signal", "MANTENER").upper()
                    reason = ia_decision.get("reason", "Decisión procesada por Ollama.")
                else:
                    signal = "ERROR"
                    reason = "Error del servidor Ollama."
            except Exception as e:
                signal = "ERROR"
                reason = "Ollama no responde. Verifica que el programa esté abierto y el modelo 'trader-ia' instalado."
                    
        return {
            "symbol": symbol,
            "signal": signal,
            "reason": reason,
            "indicators": {
                "rsi": round(latest['rsi'], 2) if not pd.isna(latest['rsi']) else None,
                "sma_20": round(latest['sma_20'], 2) if not pd.isna(latest['sma_20']) else None,
                "sma_50": round(latest['sma_50'], 2) if not pd.isna(latest['sma_50']) else None,
                "current_price": latest['close']
            },
            "latest_candle": {
                "time": int(latest['timestamp'] / 1000),
                "open": latest['open'],
                "high": latest['high'],
                "low": latest['low'],
                "close": latest['close']
            }
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=18767, reload=True)
```

### 2. Frontend Core Logic (`app.js`)
```javascript
// Elementos de UI
const terminal = document.getElementById('terminal');
const agentToggle = document.getElementById('agentToggle');

function logToTerminal(message, type = 'info') {
    if (!terminal) return;
    const time = new Date().toLocaleTimeString();
    const p = document.createElement('p');
    let color = 'text-green-400';
    if (type === 'warn') color = 'text-yellow-400';
    if (type === 'error') color = 'text-red-400';
    if (type === 'action') color = 'text-blue-400';
    
    p.className = color;
    p.innerHTML = `<span class="text-gray-500">[${time}]</span> > ${message}`;
    terminal.appendChild(p);
    terminal.scrollTop = terminal.scrollHeight;
}

// Capturar errores para verlos en pantalla
window.onerror = function(message, source, lineno, colno, error) {
    logToTerminal(`ERROR CRÍTICO: ${message} (Línea ${lineno})`, 'error');
};
window.addEventListener('unhandledrejection', function(event) {
    logToTerminal(`PROMESA FALLIDA: ${event.reason}`, 'error');
});

// Configuración inicial del Gráfico usando Lightweight Charts
const chartOptions = {
    layout: {
        textColor: '#d1d5db',
        background: { type: 'solid', color: 'transparent' },
    },
    grid: {
        vertLines: { color: 'rgba(55, 65, 81, 0.5)' },
        horzLines: { color: 'rgba(55, 65, 81, 0.5)' },
    },
    rightPriceScale: { borderColor: 'rgba(55, 65, 81, 1)' },
    timeScale: { borderColor: 'rgba(55, 65, 81, 1)', timeVisible: true },
};

const chartContainer = document.getElementById('chart-container');
const chart = LightweightCharts.createChart(chartContainer, {
    ...chartOptions,
    width: chartContainer.clientWidth,
    height: chartContainer.clientHeight || 400,
});

const candleSeries = chart.addCandlestickSeries({
    upColor: '#22c55e', downColor: '#ef4444',
    borderDownColor: '#ef4444', borderUpColor: '#22c55e',
    wickDownColor: '#ef4444', wickUpColor: '#22c55e',
});

const smaSeries = chart.addLineSeries({
    color: '#3b82f6', // Azul brillante para la SMA 20
    lineWidth: 2,
    crosshairMarkerVisible: false,
    priceLineVisible: false,
});

const vwapSeries = chart.addLineSeries({
    color: '#f59e0b', // Naranja para VWAP
    lineWidth: 2,
    lineStyle: 1, // Dotted
    crosshairMarkerVisible: false,
    priceLineVisible: false,
});

const symbolSelect = document.getElementById('symbolSelect');
let currentSymbol = symbolSelect.value;
let currentPrice = 0;

// Variables de Simulación (Paper Trading) persistentes en el navegador
let portfolio = JSON.parse(localStorage.getItem('ai_portfolio_v2')) || {
    balances: {
        USDT: 100.00,
        USD: 1000.00,
        ARS: 500000.00
    },
    ASSET: 0,
    entryPrice: 0,
    VAULT: 0
};

function getCurrency(symbol) {
    if (!symbol) return 'USD';
    if (symbol.includes('USDT')) return 'USDT';
    if (symbol.includes('.BA')) return 'ARS';
    return 'USD';
}

// Mecanismo de Cordura (Sanity Check) para evitar Save Corruption (NaN o variables faltantes)
if (!portfolio.balances) portfolio.balances = { USDT: 100, USD: 1000, ARS: 500000 };
if (typeof portfolio.balances.USDT !== 'number' || isNaN(portfolio.balances.USDT)) portfolio.balances.USDT = 100.00;
if (typeof portfolio.balances.USD !== 'number' || isNaN(portfolio.balances.USD)) portfolio.balances.USD = 1000.00;
if (typeof portfolio.balances.ARS !== 'number' || isNaN(portfolio.balances.ARS)) portfolio.balances.ARS = 500000.00;
if (typeof portfolio.ASSET !== 'number' || isNaN(portfolio.ASSET)) portfolio.ASSET = 0;
if (typeof portfolio.entryPrice !== 'number' || isNaN(portfolio.entryPrice)) portfolio.entryPrice = 0;
if (typeof portfolio.VAULT !== 'number' || isNaN(portfolio.VAULT)) portfolio.VAULT = 0;

let tradeHistoryLog = JSON.parse(localStorage.getItem('ai_trade_history')) || [];
if (!Array.isArray(tradeHistoryLog)) tradeHistoryLog = [];

// Función de reseteo para limpiar la memoria si el usuario quiere empezar de cero
window.resetearCuenta = function() {
    localStorage.removeItem('ai_portfolio_v2');
    // No borramos 'ai_trade_history' para que el registro histórico sea eterno
    location.reload();
};

function updateCapitalDisplay() {
    let currency = getCurrency(currentSymbol);
    let total = portfolio.balances[currency] + (portfolio.ASSET * currentPrice);
    
    // Milestone Checker (Toma de Ganancias Automática a la Bóveda)
    const autoVaultToggle = document.getElementById('autoVaultToggle');
    if (autoVaultToggle && autoVaultToggle.checked && total >= 200.00 && portfolio.ASSET === 0) { // Solo transferimos si no hay posiciones abiertas
        portfolio.balances[currency] -= 100.00;
        portfolio.VAULT += 100.00;
        total -= 100.00;
        localStorage.setItem('ai_portfolio_v2', JSON.stringify(portfolio));
        logToTerminal(`🏦 HITO ALCANZADO: Capital duplicado. $100 transferidos a la Bóveda Segura Intocable.`, 'action');
    }

    const currencySymbols = { 'USDT': 'USDT', 'USD': 'USD', 'ARS': 'ARS' };
    const curSym = currencySymbols[currency] || '$';
    document.getElementById('capitalDisplay').innerText = `$${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${curSym}`;
    
    // Actualizar Billeteras en UI
    const vaultDisplay = document.getElementById('vaultDisplay');
    if (vaultDisplay) vaultDisplay.innerText = `$${portfolio.VAULT.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    const usdtDisp = document.getElementById('walletUsdtDisplay');
    if (usdtDisp) usdtDisp.innerText = `$${portfolio.balances.USDT.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    const usdDisp = document.getElementById('walletUsdDisplay');
    if (usdDisp) usdDisp.innerText = `$${portfolio.balances.USD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    const arsDisp = document.getElementById('walletArsDisplay');
    if (arsDisp) arsDisp.innerText = `$${portfolio.balances.ARS.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    // Calcular Rendimiento Total (PnlD) basado solo en el capital activo del bot
    const pnlDisplay = document.getElementById('pnlDisplay');
    if (pnlDisplay) {
        const diff = total - 100.00;
        const percent = (diff / 100.00) * 100;
        
        const sign = diff >= 0 ? '+' : '';
        const color = diff >= 0 ? (diff > 0 ? 'text-green-400' : 'text-gray-400') : 'text-red-400';
        
        pnlDisplay.className = `font-bold ${color}`;
        pnlDisplay.innerText = `${sign}$${Math.abs(diff).toFixed(2)} (${sign}${percent.toFixed(2)}%)`;
    }

    // Actualizar Tabla de Posiciones Activas
    const activeBody = document.getElementById('activePositionsBody');
    if (activeBody) {
        if (portfolio.ASSET <= 0.0001) {
            if (!document.getElementById('emptyPositionsRow')) {
                activeBody.innerHTML = `<tr id="emptyPositionsRow"><td colspan="6" class="px-4 py-4 text-center text-gray-600 italic">No tienes posiciones activas (100% liquidez en USDT).</td></tr>`;
            }
        } else {
            const baseCoin = currentSymbol.split('/')[0];
            const pnlNoRealizado = (currentPrice - portfolio.entryPrice) * portfolio.ASSET;
            const pnlSign = pnlNoRealizado >= 0 ? '+' : '';
            const pnlColor = pnlNoRealizado >= 0 ? 'text-green-400' : 'text-red-400';
            
            let activeRow = document.getElementById('activePositionRow');
            if (!activeRow) {
                activeBody.innerHTML = `
                    <tr id="activePositionRow" class="border-b border-gray-700/50 bg-blue-900/10">
                        <td class="px-4 py-2 font-bold text-white" id="apCoin"></td>
                        <td class="px-4 py-2 font-mono" id="apAmount"></td>
                        <td class="px-4 py-2 font-mono" id="apEntry"></td>
                        <td class="px-4 py-2 font-mono" id="apCurrent"></td>
                        <td class="px-4 py-2 font-bold" id="apPnl"></td>
                        <td class="px-4 py-2 text-right">
                            <button onclick="window.forceClosePosition()" class="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded font-bold shadow-lg transition duration-200 ease-in-out transform hover:scale-105 border border-red-500">✖ CERRAR</button>
                        </td>
                    </tr>
                `;
            }
            document.getElementById('apCoin').innerText = baseCoin;
            document.getElementById('apAmount').innerText = portfolio.ASSET.toFixed(6);
            document.getElementById('apEntry').innerText = `$${portfolio.entryPrice.toLocaleString()}`;
            document.getElementById('apCurrent').innerText = `$${currentPrice.toLocaleString()}`;
            
            const pnlCell = document.getElementById('apPnl');
            pnlCell.className = `px-4 py-2 font-bold ${pnlColor}`;
            pnlCell.innerText = `${pnlSign}$${Math.abs(pnlNoRealizado).toFixed(2)}`;
        }
    }
}

symbolSelect.addEventListener('change', () => {
    currentSymbol = symbolSelect.value;
    logToTerminal(`Cambiando activo a ${currentSymbol}...`, 'warn');
    candleSeries.setData([]); // Limpiar gráfico
    smaSeries.setData([]);
    vwapSeries.setData([]);
    fetchMarketData();
    updateSentiment();
});

// Obtener datos reales del motor Python
async function fetchMarketData() {
    try {
        logToTerminal(`Conectando al motor Python para obtener velas de ${currentSymbol}...`, 'info');
        const response = await fetch(`http://localhost:18767/api/market/history?symbol=${currentSymbol}&timeframe=${document.getElementById('timeframeSelect')?.value || '1m'}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        if (data && !data.error) {
            candleSeries.setData(data);
            
            // Extraer y pintar la línea de Media Móvil (SMA 20)
            const smaData = data
                .filter(d => d.sma_20 !== undefined)
                .map(d => ({ time: d.time, value: d.sma_20 }));
            if (smaData.length > 0) {
                smaSeries.setData(smaData);
            }
            const vwapData = data.filter(d => d.vwap !== undefined && d.vwap !== null).map(d => ({ time: d.time, value: d.vwap }));
            if (vwapData.length > 0) {
                vwapSeries.setData(vwapData);
            }
            const currentPriceElement = document.getElementById('currentPrice');
            currentPrice = data[data.length - 1].close; 
            currentPriceElement.innerText = `$${currentPrice.toLocaleString()}`;
            updateCapitalDisplay();
            logToTerminal('Gráfico actualizado con datos reales.', 'action');
        } else {
            logToTerminal('Error de datos: ' + data.error, 'error');
        }
    } catch (error) {
        logToTerminal(`Fallo al conectar con FastAPI: ${error.message}`, 'error');
    }
}

// Cargar datos al iniciar
fetchMarketData();

window.addEventListener('resize', () => {
    chart.applyOptions({ width: chartContainer.clientWidth });
});

// Ciclo de IA (Cada 15 segundos)
let isAgentActive = false;
let simulateInterval;

agentToggle.addEventListener('click', () => {
    isAgentActive = !isAgentActive;
    if (isAgentActive) {
        agentToggle.innerText = 'Detener Agente (Kill Switch)';
        agentToggle.classList.replace('bg-blue-600', 'bg-red-600');
        agentToggle.classList.replace('hover:bg-blue-700', 'hover:bg-red-700');
        logToTerminal('Agente activado. Iniciando análisis cuantitativo.', 'info');
        
        const ejecutarAnalisis = async () => {
            if (!isAgentActive) return;

            // Verificar si estamos dentro del horario de operación
            const scheduleMode = document.getElementById('scheduleModeSelect')?.value || 'libre';
            if (scheduleMode === 'custom') {
                const startTime = document.getElementById('timeStart').value;
                const endTime = document.getElementById('timeEnd').value;
                const now = new Date();
                const currentMinutes = now.getHours() * 60 + now.getMinutes();
                
                const [startH, startM] = startTime.split(':').map(Number);
                const [endH, endM] = endTime.split(':').map(Number);
                const startMinutes = startH * 60 + startM;
                const endMinutes = endH * 60 + endM;

                let isDentroDeHorario = false;
                if (startMinutes <= endMinutes) {
                    isDentroDeHorario = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
                } else {
                    isDentroDeHorario = currentMinutes >= startMinutes || currentMinutes <= endMinutes;
                }

                if (!isDentroDeHorario) {
                    logToTerminal(`⏳ Fuera de horario operativo (${startTime} - ${endTime}). Análisis pausado...`, 'warn');
                    simulateInterval = setTimeout(ejecutarAnalisis, 60000);
                    return;
                }
            }

            const engine = document.getElementById('engineSelect')?.value || 'local';
            logToTerminal(`Consultando Orquestador (${currentSymbol}) vía ${engine.toUpperCase()}...`, 'info');
            try {
                const tpSlVal = document.getElementById('tpSlSelect')?.value || "3.0|-2.0";
                const [tpStr, slStr] = tpSlVal.split('|');
                const riskVal = document.getElementById('riskSelect')?.value || "0.25";
                
                const url = `http://localhost:18767/api/market/analysis?symbol=${currentSymbol}&timeframe=${document.getElementById('timeframeSelect')?.value || '1m'}&engine=${engine}&tp=${tpStr}&sl=${Math.abs(parseFloat(slStr))}&risk=${riskVal}`;
                const response = await fetch(url);
                const data = await response.json();
                
                if (data && !data.error) {
                    let logType = 'info';
                    if (data.signal === 'COMPRAR') logType = 'action';
                    if (data.signal === 'VENDER') logType = 'error';
                    
                    logToTerminal(`[${data.signal}] RSI: ${data.indicators.rsi} | SMA20: ${data.indicators.sma_20}`, 'warn');
                    logToTerminal(`Razonamiento: ${data.reason}`, logType);
                    
                    // Lógica de Paper Trading & Copiloto
                    const baseCoin = currentSymbol.split('/')[0];
                    const executionMode = document.getElementById('executionModeSelect')?.value || 'copilot';
                    
                    const isBuyable = data.signal === 'COMPRAR' && portfolio.balances[getCurrency(currentSymbol)] > 10;
                    const isSellable = data.signal === 'VENDER' && portfolio.ASSET > 0.0001;
                    
                    if (isBuyable || isSellable) {
                        if (executionMode === 'auto') {
                            executeTrade(data.signal, baseCoin, currentPrice);
                        } else {
                            // Detener momentáneamente el ciclo para no spamear
                            isAgentActive = false;
                            document.getElementById('agentToggle').innerText = 'Activar Agente';
                            document.getElementById('agentToggle').classList.replace('bg-red-600', 'bg-blue-600');
                            document.getElementById('agentToggle').classList.replace('hover:bg-red-700', 'hover:bg-blue-700');
                            showCopilotModal(data.signal, data.reason, baseCoin, currentPrice);
                        }
                    }
                } else {
                    logToTerminal('Error de análisis: ' + data.error, 'error');
                }
            } catch (err) {
                logToTerminal('Fallo de conexión con el Agente Python.', 'error');
            }

            // Calcular próximo intervalo basado en temporalidad
            if (isAgentActive) {
                const tf = document.getElementById('timeframeSelect')?.value || '1m';
                let delayMs = 60000; // Por defecto 1 min
                if (tf === '5m') delayMs = 300000;
                if (tf === '15m') delayMs = 900000;
                
                // Si el motor es local, podemos ir más rápido (ej 10 segs) porque es gratis, pero si es IA respetamos las velas
                if (engine === 'local') delayMs = 15000;

                simulateInterval = setTimeout(ejecutarAnalisis, delayMs);
            }
        };

        ejecutarAnalisis(); // Iniciar primer ciclo
    } else {
        agentToggle.innerText = 'Activar Agente';
        agentToggle.classList.replace('bg-red-600', 'bg-blue-600');
        agentToggle.classList.replace('hover:bg-red-700', 'hover:bg-blue-700');
        clearTimeout(simulateInterval);
        logToTerminal('Agente detenido.', 'warn');
    }
});

// Ciclo de Gráfico en Vivo (Cada 2 segundos) para que se mueva rápido
setInterval(async () => {
    try {
        const response = await fetch(`http://localhost:18767/api/market/history?symbol=${currentSymbol}&timeframe=${document.getElementById('timeframeSelect')?.value || '1m'}`);
        const data = await response.json();
        if (data && data.length > 0) {
            const latest_candle = data[data.length - 1];
            candleSeries.update(latest_candle);
            
            if (latest_candle.sma_20 !== undefined) {
                smaSeries.update({ time: latest_candle.time, value: latest_candle.sma_20 });
            }
            if (latest_candle.vwap !== undefined) {
                vwapSeries.update({ time: latest_candle.time, value: latest_candle.vwap });
            }
            
            const currentPriceElement = document.getElementById('currentPrice');
            currentPrice = latest_candle.close;
            currentPriceElement.innerText = `$${currentPrice.toLocaleString()}`;
            updateCapitalDisplay();

            // -- AGENTE DE RIESGO: Stop Loss y Take Profit Dinámicos --
            if (portfolio.ASSET > 0.0001 && portfolio.entryPrice > 0) {
                const pnlPct = ((currentPrice - portfolio.entryPrice) / portfolio.entryPrice) * 100;
                
                const tpSlVal = document.getElementById('tpSlSelect')?.value || "1.5|-1.0";
                const [tpStr, slStr] = tpSlVal.split('|');
                const takeProfitLimit = parseFloat(tpStr);
                const stopLossLimit = parseFloat(slStr);
                
                // Stop Loss
                if (pnlPct <= stopLossLimit) {
                    logToTerminal(`⚠️ AGENTE DE RIESGO: Stop Loss alcanzado (${stopLossLimit}%). Vendiendo para proteger capital.`, 'error');
                    executeTrade('VENDER', currentSymbol.split('/')[0], currentPrice, 'Stop Loss');
                }
                // Take Profit
                else if (pnlPct >= takeProfitLimit) {
                    logToTerminal(`🎯 AGENTE DE RIESGO: Take Profit alcanzado (+${takeProfitLimit}%). Asegurando ganancias.`, 'action');
                    executeTrade('VENDER', currentSymbol.split('/')[0], currentPrice, 'Take Profit');
                }
            }
        }
    } catch (err) {
        // Silencioso para no ensuciar la consola
    }
}, 2000);

// Agente Sentimiento (Cada 60 segundos)
async function updateSentiment() {
    try {
        const source = document.getElementById('newsSourceSelect')?.value || 'coindesk';
        const response = await fetch(`http://localhost:18767/api/market/sentiment?symbol=${currentSymbol}&source=${source}`);
        const data = await response.json();
        if (data && !data.error) {
            const badge = document.getElementById('sentimentScoreBadge');
            const container = document.getElementById('sentimentNewsContainer');
            
            badge.innerText = `${data.score} (${data.estado})`;
            
            const needle = document.getElementById('sentimentNeedle');
            if (needle) {
                const percent = ((data.score + 1) / 2) * 100;
                needle.style.left = `${Math.max(0, Math.min(100, percent))}%`;
            }
            
            if (data.estado === 'BULLISH') {
                badge.className = 'text-xs bg-green-900 text-green-400 px-2 py-1 rounded font-bold';
            } else if (data.estado === 'BEARISH') {
                badge.className = 'text-xs bg-red-900 text-red-400 px-2 py-1 rounded font-bold';
            } else {
                badge.className = 'text-xs bg-gray-900 text-gray-400 px-2 py-1 rounded font-bold';
            }
            
            container.innerHTML = '';
            data.noticias.forEach(news => {
                let colorClass = 'border-gray-500';
                if (news.score > 0) colorClass = 'border-green-500';
                if (news.score < 0) colorClass = 'border-red-500';
                
                const div = document.createElement('div');
                div.className = `bg-gray-900 p-2 rounded border-l-2 ${colorClass}`;
                div.innerHTML = `
                    <p class="text-[10px] text-gray-400 flex justify-between">
                        <span>📰 CoinDesk</span>
                        <span>Score: ${news.score}</span>
                    </p>
                    <p class="text-xs text-gray-200 mt-1">${news.title}</p>
                `;
                container.appendChild(div);
            });
        }
    } catch (err) {
        console.error("Fallo el Agente de Sentimiento", err);
    }
}
updateSentiment();
setInterval(updateSentiment, 60000);

const newsSourceSelect = document.getElementById('newsSourceSelect');
if (newsSourceSelect) {
    newsSourceSelect.addEventListener('change', () => {
        logToTerminal(`Cambiando fuente de sentimiento a ${newsSourceSelect.value}...`, 'info');
        updateSentiment();
    });
}

document.getElementById('clearLogs').addEventListener('click', () => {
    terminal.innerHTML = '';
});

// -- Funciones de Trading y Copiloto --

function renderTradeHistory() {
    const tbody = document.getElementById('tradeHistoryBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (tradeHistoryLog.length === 0) {
        tbody.innerHTML = `<tr id="emptyHistoryRow"><td colspan="6" class="px-4 py-4 text-center text-gray-600 italic">No hay operaciones registradas aún.</td></tr>`;
        return;
    }
    
    tradeHistoryLog.forEach(trade => {
        let statusClass = 'text-gray-400';
        if (trade.status === 'Ejecutada') statusClass = 'text-green-400 font-bold';
        if (trade.status === 'Rechazada') statusClass = 'text-red-400 font-bold';
        let typeClass = trade.signal === 'COMPRAR' ? 'text-green-500' : 'text-red-500';
        
        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-700/50 hover:bg-gray-700/20';
        tr.innerHTML = `
            <td class="px-4 py-2">${trade.timeString}</td>
            <td class="px-4 py-2 font-bold">${trade.baseCoin}/USDT</td>
            <td class="px-4 py-2 ${typeClass}">${trade.signal}</td>
            <td class="px-4 py-2 font-mono">$${trade.price.toLocaleString()}</td>
            <td class="px-4 py-2 ${statusClass}">${trade.status}</td>
            <td class="px-4 py-2 text-xs">${trade.mode}</td>
        `;
        tbody.appendChild(tr);
    });
}

function addTradeToHistory(signal, baseCoin, price, status, mode) {
    const timeString = new Date().toLocaleTimeString();
    tradeHistoryLog.unshift({ timeString, signal, baseCoin, price, status, mode });
    
    // Guardar en persistencia
    localStorage.setItem('ai_trade_history', JSON.stringify(tradeHistoryLog));
    
    renderTradeHistory();
}

function executeTrade(signal, baseCoin, price, mode = 'Automático') {
    if (signal === 'COMPRAR') {
        // Gestión de Capital Dinámica
        const riskFactor = parseFloat(document.getElementById('riskSelect')?.value || "0.25");
        const currency = getCurrency(currentSymbol);
        const maxRiesgo = portfolio.balances[currency] * riskFactor;
        const tradeAmount = maxRiesgo;
        
        if (tradeAmount < 5) {
            logToTerminal('⚠️ Saldo insuficiente para abrir nueva posición.', 'error');
            return;
        }

        const cantidadAComprar = tradeAmount / price;
        
        // Promediar precio de entrada si el bot hace DCA (compras múltiples)
        const valorPrevio = portfolio.ASSET * portfolio.entryPrice;
        const valorNuevo = cantidadAComprar * price;
        
        portfolio.ASSET += cantidadAComprar;
        portfolio.balances[currency] -= tradeAmount;
        portfolio.entryPrice = (valorPrevio + valorNuevo) / portfolio.ASSET;
        
        logToTerminal(`💰 SIMULACIÓN: COMPRADO ${cantidadAComprar.toFixed(4)} ${baseCoin} a $${price.toLocaleString()} (Inversión: $${tradeAmount.toFixed(2)})`, 'action');
    } else if (signal === 'VENDER') {
        const dolaresObtenidos = portfolio.ASSET * price;
        const currency = getCurrency(currentSymbol);
        portfolio.balances[currency] += dolaresObtenidos;
        portfolio.ASSET = 0;
        portfolio.entryPrice = 0;
        logToTerminal(`💵 SIMULACIÓN: VENDIDO ${baseCoin} a $${price.toLocaleString()}. Nuevo Saldo ${currency}: $${portfolio.balances[currency].toFixed(2)}`, 'error');
    }
    
    // Guardar en el navegador (Persistencia)
    localStorage.setItem('ai_portfolio_v2', JSON.stringify(portfolio));
    
    updateCapitalDisplay();
    addTradeToHistory(signal, baseCoin, price, 'Ejecutada', mode);
}

let pendingTrade = null;
const modal = document.getElementById('copilotModal');

function showCopilotModal(signal, reason, baseCoin, price) {
    document.getElementById('copilotMessage').innerText = `El Agente recomienda ${signal} ${baseCoin} a $${price.toLocaleString()}`;
    document.getElementById('copilotReason').innerText = `Razonamiento: ${reason}`;
    modal.classList.remove('hidden');
    pendingTrade = { signal, baseCoin, price };
}

document.getElementById('btnReject').addEventListener('click', () => {
    modal.classList.add('hidden');
    if (pendingTrade) {
        logToTerminal('❌ Operación rechazada por el usuario.', 'warn');
        addTradeToHistory(pendingTrade.signal, pendingTrade.baseCoin, pendingTrade.price, 'Rechazada', 'Copiloto');
        pendingTrade = null;
    }
    // Reactivar ciclo
    agentToggle.click(); // Vuelve a encender el agente que se habia pausado al mostrar el modal
});

document.getElementById('btnApprove').addEventListener('click', () => {
    modal.classList.add('hidden');
    if (pendingTrade) {
        logToTerminal('✅ Operación aprobada por el usuario.', 'action');
        executeTrade(pendingTrade.signal, pendingTrade.baseCoin, pendingTrade.price, 'Copiloto');
        pendingTrade = null;
    }
    // Reactivar ciclo
    agentToggle.click(); // Vuelve a encender el agente que se habia pausado al mostrar el modal
});

// Cierre Manual de Emergencia
window.forceClosePosition = function() {
    if (portfolio.ASSET > 0) {
        logToTerminal(`⚠️ CIERRE MANUAL: El usuario forzó el cierre de la posición en curso.`, 'error');
        const baseCoin = currentSymbol.split('/')[0];
        executeTrade('VENDER', baseCoin, currentPrice, 'Manual');
        
        // Apagar el agente temporalmente si estaba encendido para evitar que compre inmediatamente
        if (isAgentActive) {
            agentToggle.click();
            logToTerminal(`Agente detenido automáticamente por cierre manual. Vuelve a activarlo cuando desees.`, 'warn');
        }
    }
};

// Al cargar la página, restaurar el historial visual
document.addEventListener('DOMContentLoaded', () => {
    renderTradeHistory();
});

// Funciones interactivas de la Bóveda
window.inyectarCapital = function(amount) {
    portfolio.balances[getCurrency(currentSymbol)] += amount;
    localStorage.setItem('ai_portfolio_v2', JSON.stringify(portfolio));
    logToTerminal(`💸 DEPÓSITO: Se han inyectado $${amount} de liquidez al Agente.`, 'action');
    updateCapitalDisplay();
};


// Listeners de la nueva UI de Configuración
document.getElementById('saveApiKeyBtn')?.addEventListener('click', async () => {
    const key = document.getElementById('apiKeyInput').value;
    if(!key) return;
    try {
        const response = await fetch('http://localhost:18767/api/config/gemini', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({api_key: key})
        });
        const data = await response.json();
        logToTerminal(data.message, 'action');
        const status = document.getElementById('apiKeyStatus');
        if (status) {
            status.classList.remove('hidden');
            setTimeout(() => status.classList.add('hidden'), 3000);
        }
    } catch(err) {
        logToTerminal('Error al guardar API Key en el backend.', 'error');
    }
});

document.getElementById('timeframeSelect')?.addEventListener('change', () => {
    logToTerminal(`Cambiando temporalidad a ${document.getElementById('timeframeSelect').value}...`, 'warn');
    candleSeries.setData([]);
    smaSeries.setData([]);
    vwapSeries.setData([]);
    fetchMarketData();
});

document.getElementById('riskSelect')?.addEventListener('change', () => {
    logToTerminal(`Riesgo actualizado a: ${document.getElementById('riskSelect').options[document.getElementById('riskSelect').selectedIndex].text}`, 'info');
});

document.getElementById('tpSlSelect')?.addEventListener('change', () => {
    logToTerminal(`Límites de ganancia/pérdida actualizados a: ${document.getElementById('tpSlSelect').options[document.getElementById('tpSlSelect').selectedIndex].text}`, 'info');
});

document.getElementById('engineSelect')?.addEventListener('change', () => {
    logToTerminal(`Motor de Análisis cambiado a: ${document.getElementById('engineSelect').options[document.getElementById('engineSelect').selectedIndex].text}`, 'warn');
});


```

---
**INSTRUCCIÓN FINAL PARA CLAUDE:**
Basándote en el código anterior, comienza tu auditoría. Sé brutalmente honesto. ¿Dónde se romperá el sistema si la IA envía señales basura? ¿Dónde fallará la matemática del Paper Trading si compro 2 activos distintos de la misma moneda al mismo tiempo? Presenta tu diagnóstico y tus correcciones en código.

5. **ENTREGABLE FINAL (PROMPT DE IMPLEMENTACIÓN):** Al final de tu respuesta, debes generar un bloque de texto (encerrado en un bloque de código) que contenga un PROMPT que yo pueda copiar y pegarle a mi otro asistente de IA (Gemini/Antigravity) que está manejando mi código local. Este prompt debe decirle al otro asistente EXACTAMENTE qué archivos modificar, qué líneas borrar y qué código nuevo insertar para aplicar tus soluciones. De esta manera, gasto mis tokens contigo solo para la arquitectura, y mi asistente local hace el trabajo manual.

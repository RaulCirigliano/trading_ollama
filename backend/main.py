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

class TradeLogRequest(BaseModel):
    timeString: str
    symbol: str
    signal: str
    price: float
    status: str
    mode: str

@app.post("/api/log_trade")
def log_trade(trade: TradeLogRequest):
    import csv
    try:
        # Save in the root of the project, one level up from backend/
        file_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "historial_trades.csv")
        file_exists = os.path.isfile(file_path)
        with open(file_path, mode='a', newline='', encoding='utf-8') as file:
            writer = csv.writer(file)
            if not file_exists:
                writer.writerow(["Time", "Symbol", "Signal", "Price", "Status", "Mode"])
            writer.writerow([trade.timeString, trade.symbol, trade.signal, trade.price, trade.status, trade.mode])
        return {"status": "success", "message": "Trade logged successfully"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=18767, reload=True)

# 🕵️‍♂️ Protocolo de Auditoría y Verificación de Seguridad para Claude Sonnet (5.5 / 3.5)

**INSTRUCCIÓN PARA EL USUARIO:** 
Copia todo el contenido de este archivo (o sube el archivo `CLAUDE_SONNET_AUDITOR_PROMPT.md` directamente) a la ventana de chat con **Claude Sonnet**. Claude ejecutará una auditoría técnica integral y exhaustiva como Ingeniero Principal de Ciberseguridad y Sistemas Cuantitativos.

---
---

## 🤖 ROL Y OBJETIVO DEL AUDITOR (CLAUDE SONNET)

Actúa como un **Lead Software Security Engineer & Quantitative Systems Architect** especializado en sistemas de Trading Algorítmico de Alta Frecuencia (HFT), aplicaciones asíncronas y ciberseguridad financiera.

Tu misión es realizar una **Auditoría Técnica Cruzada y Análisis de Vulnerabilidades** sobre el código fuente de esta plataforma de trading algorítmico, examinando rigurosamente los últimos parches de estabilidad, blindaje de precios, ingesta de noticias contrarian y rendimiento en hardware local.

---

## 🛡️ ANTECEDENTES Y CAMBIOS A AUDITAR

En este ciclo de desarrollo e ingeniería se aplicaron 4 parches estructurales en respuesta a fallas operativas y nuevas capacidades solicitadas:

### 1. Mitigación de Fuga de Memoria y Colapso por Swap Thrashing (RAM <= 16 GB)
* **Diagnóstico previo:** En sesiones 24/7 ininterrumpidas, la consola de logs (`#terminal`) acumulaba decenas de miles de nodos en el DOM de Google Chrome, provocando consumos de varios gigabytes de RAM y colapsando el sistema operativo Linux por saturación de Swap.
* **Parche aplicado:** Poda circular automática estricta en `frontend/js/app.js`:
  ```javascript
  while (terminal.children.length > 300) {
      terminal.removeChild(terminal.firstChild);
  }
  ```

### 2. Forensics y Blindaje del Bug de "Ganancia Fantasma" ($5.492 USDT en 2 segundos)
* **Diagnóstico previo:** Al alternar de una acción argentina cotizada en pesos (`TXAR.BA` a 746 ARS) hacia `BTC/USDT`, la variable en memoria `currentPrice` retuvo 746.26 mientras la petición de Binance viajaba por la red. La IA disparó una orden comprando 0.066 BTC a $746, y dos segundos después el monitor de riesgo leyó $82.553, liquidando la posición con +10.950% de beneficio espurio.
* **Parche aplicado en 4 capas:**
  1. *Invalidación Inmediata al cambiar activo:* En `symbolSelect.addEventListener('change')`, se resetea:
     `currentPrice = 0; currentPriceSymbol = ''; currentPriceTs = 0;` y el DOM muestra `$--.---`.
  2. *Etiquetado estricto:* `currentPriceSymbol` valida que el precio corresponda al par activo.
  3. *Prioridad a datos del backend:* En `ejecutarAnalisis()`, la compra toma el precio verificado de la última vela devuelta por FastAPI (`data.indicators.current_price`).
  4. *Filtro de consistencia:* En `executeTrade()`, si la orden difiere en más o menos del 50% (`ratio < 0.5 || ratio > 2.0`), se cancela automáticamente.

### 3. Selector de Inteligencia en el Lobby Pre-Market y Soporte DeepSeek-R1
* **Lobby Visual:** Selector `#lobbyEngineSelect` en `frontend/index.html` para elegir entre DeepSeek-R1 (Razonamiento), Ollama Base (Llama 3) o Google Gemini.
* **Soporte DeepSeek-R1 en `backend/premarket_digest.py`:** Aumento de timeout a 180s y regex para podar el bloque `<think>.*?</think>`.
* **Sincronización:** El consenso se inyecta en el campo de contexto macroeconómico de la Trinchera al pulsar *"Iniciar Trinchera"*.

### 4. Ingesta de Noticias Multicanal y Filosofía Contrarian (Tres Verdades Contraintuitivas)
* **Tres Canales RSS:**
  - Finanzas globales y economía macro.
  - Criptomonedas y sentimiento de mercado.
  - Referentes de opinión contraria y análisis de ciclos (Carlos Maslatón, Ondas de Elliott).
* **Entrenamiento de Modelos:** `Modelfile` (Llama 3) y `Modelfile-deepseek` (DeepSeek-R1 8B) recompilados en Ollama con directivas de no comprar en techos por euforia, respetar el VWAP y proteger el capital ante ruido.
* **Documentación:** Creada `guias/Tres_Verdades_Contraintuitivas_del_Mercado.md`.

---

## 🎯 EJES DE AUDITORÍA REQUERIDOS (PARA CLAUDE SONNET)

Por favor, analiza el código y la documentación provistos a continuación y responde en detalle a los siguientes 6 ejes:

### Eje 1: Blindaje de Precios Multi-Activo y Condiciones de Carrera
1. ¿Existe alguna condición de carrera (`race condition`), latencia de red asíncrona o cambio veloz de pares en la UI donde una orden de compra o venta pueda ejecutarse con un precio obsoleto o perteneciente a otro activo?
2. ¿El rango de tolerancia `0.5 < ratio < 2.0` en `executeTrade()` es óptimo para filtrar desincronizaciones de precio sin bloquear operaciones legítimas de alta volatilidad?

### Eje 2: Ingesta RSS Multicanal y Resiliencia Concurrente
1. En `backend/premarket_digest.py` (`fetch_contrarian_and_market_news`), ¿los timeouts de 6 segundos y el bucle iterativo sobre Google News garantizan que no se congele el hilo principal si Google rate-limita o bloquea las peticiones?
2. ¿La sanitización con `clean_text()` previene con total certeza inyecciones de prompts en los modelos LLM?

### Eje 3: Robustez de DeepSeek-R1 y Extracción JSON
1. En `backend/premarket_digest.py`, se utiliza `re.sub(r'<think>.*?</think>', '', raw_text, flags=re.DOTALL | re.IGNORECASE)` y luego `re.search(r'\{.*\}', raw_response_text, re.DOTALL)`. ¿Qué sucede si DeepSeek genera un tag `<think>` incompleto (ej. cortado por tokens máximos) o si incluye bloques JSON anidados o de ejemplo dentro de su razonamiento?

### Eje 4: Poda de Memoria y Operación Continua 24/7 en Linux
1. ¿El recorte de la consola a 300 elementos DOM (`terminal.children.length > 300`) y los timers (`riskTick` cada 2s, gráfico cada 2s) son suficientes para asegurar que una notebook (AMD Ryzen 7, 16 GB RAM) corra 24 horas continuas sin acumulación de swap ni degradación térmica?

### Eje 5: Auditoría Holística de Errores Generales y Consistencia Documental
1. **Errores generales en código:** Detecta cualquier error de sintaxis, tipos, variables no declaradas o globales en JavaScript, promesas no capturadas (`unhandled rejections`), fugas de eventos o desajustes de concurrencia en Python (FastAPI / Threading / Requests).
2. **Coherencia Documento vs. Código (`CONTEXTO.md`):** Compara las directivas formales de `CONTEXTO.md` (Secciones 2, 3 y 6: Aislamiento JIT, Sweep-Back, matemática anti-overtrading, Circuit Breaker) con el código implementado. ¿Existen contradicciones, "promesas rotas" o reglas descritas en la documentación que no se estén respetando fielmente en el código fuente?
3. **Casos Borde Financieros (Edge Cases):** ¿Hay escenarios extremos de mercado (ej. caída a 0 de un activo, división por cero, reconexión tras corte de internet, cambio de hora o reinicio forzado del navegador con orden abierta) que no estén cubiertos y puedan comprometer el balance?

### Eje 6: Matriz Formal de Hallazgos y Parches de Código
Estructura tus conclusiones en una tabla formal clasificada por severidad:
`[CRÍTICO / ALTO / MEDIO / BAJO / INFORMATIVO]` especificando:
- **ID del Hallazgo**
- **Archivo y Línea Afectada**
- **Tipo de Defecto:** (Seguridad / Concurrencia / Lógica Financiera / Error General / Discrepancia Documental)
- **Descripción de la Falla y Riesgo Asociado**
- **Parche de Código Concreto Recomendado**

---

## 💻 CÓDIGO FUENTE DEL PROYECTO

### 1. Satélite de Consenso Pre-Market (`backend/premarket_digest.py`)
```python
import os
import re
import json
import requests
from collections import defaultdict
from typing import List, Dict, Any
from dotenv import load_dotenv

load_dotenv()

from backend.radar_inbox import RadarInbox, OpportunityCard

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

def clean_text(text: str, max_len: int = 300) -> str:
    """Elimina caracteres de control y acota longitud."""
    if not text:
        return ""
    text = str(text)[:max_len]
    cleaned = "".join(ch for ch in text if ch in ('\n', '\t') or (ord(ch) >= 32 and ord(ch) != 127))
    return cleaned.strip()

def validate_llm_digest(data: Any) -> Dict[str, Any]:
    if not isinstance(data, dict):
        return {"status": "error", "message": "Respuesta inválida del modelo: raíz no es objeto JSON."}

    resumen = data.get("resumen_general")
    if not isinstance(resumen, str) or not resumen.strip():
        return {"status": "error", "message": "Respuesta inválida del modelo: falta resumen_general válido."}
    resumen = resumen.strip()[:500]

    activos_raw = data.get("activos")
    if not isinstance(activos_raw, list):
        return {"status": "error", "message": "Respuesta inválida del modelo: activos debe ser una lista."}

    validados = []
    symbol_regex = re.compile(r'^[A-Za-z0-9=./\-]{1,15}$')
    valid_consensos = {"ALCISTA", "BAJISTA", "NEUTRAL", "PELIGRO"}

    for item in activos_raw[:10]:
        if not isinstance(item, dict):
            continue
        sym = str(item.get("simbolo", "")).strip().upper()
        if not symbol_regex.match(sym):
            continue

        consenso = str(item.get("consenso_direccional", "NEUTRAL")).strip().upper()
        if consenso not in valid_consensos:
            consenso = "NEUTRAL"

        razonamiento = clean_text(str(item.get("razonamiento", "")), max_len=300)
        auth = bool(item.get("autorizar_operacion", False))

        validados.append({
            "simbolo": sym,
            "consenso_direccional": consenso,
            "razonamiento": razonamiento,
            "autorizar_operacion": auth
        })

    return {
        "status": "success",
        "resumen_general": resumen,
        "activos": validados
    }

def fetch_contrarian_and_market_news() -> List[str]:
    """Extrae titulares recientes de finanzas globales, cripto y análisis contrarian/referentes como Maslatón."""
    import feedparser
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    queries = [
        ('https://news.google.com/rss/search?q=economy+global+markets+finance&hl=en-US&gl=US&ceid=US:en', 3),
        ('https://news.google.com/rss/search?q=mercado+financiero+bitcoin+acciones+OR+bolsa&hl=es-419&gl=AR&ceid=AR:es-419', 3),
        ('https://news.google.com/rss/search?q=Carlos+Maslaton+mercado+OR+bitcoin+OR+bolsa&hl=es-419&gl=AR&ceid=AR:es-419', 3)
    ]
    headlines = []
    for url, limit in queries:
        try:
            r = requests.get(url, headers=headers, timeout=6)
            if r.status_code == 200:
                feed = feedparser.parse(r.content)
                for entry in feed.entries[:limit]:
                    clean_title = clean_text(entry.title, 200)
                    if clean_title and clean_title not in headlines:
                        headlines.append(clean_title)
        except Exception:
            continue
    return headlines

def run_premarket_digest(engine: str = "gemini") -> Dict[str, Any]:
    inbox = RadarInbox()
    active_cards = inbox.get_active_cards(hours_ttl=72)
    fresh_headlines = fetch_contrarian_and_market_news()
    
    if not active_cards and not fresh_headlines:
        return {
            "status": "idle",
            "message": "Buzón vacío y sin noticias frescas disponibles para procesar."
        }
    
    cards_by_asset = defaultdict(list)
    active_cards.sort(key=lambda x: x.timestamp, reverse=True)
    
    for card in active_cards:
        if len(cards_by_asset[card.activo]) < 3:
            cards_by_asset[card.activo].append(card)
    
    report_lines = []
    for asset, cards in cards_by_asset.items():
        report_lines.append(f"\n--- Activo: {asset} ---")
        for c in cards:
            titular_clean = clean_text(c.titular, 300)
            just_clean = clean_text(c.justificacion, 300)
            report_lines.append(f"[{c.timestamp}] Confianza: {c.confianza}% | Impacto: {c.impacto} | Titular: {titular_clean}")
            report_lines.append(f"Justificación: {just_clean}")
    
    report_text = "\n".join(report_lines) if report_lines else "Sin eventos previos en el buzón satélite."
    headlines_text = "\n".join(f"- {h}" for h in fresh_headlines) if fresh_headlines else "Sin titulares RSS adicionales."
    
    prompt = f"""
Eres el Cerebro Principal de un sistema de Trading Algorítmico ejecutando la rutina de "Despertar Pre-Market".
Analiza la información recolectada del mercado y los análisis de operadores y medios especializados:

<datos_buzon>
{report_text}
</datos_buzon>

<titulares_frescos_y_referentes>
{headlines_text}
</titulares_frescos_y_referentes>

DIRECTIVAS ESTRATÉGICAS DE EVALUACIÓN (Las Tres Verdades Contraintuitivas & Análisis Contrarian):
1. PSICOLOGÍA DE MASAS Y OPINIÓN CONTRARIA:
   - Analiza el sentimiento general y las opiniones de operadores de mercado reconocidos (ej. análisis de ciclos, Carlos Maslatón, Ondas de Elliott).
   - Si la multitud o las noticias reflejan EUFORIA extrema o complacencia en techos, califica como PELIGRO / distribución inminente.
   - Si hay PÁNICO extremo, pesimismo generalizado o desánimo pero el activo muestra soporte o suelo, busca OPORTUNIDADES de rebote (comprar el dolor).
2. TENDENCIA SECULAR Y FLUJO INSTITUCIONAL:
   - Pondera la tendencia estructural de largo plazo en índices líderes (SPY, QQQ) y la escasez fija de Bitcoin frente a la emisión de dinero fiat.
3. ASIMETRÍA DE RIESGO:
   - Autoriza operación ("autorizar_operacion": true) ÚNICAMENTE si la relación beneficio/riesgo es asimétrica y favorable al inversor. Si el mercado está indeciso o peligroso, marca "NEUTRAL" o "PELIGRO" con "autorizar_operacion": false.

Debes responder ÚNICAMENTE en formato JSON válido estricto, sin markdown ni explicaciones adicionales:
{{
    "resumen_general": "Breve descripción general de la apertura del mercado bajo el prisma contrarian (máximo 500 caracteres).",
    "activos": [
        {{
            "simbolo": "BTC/USDT",
            "consenso_direccional": "ALCISTA",
            "razonamiento": "Justificación consolidada de máximo 300 caracteres.",
            "autorizar_operacion": true
        }}
    ]
}}
"""

    raw_response_text = ""
    if engine in ["gemini", "ai"]:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key or api_key == "tu_clave_aqui_sin_comillas":
            return {"status": "error", "message": "Falta GEMINI_API_KEY configurada en .env"}
        
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
            llm = ChatGoogleGenerativeAI(model=model_name, google_api_key=api_key, temperature=0.2)
            response = llm.invoke(prompt)
            if isinstance(response.content, list):
                raw_response_text = "".join([str(p.get("text", p)) if isinstance(p, dict) else str(p) for p in response.content]).strip()
            else:
                raw_response_text = str(response.content).strip()
        except Exception as e:
            return {"status": "error", "message": f"Error en Gemini ({model_name}): {str(e)}"}
            
    else: # Ollama local
        model_name = "trader-deepseek" if engine == "deepseek" else "trader-ia"
        timeout_sec = 180 if engine == "deepseek" else 120
        payload = {
            "model": model_name,
            "prompt": prompt,
            "stream": False
        }
        if engine != "deepseek":
            payload["format"] = "json"

        try:
            response = requests.post("http://localhost:11434/api/generate", json=payload, timeout=timeout_sec)
            
            if response.status_code == 200:
                data = response.json()
                raw_text = data.get("response", "").strip()
                clean_text = re.sub(r'<think>.*?</think>', '', raw_text, flags=re.DOTALL | re.IGNORECASE).strip()
                raw_response_text = clean_text if clean_text else raw_text
            else:
                return {"status": "error", "message": f"Ollama ({model_name}) devolvió código {response.status_code}"}
        except requests.exceptions.Timeout:
            return {"status": "error", "message": f"Timeout del motor {model_name} ({timeout_sec}s agotados)."}
        except Exception as e:
            return {"status": "error", "message": f"Ollama ({model_name}) no responde: {str(e)}"}

    json_match = re.search(r'\{.*\}', raw_response_text, re.DOTALL)
    if not json_match:
        return {"status": "error", "message": "Respuesta inválida del modelo: no se encontró JSON."}

    try:
        parsed_json = json.loads(json_match.group(0))
        return validate_llm_digest(parsed_json)
    except Exception as e:
        return {"status": "error", "message": f"Error parseando JSON del modelo: {str(e)}"}
```

---

### 2. Satélite de Buzón Persistente (`backend/radar_inbox.py`)
```python
import json
import os
import re
import time
import threading
from datetime import datetime, timedelta
from pydantic import BaseModel
from typing import List, Optional

_LOCK = threading.RLock()

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUZON_FILE = os.path.join(PROJECT_ROOT, "buzon_radar.json")

class OpportunityCard(BaseModel):
    id: str
    timestamp: str  # ISO format
    activo: str     # Ej: AAPL, BTC/USDT
    titular: str
    impacto: str    # "POSITIVO", "NEGATIVO", "NEUTRAL"
    confianza: int  # 0 a 100
    justificacion: str

class RadarInbox:
    def __init__(self, file_path: Optional[str] = None):
        self.file_path = file_path or BUZON_FILE
        self._insert_count = 0
        with _LOCK:
            self._ensure_file_exists()
            self.clear_expired_cards()

    def _ensure_file_exists():
        if not os.path.exists(self.file_path):
            self._atomic_write([])

    def _atomic_write(self, data: list):
        tmp_path = f"{self.file_path}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, self.file_path)

    def read_all_cards(self) -> List[OpportunityCard]:
        with _LOCK:
            if not os.path.exists(self.file_path):
                return []
            try:
                with open(self.file_path, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                    if not content:
                        return []
                    data = json.loads(content)
                    if not isinstance(data, list):
                        raise ValueError("Contenido no es lista")
                    return [OpportunityCard(**item) for item in data]
            except Exception as e:
                corrupt_path = f"{self.file_path}.corrupt-{int(time.time())}"
                try:
                    os.replace(self.file_path, corrupt_path)
                except Exception:
                    pass
                self._atomic_write([])
                return []

    def save_all_cards(self, cards: List[OpportunityCard]):
        with _LOCK:
            try:
                data = [card.model_dump() for card in cards]
                self._atomic_write(data)
            except Exception as e:
                pass

    def add_cards(self, new_cards: List[OpportunityCard]):
        if not new_cards:
            return
        with _LOCK:
            existing = self.read_all_cards()
            now = datetime.now()
            cutoff_6h = now - timedelta(hours=6)
            recent_seen = set()
            for c in existing:
                try:
                    ts = datetime.fromisoformat(c.timestamp)
                    if ts >= cutoff_6h:
                        recent_seen.add((c.activo.upper().strip(), re.sub(r'\s+', ' ', (c.titular or '').lower().strip())))
                except Exception:
                    pass

            cards_to_append = []
            for c in new_cards:
                key = (c.activo.upper().strip(), re.sub(r'\s+', ' ', (c.titular or '').lower().strip()))
                if key not in recent_seen:
                    recent_seen.add(key)
                    cards_to_append.append(c)

            if cards_to_append:
                existing.extend(cards_to_append)
                self.save_all_cards(existing)
```

---

### 3. Modelfile Ollama Llama 3 (`Modelfile`)
```dockerfile
FROM llama3
PARAMETER temperature 0.1
PARAMETER num_ctx 4096

SYSTEM """
Eres 'Trader-IA', un súper-ordenador algorítmico diseñado bajo la filosofía de los fondos cuantitativos de Wall Street.
Tu propósito es analizar datos técnicos del mercado financiero (Precio, VWAP, MACD, RSI, Bandas de Bollinger) y tomar decisiones de máxima asimetría.

TUS TRES VERDADES CONTRAINTUITIVAS Y REGLAS OPERATIVAS:
1. PSICOLOGÍA DE MASAS (Opinión Contraria):
   - Nunca compres por euforia o FOMO en techos (prohibido COMPRAR con RSI > 70 o sobreexpansión de Bollinger superior).
   - Busca comprar en zonas de sobreventa y limpieza de pánico cuando el precio rebota y recupera el VWAP.
2. SESGO DE ACTIVO Y VOLUMEN INSTITUCIONAL (El VWAP es el Rey):
   - Si Precio > VWAP, las instituciones controlan el mercado (sesgo alcista).
   - Si Precio < VWAP, hay distribución y debilidad (favorecer VENDER o MANTENER).
3. ASIMETRÍA MATEMÁTICA Y PRESERVACIÓN DE CAPITAL:
   - Eres un gestor frío y calculador. Si el mercado hace "ruido", hay divergencias o la ganancia neta proyectada no cubre holgadamente las comisiones del broker y el riesgo, tu obligación suprema es proteger el capital y responder MANTENER.

Tu respuesta debe ser estrictamente un JSON válido con las llaves "signal" y "reason", sin ningún otro comentario o markdown exterior:
{"signal": "MANTENER", "reason": "Explicacion concisa combinando VWAP, osciladores y psicologia de masa."}
"""
```

---

### 4. Modelfile Ollama DeepSeek-R1 (`Modelfile-deepseek`)
```dockerfile
FROM deepseek-r1:8b

PARAMETER temperature 0.2
PARAMETER top_p 0.9

SYSTEM """
Eres un modelo cuantitativo y macroeconómico de alto rendimiento basado en la arquitectura de razonamiento de DeepSeek-R1.
Tu objetivo es analizar datos financieros técnicos (RSI, MACD, VWAP), sentimiento y contexto macroeconómico para emitir veredictos de máxima asimetría.

TUS TRES VERDADES CONTRAINTUITIVAS Y REGLAS OPERATIVAS:
1. PSICOLOGÍA DE MASAS (Ondas de Elliott y Sentimiento Contrario):
   - Nunca compres en techos por euforia o titulares optimistas. Si el RSI > 70 o el precio perfora la banda superior de Bollinger, favorece VENDER o MANTENER.
   - Las mejores oportunidades institucionales surgen cuando la multitud entra en pánico (RSI < 30 y sobreventa extrema bajo bandas) y el precio encuentra soporte o rebota hacia el VWAP.
2. SESGO DE ACTIVO Y TENDENCIA SECULAR (El VWAP como Centro de Gravedad):
   - Respeta el flujo institucional: precios sostenidos por encima del VWAP confirman dominio comprador; bajo VWAP indican presión vendedora o distribución.
   - Pondera la tendencia secular y el viento de cola del activo frente a fluctuaciones de corto plazo.
3. ASIMETRÍA MATEMÁTICA Y PRESERVACIÓN DE CAPITAL:
   - Razona paso a paso como un gestor de fondos de cobertura.
   - Si los datos técnicos se contradicen, hay ruido o el beneficio neto no supera con holgura las comisiones del broker y el riesgo asumido, tu deber es proteger el capital y dictaminar MANTENER.
4. NO debes sugerir montos ni cantidades, solo la dirección analizada del mercado.

FORMATO DE SALIDA OBLIGATORIO:
Después de tu razonamiento paso a paso, tu última palabra DEBE incluir tu veredicto final encapsulado estrictamente entre corchetes, siendo una de estas tres opciones exactas:
[COMPRAR]
[VENDER]
[MANTENER]
"""
```

---

### 5. Fragmentos Críticos de Frontend (`frontend/js/app.js`)

#### A. Poda de DOM para Prevenir Fuga de Memoria
```javascript
function logToTerminal(message, type = 'info') {
    if (!terminal) return;
    const time = new Date().toLocaleTimeString();
    const p = document.createElement('p');
    let color = 'text-green-400';
    if (type === 'warn') color = 'text-yellow-400';
    if (type === 'error') color = 'text-red-400';
    if (type === 'action') color = 'text-blue-400';
    
    p.className = color;
    const timeSpan = document.createElement('span');
    timeSpan.className = 'text-gray-500';
    timeSpan.textContent = `[${time}] > `;
    p.appendChild(timeSpan);
    p.appendChild(document.createTextNode(String(message)));
    terminal.appendChild(p);
    
    // Limitar el buffer del DOM para evitar saturación de RAM en sesiones largas (<= 16 GB)
    while (terminal.children.length > 300) {
        terminal.removeChild(terminal.firstChild);
    }
    terminal.scrollTop = terminal.scrollHeight;
}
```

#### B. Invalidación Inmediata de Precio al Cambiar de Par
```javascript
symbolSelect.addEventListener('change', () => {
    currentSymbol = symbolSelect.value;
    logToTerminal(`Cambiando activo a ${currentSymbol}...`, 'warn');
    
    // Invalidad precio en pantalla y estado de activo para prevenir órdenes con precios desfasados
    currentPrice = 0;
    currentPriceSymbol = '';
    currentPriceTs = 0;
    const currentPriceElement = document.getElementById('currentPrice');
    if (currentPriceElement) currentPriceElement.innerText = '$--.---';
    updateChartHeaderTitles();

    window.positionAssetPrice = null;
    window.positionAssetPriceTs = 0;

    const pos = getOpenPosition();
    if (pos && pos.symbol !== currentSymbol) {
        logToTerminal(`ℹ️ Posición activa en ${pos.symbol}. El Agente de Riesgo continúa monitoreando tu posición de fondo mientras visualizas ${currentSymbol}.`, 'info');
        riskTick();
    }
});
```

#### C. Control de Precio en Análisis y Ejecución de Órdenes
```javascript
// Dentro de ejecutarAnalisis():
if (isBuyable) {
    if (data.indicators && typeof data.indicators.current_price === 'number' && data.indicators.current_price > 0) {
        execPrice = data.indicators.current_price;
    } else if (currentPriceSymbol === targetSymbol && currentPrice > 0) {
        execPrice = currentPrice;
    } else {
        logToTerminal(`⚠️ [SEGURIDAD] Compra abortada: sin precio verificado para ${targetSymbol} (sincronizando activo).`, 'error');
        return;
    }
}

// Dentro de executeTrade():
if (signal === 'COMPRAR') {
    if (currentPriceSymbol === effectiveSymbol && currentPrice > 0) {
        const ratio = price / currentPrice;
        if (ratio < 0.5 || ratio > 2.0) {
            logToTerminal(`🛑 [SEGURIDAD] Compra abortada: discrepancia severa de precio para ${effectiveSymbol} (orden: $${price} vs mercado: $${currentPrice}). Desincronización prevenida.`, 'error');
            return;
        }
    }
}
```

---

### 6. Guía de Filosofía y Psicología de Masas (`guias/Tres_Verdades_Contraintuitivas_del_Mercado.md`)
```markdown
# Guía Estratégica: Las Tres Verdades Contraintuitivas del Mercado Financiero

1. Primera Verdad: Psicología de Masas y Opinión Contraria
   - No comprar en euforia de techos ni vender en pánico de pisos.
   - Comprar cuando hay sangre en las calles y pesimismo generalizado.
2. Segunda Verdad: Selección de Activos con Viento de Cola
   - Activos respaldados por la matemática del sistema: S&P 500 (SPY), Nasdaq (QQQ) y Bitcoin (BTC/USDT).
3. Tercera Verdad: Asimetría Matemática (Riesgo vs. Beneficio)
   - Cortar pérdidas rápido y dejar correr ganancias protegiendo con Breakeven y comisiones cubiertas.
```

---

### 7. Documento Rector de Arquitectura y Reglas del Proyecto (`CONTEXTO.md`)
```markdown
# Proyecto: AI Trading Agent - Contexto y Arquitectura

## 1. Visión del Proyecto
Plataforma de trading algorítmico y cuantitativo de ejecución estrictamente local, diseñada para eliminar el factor emocional del inversor minorista. Se apoya en reglas matemáticas estrictas, gestión de capital inquebrantable y asistencia de modelos de Inteligencia Artificial (Local y Cloud) para analizar el mercado y tomar decisiones, probadas primero en simuladores hiperrealistas antes de operar con dinero real.

## 2. Arquitectura Actual (Separación de Concerns)
El proyecto divide Cliente y Servidor en un entorno 100% Local:
- Frontend (Dashboard): HTML, Tailwind CSS y JavaScript puro (app.js). Maneja UI, renderizado de velas y Paper Trading. Lobby Macro (pre-market) y Trinchera (live trading).
- Backend (FastAPI): Servidor local de Python con Binance (CCXT) y Yahoo Finance (yfinance). Motores de Análisis: Cerebro Principal (Ejecutor) y Escuadrón de IA (Asesores como Agente de Inversiones con Buzón Persistente y Pre-Market Digest).
- Seguridad de Endpoints: Protegidos con X-API-Token y restricción a localhost.
- Persistencia: Registro de operaciones en historial_trades.csv.

## 3. Reglas Críticas del Sistema (Core Rules)
1. Seguridad y Ejecución Local: Todo el código y claves viven en la PC del usuario.
2. Seguridad de Capital y Tesorería: Cuentas Ómnibus y transferencias Just-In-Time para aislar los fondos (Sección 6).
3. Milestone Checker: Retiro automático de porcentaje de ganancias a Bóveda Intocable al alcanzar hitos.
4. Protección de Horarios: Operación en ventanas de liquidez; al reanudar, lectura obligatoria del Buzón Persistente (Pre-Market Digest).

## 4. Roadmap (Próximos Pasos)
- Implementación del Agente de Inversiones: Lobby con selector de IA, Buzón Persistente, Ingesta Multicanal Contrarian (Maslatón/Elliott).
- Cálculo de Comisiones y Anti-Overtrading: Descuento de fees Round-Trip en Paper Trading y filtros de viabilidad.
- Hardening Integral (Fases 1, 2, 3 y 4): Mutex de ciclo/orden, getOpenPosition como única verdad, Circuit Breaker diario, Breakeven y Trailing Stop, guardas de servidor anti-DCA/huérfana, y sanitización anti-XSS / anti prompt-injection.
- Fase 5 - Transición a Live Trading: Simulación de slippage y spread, portfolio.positions multi-activo, event ledger SQLite.

## 5. Metodología de Desarrollo y Control de Versiones (Git)
- Línea base limpia en el repositorio remoto.
- Desarrollo 100% local sin commits automáticos.
- Regla de validación estricta: Solo commit y push cuando el usuario valide y apruebe explícitamente.

## 6. Grupo Central: Protocolos Estrictos de Live Trading (Dinero Real)
### 6.1. Cuentas Ómnibus: Aislamiento $0, Just-In-Time Funding desde la Bóveda y Sweep-Back inmediato al cerrar trade.
### 6.2. Matemática Financiera: Descontar Round-Trip y spread antes de abrir trade; filtro anti-overtrading (Fee Hurdle Rate); prohibición de micro-compras repetidas que desgasten capital; contabilidad de rentabilidad neta real.
### 6.3. Protocolos de Ejecución y Hardening:
- Mutex de ciclo (cycleInFlight) y orden (isExecutingTrade).
- Única fuente de verdad: getOpenPosition().
- Guardas del servidor FastAPI: anti-DCA (fuerza MANTENER si hay posición abierta) y anti-venta huérfana (fuerza MANTENER si no hay posición).
- Sanitización anti prompt-injection (sanitize_ctx) y anti-XSS (escapeHtml).
- Congelamiento inmutable de SL/TP en objeto de posición.
- Monitoreo en segundo plano de posición activa aunque el usuario cambie de gráfico.
- Scheduler determinista y modal Copiloto con expiración de 120s.
- Buzón persistente con atomic write (.tmp + replace) y autocura ante corrupción (.corrupt-<timestamp>).
- Apagado programado post-cierre (Graceful Shutdown) armado desde tabla o prompt.
- Segmentación de historial por sessionId.
- Poda circular del terminal DOM a 300 nodos para evitar fugas de memoria en sesiones 24/7.
- Recomendación de motor matemático ligero (<50 MB) para sesiones continuas en hardware <= 16 GB RAM.
### 6.4. Gestión de Riesgo Intradiario:
- Circuit Breaker diario persistido (3 pérdidas consecutivas o drawdown <= -3% detienen el bot por 24h).
- Breakeven automático al cubrir comisiones round-trip + 0.1%.
- Trailing Stop activado al alcanzar 60% del Take Profit, siguiendo el pico a distancia de 0.5%.
### 6.5. Invariantes para Live Trading (Fase 5):
- Órdenes Bracket / OCO obligatorias en <= 5s o liquidación a mercado (flatten).
- Asientos contables atómicos de doble partida (ALLOCATE / SWEEP_BACK).
- Claves de broker con permisos exclusivos de trading Spot/Margin (retiros prohibidos).
- Estado financiero en backend (base de datos relacional con índice unique parcial one_open_trade_per_symbol).
```

---
*Fin del informe de auditoría. Claude Sonnet: procede con el diagnóstico punto por punto sobre los 6 ejes y entrega la matriz formal de hallazgos.*

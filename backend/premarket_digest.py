import os
import json
import requests
from collections import defaultdict
from typing import List, Dict, Any
from backend.radar_inbox import RadarInbox, OpportunityCard

def run_premarket_digest(engine: str = "gemini") -> Dict[str, Any]:
    """
    Lee las tarjetas activas del radar, las agrupa por activo, 
    y genera un consenso de pre-apertura utilizando la IA seleccionada.
    """
    inbox = RadarInbox()
    active_cards = inbox.get_active_cards(hours_ttl=72)
    
    if not active_cards:
        return {
            "status": "idle",
            "message": "Buzón vacío. No hay eventos macro ni noticias de fin de semana para procesar."
        }
    
        # Agrupar tarjetas por activo (tomando solo las 3 más recientes para no saturar el contexto de Ollama)
    cards_by_asset = defaultdict(list)
    # Ordenar desde la más reciente a la más vieja
    active_cards.sort(key=lambda x: x.timestamp, reverse=True)
    
    for card in active_cards:
        if len(cards_by_asset[card.activo]) < 3:
            cards_by_asset[card.activo].append(card)
    
    # Construir el reporte para enviar a la IA
    report = []
    for asset, cards in cards_by_asset.items():
        report.append(f"\\n--- Activo: {asset} ---")
        for c in cards:
            report.append(f"[{c.timestamp}] Confianza: {c.confianza}% | Impacto: {c.impacto} | Titular: {c.titular}")
            report.append(f"Justificación: {c.justificacion}")
    
    report_text = "\\n".join(report)
    
    prompt = f"""
Eres el Cerebro Principal de un sistema de Trading Algorítmico. 
Estás ejecutando la rutina de "Despertar Pre-Market" un lunes por la mañana. 
A continuación, se te presenta el registro consolidado del buzón del "Agente de Inversiones", quien ha estado escaneando noticias y eventos macroeconómicos durante el fin de semana.

Tu trabajo es procesar esta información y generar un CONSENSO FINAL para cada activo mencionado. 
Si hay noticias contradictorias (ej. pánico el sábado, pero calma el domingo), pondera la información más reciente y el nivel de confianza.

NOTICIAS ACUMULADAS EN EL BUZÓN:
{report_text}

Debes responder ÚNICAMENTE en formato JSON válido, estructurado de la siguiente manera:
{{
    "resumen_general": "Breve descripción de cómo amanece el mercado según las noticias.",
    "activos": [
        {{
            "simbolo": "AAPL",
            "consenso_direccional": "ALCISTA" | "BAJISTA" | "NEUTRAL" | "PELIGRO",
            "razonamiento": "Tu justificación consolidando las noticias del fin de semana",
            "autorizar_operacion": true | false
        }}
    ]
}}
"""

    if engine == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return {"status": "error", "message": "Falta GEMINI_API_KEY"}
        
        llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", google_api_key=api_key, temperature=0.2)
        try:
            response = llm.invoke(prompt)
            # Limpiar posible markdown del JSON (```json ... ```)
            raw_text = response.content.replace('```json', '').replace('```', '').strip()
            return json.loads(raw_text)
        except Exception as e:
            return {"status": "error", "message": f"Error en Gemini: {str(e)}"}
            
    else: # Ollama local
        try:
            response = requests.post("http://localhost:11434/api/generate", json={
                "model": "trader-ia", # El modelo local custom
                "prompt": prompt,
                "stream": False,
                "format": "json"
            }, timeout=300)
            
            if response.status_code == 200:
                data = response.json()
                raw_text = data.get("response", "").strip()
                return json.loads(raw_text)
            else:
                return {"status": "error", "message": "Ollama devolvió un error de servidor."}
        except Exception as e:
            return {"status": "error", "message": f"Ollama no responde: {str(e)}"}

if __name__ == "__main__":
    # Prueba rápida
    import os
    from dotenv import load_dotenv
    load_dotenv() # Cargar .env si existe para GEMINI_API_KEY
    
    print("Iniciando Pre-Market Digest (Motor: Gemini)...")
    resultado = run_premarket_digest(engine="gemini")
    print(json.dumps(resultado, indent=4, ensure_ascii=False))

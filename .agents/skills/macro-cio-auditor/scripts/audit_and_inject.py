#!/usr/bin/env python3
"""
audit_and_inject.py - Script de apoyo para el Agente Antigravity CIO.
Permite auditar el buzón del Monitor del Mercado o inyectar directamente una tesis aprobada a trading_ollama.
"""

import sys
import json
import os
import urllib.request
import urllib.error

API_BASE = "http://127.0.0.1:18767"

def auth_headers(extra=None):
    headers = {"User-Agent": "Antigravity-CIO/1.0"}
    if extra:
        headers.update(extra)
    token = (
        os.getenv("TRADING_OLLAMA_API_TOKEN")
        or os.getenv("APP_SECRET_TOKEN")
        or os.getenv("APP_TOKEN")
    )
    if token:
        headers["X-API-Token"] = token
    return headers

def get_monitor_reports():
    url = f"{API_BASE}/api/macro/radar?source=monitor"
    try:
        req = urllib.request.Request(url, headers=auth_headers())
        with urllib.request.urlopen(req, timeout=5) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        print(f"⚠️ Error consultando buzón de Monitor del Mercado: {e}")
        return None

def inject_directive(asset: str, text: str, confidence: int = 85, signal_type: str = "Oportunidad"):
    url = f"{API_BASE}/api/macro/inject"
    payload = {
        "asset": asset.upper().strip(),
        "text": text.strip(),
        "confidence": max(1, min(100, int(confidence))),
        "type": signal_type,
        "source": "Antigravity CIO"
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=auth_headers({"Content-Type": "application/json"}))
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            res_data = json.loads(response.read().decode())
            print(f"✅ [ANTIGRAVITY CIO] Directiva inyectada exitosamente para {asset}:")
            print(f"   Tesis: {text}")
            print(f"   Confianza: {confidence}% | Fuente: Antigravity CIO")
            return res_data
    except Exception as e:
        print(f"❌ Error inyectando directiva a trading_ollama: {e}")
        return None

def main():
    if len(sys.argv) >= 3:
        asset = sys.argv[1]
        text = sys.argv[2]
        conf = int(sys.argv[3]) if len(sys.argv) > 3 else 85
        if inject_directive(asset, text, conf) is None:
            sys.exit(1)
        return

    print("🔍 Consultando informes recientes de Monitor del Mercado...")
    reports = get_monitor_reports()
    if reports is None:
        sys.exit(1)
    if not reports or reports[0].get("asset") == "MONITOR_ESPERA":
        print("ℹ️ No hay informes pendientes en el Monitor del Mercado.")
        print("💡 Uso manual: python3 audit_and_inject.py <ACTIVO> <TESIS> [CONFIANZA]")
        return

    top = reports[0]
    print(f"\n📋 Último informe detectado del Monitor:")
    print(f"   Activo: {top.get('asset')}")
    print(f"   Tipo: {top.get('type')}")
    print(f"   Tesis: {top.get('reason')}")
    print(f"   Confianza original: {top.get('confidence')}%")

if __name__ == "__main__":
    main()

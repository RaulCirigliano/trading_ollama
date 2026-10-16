#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${PROJECT_DIR}/venv/bin/python"
BACKEND_PID=""
FRONTEND_PID=""
cd "$PROJECT_DIR"

if [[ ! -x "$PYTHON" ]]; then
    echo "No se encontró el entorno virtual del proyecto: $PYTHON" >&2
    echo "Créalo con: python3 -m venv venv && venv/bin/python -m pip install -r backend/requirements.txt" >&2
    exit 1
fi

stop_servers() {
    trap - EXIT INT TERM
    for pid in "$BACKEND_PID" "$FRONTEND_PID"; do
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    for pid in "$BACKEND_PID" "$FRONTEND_PID"; do
        if [[ -n "$pid" ]]; then
            wait "$pid" 2>/dev/null || true
        fi
    done
}
trap stop_servers EXIT INT TERM

"$PYTHON" -m uvicorn backend.main:app --host 127.0.0.1 --port 18767 &
BACKEND_PID=$!
"$PYTHON" -m http.server 18087 --bind 127.0.0.1 --directory "${PROJECT_DIR}/frontend" &
FRONTEND_PID=$!

wait_for_server() {
    local url="$1"
    local pid="$2"
    local label="$3"
    for _ in {1..30}; do
        if ! kill -0 "$pid" 2>/dev/null; then
            echo "No se pudo iniciar $label. Comprueba si su puerto ya está ocupado." >&2
            return 1
        fi
        if "$PYTHON" -c 'import sys, urllib.request; urllib.request.urlopen(sys.argv[1], timeout=0.5).close()' "$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep 0.25
    done
    echo "Tiempo agotado esperando $label en $url." >&2
    return 1
}

wait_for_server "http://127.0.0.1:18767/" "$BACKEND_PID" "el backend"
wait_for_server "http://127.0.0.1:18087/" "$FRONTEND_PID" "el frontend"

echo "Aplicación disponible en http://127.0.0.1:18087/"
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open http://127.0.0.1:18087/ >/dev/null 2>&1 || echo "No se pudo abrir el navegador; visita la URL manualmente."
else
    echo "No se encontró xdg-open; abre la URL manualmente."
fi
echo "Presiona Ctrl+C para detener únicamente los servidores iniciados por este lanzador."

wait -n "$BACKEND_PID" "$FRONTEND_PID"

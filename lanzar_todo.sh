#!/usr/bin/env bash
set -u

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${PROJECT_DIR}/venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
    echo "No se encontró el entorno virtual de Trading Ollama: $PYTHON" >&2
    exit 1
fi

exec "$PYTHON" "$PROJECT_DIR/lanzar_todo.py"


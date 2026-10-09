#!/bin/bash

# Ruta del proyecto
PROJECT_DIR="/home/raul/Escritorio/proyectos/trading"
cd $PROJECT_DIR

echo "Limpiando procesos anteriores para evitar conflictos..."
pkill -f "http.server 8085" 2>/dev/null
pkill -f "uvicorn backend.main:app" 2>/dev/null
sleep 1

echo "Iniciando el Cerebro Matemático (Backend)..."
source venv/bin/activate
uvicorn backend.main:app --host 127.0.0.1 --port 8765 &
BACKEND_PID=$!

echo "Iniciando la Interfaz Visual (Frontend)..."
python3 -m http.server 8085 &
FRONTEND_PID=$!

echo "Esperando 2 segundos para que los servidores arranquen..."
sleep 2

echo "Abriendo la aplicación en tu navegador web..."
xdg-open http://localhost:8085

echo "------------------------------------------------------"
echo "¡Todo en marcha! La aplicación se abrió en tu navegador."
echo "Para APAGAR los motores, simplemente cierra esta terminal"
echo "o presiona Ctrl+C"
echo "------------------------------------------------------"

wait $BACKEND_PID
wait $FRONTEND_PID

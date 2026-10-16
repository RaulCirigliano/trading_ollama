@echo off
setlocal
cd /d "%~dp0"
set "PYTHON=%CD%\venv\Scripts\python.exe"

if not exist "%PYTHON%" (
    echo No se encontro el entorno virtual del proyecto: "%PYTHON%"
    echo Crealo con: py -m venv venv ^&^& venv\Scripts\python.exe -m pip install -r backend\requirements.txt
    exit /b 1
)

if not exist "frontend\index.html" (
    echo No se encontro frontend\index.html desde "%CD%".
    exit /b 1
)

"%PYTHON%" -c "import socket,sys; s=socket.socket(); s.settimeout(.2); result=s.connect_ex(('127.0.0.1',18767)); s.close(); sys.exit(0 if result == 0 else 1)"
if not errorlevel 1 (
    echo El puerto 18767 ya esta ocupado. Cierra el servicio correspondiente e intenta de nuevo.
    exit /b 1
)
"%PYTHON%" -c "import socket,sys; s=socket.socket(); s.settimeout(.2); result=s.connect_ex(('127.0.0.1',18087)); s.close(); sys.exit(0 if result == 0 else 1)"
if not errorlevel 1 (
    echo El puerto 18087 ya esta ocupado. Cierra el servicio correspondiente e intenta de nuevo.
    exit /b 1
)

echo Iniciando backend en 127.0.0.1:18767...
start "Trading AI Backend" /b "%PYTHON%" -m uvicorn backend.main:app --host 127.0.0.1 --port 18767

echo Iniciando frontend en 127.0.0.1:18087...
start "Trading AI Frontend" /b "%PYTHON%" -m http.server 18087 --bind 127.0.0.1 --directory "%CD%\frontend"

timeout /t 3 /nobreak >nul
echo Aplicacion disponible en http://127.0.0.1:18087/
start "" http://127.0.0.1:18087/
echo Los puertos ocupados no se cierran automaticamente para evitar detener otros programas.
echo Cierra esta ventana o presiona Ctrl+C para terminar.
pause >nul

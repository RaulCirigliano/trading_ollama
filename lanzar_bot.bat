@echo off
echo Limpiando procesos anteriores para evitar conflictos...
FOR /F "tokens=5" %%T IN ('netstat -a -n -o ^| findstr ":18087 "') DO taskkill /F /PID %%T 2>nul
FOR /F "tokens=5" %%T IN ('netstat -a -n -o ^| findstr ":18767 "') DO taskkill /F /PID %%T 2>nul

timeout /t 1 /nobreak >nul

echo Iniciando el Cerebro Matematico (Backend)...
start /b .\venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 18767

echo Iniciando la Interfaz Visual (Frontend)...
start /b .\venv\Scripts\python.exe -m http.server 18087

echo Esperando a que los servidores arranquen...
timeout /t 2 /nobreak >nul

echo Abriendo la aplicacion en tu navegador web...
start http://localhost:18087

echo ------------------------------------------------------
echo !Todo en marcha! La aplicacion se abrio en tu navegador.
echo Para APAGAR los motores, simplemente cierra esta terminal
echo o presiona Ctrl+C
echo ------------------------------------------------------

pause

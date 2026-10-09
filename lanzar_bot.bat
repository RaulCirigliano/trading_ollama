@echo off
echo Limpiando procesos anteriores para evitar conflictos...
FOR /F "tokens=5" %%T IN ('netstat -a -n -o ^| findstr ":8086 "') DO taskkill /F /PID %%T 2>nul
FOR /F "tokens=5" %%T IN ('netstat -a -n -o ^| findstr ":8766 "') DO taskkill /F /PID %%T 2>nul

timeout /t 1 /nobreak >nul

echo Iniciando el Cerebro Matematico (Backend)...
start /b .\venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8766

echo Iniciando la Interfaz Visual (Frontend)...
start /b .\venv\Scripts\python.exe -m http.server 8086

echo Esperando a que los servidores arranquen...
timeout /t 2 /nobreak >nul

echo Abriendo la aplicacion en tu navegador web...
start http://localhost:8086

echo ------------------------------------------------------
echo !Todo en marcha! La aplicacion se abrio en tu navegador.
echo Para APAGAR los motores, simplemente cierra esta terminal
echo o presiona Ctrl+C
echo ------------------------------------------------------

pause

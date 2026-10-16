@echo off
setlocal
cd /d "%~dp0"
set "PYTHON=%CD%\venv\Scripts\python.exe"
if not exist "%PYTHON%" (
    echo No se encontro el entorno virtual de Trading Ollama: "%PYTHON%"
    exit /b 1
)
"%PYTHON%" "%CD%\lanzar_todo.py"
exit /b %ERRORLEVEL%

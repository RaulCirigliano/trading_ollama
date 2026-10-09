# 🤖 Plataforma Cuantitativa de Trading (AI Trading Bot)

Plataforma de trading algorítmico y simulación financiera diseñada para operar criptomonedas (24/7) eliminando por completo el sesgo emocional humano.

## 📖 Motivación del Proyecto (El "Por Qué")
Este proyecto nació de una historia real y trágica. Un amigo cercano, tras consumir cursos de "gurús del trading", solicitó un préstamo de 5 millones de pesos argentinos para operar manualmente y lo perdió todo presa de la avaricia y el pánico. 

La realidad es cruda: **el trading manual minorista es una pelea de un humano con un ratón frente a supercomputadoras de alta frecuencia en Wall Street.**
El objetivo de este software es darle a los inversores minoristas su propio "Tanque de Guerra". Un escudo algorítmico sin emociones, que obligue al usuario a ser rentable en simulación antes de arriesgar un solo centavo real, usando matemáticas estrictas en lugar de esperanza.

---

## ⚙️ Funcionalidades Principales
- **Simulador Realista (Paper Trading):** Capital inicial de $100 USDT ajustado a la realidad económica del usuario para entrenamiento psicológico.
- **Inteligencia de Mercado (MACD & Bollinger):** El bot filtra el "ruido lateral" y solo dispara en momentos de confirmación de tendencia o pánico de masas.
- **Modo Copiloto vs Autónomo:** El usuario puede dejar al bot operar libremente o exigir que la IA pida "Permiso de Disparo" antes de comprar/vender.
- **Botón de Cierre de Emergencia:** Un botón de pánico que permite liquidar todas las posiciones a valor de mercado en milisegundos y asegurar los fondos.
- **Historial y Dashboard en Tiempo Real:** Interfaz profesional con gráficos TradingView, seguimiento de PnL No Realizado (flotante) y Rendimiento Neto.

---

## 🛡️ Sistemas de Protección de Inversión (Gestión de Riesgo)
El corazón de la aplicación no es cuánto gana, sino cuánto protege:
1. **Agente de Riesgo Inflexible:** Independiente del cerebro de análisis, un proceso vigila la inversión cada 2 segundos. Si la posición cae un **-1.0%**, ejecuta un *Stop Loss* automático (cortando la mano antes de perder el brazo). Asegura ganancias (Take Profit) al **+1.5%**.
2. **Gestión de Capital Fraccionado (DCA):** El bot tiene prohibido hacer "All-In". Solo utiliza el **25% del capital** por operación. Si el precio cae, tiene liquidez para recomprar más barato y promediar el precio de entrada (Dollar Cost Averaging).
3. **Aislamiento Criptográfico (Futuro):** Las API Keys de exchanges (ej. Binance/Kraken) se configurarán en modo *Solo Lectura y Trading*, haciendo tecnológicamente imposible que el sistema o un hacker pueda retirar los fondos hacia otras cuentas.

---

## 🚨 Prevención de Fallos Informáticos (Fail-Safes)
Para garantizar la estabilidad del servidor, se programaron escudos a nivel de código:
- **Sanity Checks de Memoria:** Si el navegador del usuario se corrompe y devuelve datos inválidos (`NaN` o variables faltantes), el sistema se auto-repara inyectando valores seguros para evitar colapsos visuales de pantalla blanca.
- **Persistencia de Estado (LocalStorage):** Las caídas de luz, cortes de internet o cierres accidentales del navegador no borran el dinero ni el historial. La partida sigue exactamente donde se dejó.
- **Auto-Limpieza de Puertos (Lanzador):** El script de inicio en Linux detecta procesos "fantasma" que hayan quedado colgados de cierres incorrectos, asesinándolos antes de iniciar los motores frescos para evitar choques de puertos.

---

## 💻 Stack Tecnológico
### Frontend (Cara Visual)
- **HTML5 & Vanilla JavaScript:** Ultra ligero y rápido, sin pesados frameworks de renderizado.
- **Tailwind CSS:** Diseño moderno, responsivo y modo oscuro "Night Mode".
- **Lightweight Charts:** Librería gráfica profesional de TradingView para velas japonesas en tiempo real.

### Backend (Motor Matemático)
- **Python 3:** Entorno virtual aislado (`venv`).
- **FastAPI / Uvicorn:** Servidor web asíncrono de altísimo rendimiento para comunicación instantánea.
- **Librerías Financieras:**
  - `ccxt`: Orquestador de conexión directa a los mercados globales (Kraken, Binance).
  - `pandas`: Estructuración masiva de datos financieros (DataFrames).
  - `ta` (Technical Analysis): Cálculo algorítmico de MACD, RSI, Bandas de Bollinger y SMA.

---
*Construido para proteger el capital. Operado por IA. Supervisado por humanos.*

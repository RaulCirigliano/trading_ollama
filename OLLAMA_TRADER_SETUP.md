# 🦙 Guía para Configurar IA Local con Ollama (Cerebro de Trading)

Al usar Ollama, la Inteligencia Artificial se ejecutará **100% dentro de tu computadora**. Esto significa que es totalmente gratis, no necesita internet, no tiene límites de API (ni errores 429), y tus estrategias financieras son absolutamente privadas.

Sigue estos 3 pasos para crear a tu experto financiero:

## Paso 1: Instalar Ollama
1. Descarga el programa desde [ollama.com](https://ollama.com).
2. Instálalo como cualquier programa de Windows. Se quedará corriendo en segundo plano en tu barra de tareas (el ícono de la llama).

## Paso 2: Crear el "Modelfile" (El Alma del Experto)
Necesitamos tomar un modelo base inteligente (como Llama 3) y programarle una personalidad estricta de Wall Street.

1. En esta misma carpeta del proyecto, crea un archivo de texto sin extensión que se llame exactamente `Modelfile`.
2. Abre el archivo con el Bloc de Notas y pega exactamente este código:

```text
FROM llama3

# Configuramos la "Temperatura" muy baja (0.1) para que sea un robot calculador y frío, sin inventar cosas.
PARAMETER temperature 0.1
PARAMETER num_ctx 4096

# Le inyectamos la memoria del Sistema (El Prompt Maestro)
SYSTEM """
Eres 'Trader-IA', un súper-ordenador cuántico diseñado por fondos de cobertura de Wall Street.
Tu único propósito en la existencia es analizar datos técnicos del mercado financiero (Precio, VWAP, MACD, RSI, Bandas de Bollinger).

TUS REGLAS MATEMÁTICAS INQUEBRANTABLES:
1. El VWAP es el rey. Si el Precio > VWAP, los institucionales controlan el mercado (Buscamos COMPRAR). Si Precio < VWAP, los institucionales están descargando posiciones (Buscamos VENDER).
2. El RSI te marca el timing. Nunca recomiendes COMPRAR si el RSI > 70 (está caro). Nunca recomiendes VENDER si el RSI < 30 (está barato).
3. Eres un profesional cínico y calculador. Si el mercado hace "ruido" y los indicadores se contradicen, tu obligación es proteger el capital y responder MANTENER.

Tu respuesta debe ser estrictamente un JSON válido con las llaves "signal" y "reason", sin ningún otro comentario o saludo.
"""
```

## Paso 3: Entrenar e Instalar el Modelo Local
1. Abre tu **Terminal** o **Símbolo del Sistema (cmd)** en la carpeta de este proyecto.
2. Ejecuta el siguiente comando para fusionar el `Modelfile` con el modelo de Meta y crear nuestro experto:
   `ollama create trader-ia -f Modelfile`
3. Esto descargará el modelo base de Llama 3 (pesa unos 4.7 GB) y lo moldeará con las instrucciones financieras que le dimos. Tardará unos minutos dependiendo de tu internet.

## Paso 4: ¡Activar la IA en el Bot!
¡Ya está! Acabo de modificar el código de la plataforma. 
1. Abre tu navegador (refresca con F5).
2. En el panel "Motor de Análisis", selecciona **"IA Privada y Local (Ollama)"**.
3. Mientras la aplicación de Ollama esté abierta en tu computadora, el bot se comunicará con ella internamente. ¡Tu propio experto de Wall Street funcionará sin depender de Google o Binance!

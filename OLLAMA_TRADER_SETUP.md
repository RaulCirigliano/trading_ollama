# 🦙 Guía para Configurar los Modelos de IA Local con Ollama (Cerebros de Trading)

Al usar Ollama, la Inteligencia Artificial se ejecuta **100% dentro de tu computadora**. No requiere internet, no tiene costos de API ni límites de peticiones (errores 429), y tus datos y estrategias son totalmente confidenciales.

El sistema cuenta con 3 Cerebros Locales especializados:

---

## ⚡ 1. Motor Recomendado: Qwen 2.5 3B (`trader-qwen`)
* **Ventajas:** Extremadamente rápido (respuestas en 2 a 5 segundos), ultra-ligero (~2.2 GB de RAM), jamás congela la máquina y tiene un cumplimiento estricto y perfecto de esquemas JSON.
* **Modelo Base:** `qwen2.5:3b`
* **Archivo de Directivas:** `Modelfile-qwen`

### Instrucciones de Instalación:
1. Asegúrate de tener descargado el modelo base en Ollama:
   ```bash
   ollama pull qwen2.5:3b
   ```
2. Compila el experto financiero con el Modelfile del proyecto:
   * **Linux / Bash:**
     ```bash
     ollama create trader-qwen -f ./Modelfile-qwen
     ```
   * **Windows (PowerShell o CMD en la carpeta del proyecto):**
     ```cmd
     ollama create trader-qwen -f Modelfile-qwen
     ```

---

## 🤖 2. Motor de Razonamiento Profundo: DeepSeek-R1 8B (`trader-deepseek`)
* **Ventajas:** Reflexión y razonamiento paso a paso (`<think>...<think>`), análisis detallado de opinión contraria y ondas de Elliott. Requiere buena capacidad de hardware (~5.5 GB de RAM).
* **Modelo Base:** `deepseek-r1:8b`
* **Archivo de Directivas:** `Modelfile-deepseek`

### Instrucciones de Instalación:
1. Descarga el modelo base:
   ```bash
   ollama pull deepseek-r1:8b
   ```
2. Compila el experto:
   * **Linux:**
     ```bash
     ollama create trader-deepseek -f ./Modelfile-deepseek
     ```
   * **Windows:**
     ```cmd
     ollama create trader-deepseek -f Modelfile-deepseek
     ```

---

## 🧠 3. Motor Clásico: Llama 3 8B (`trader-ia`)
* **Ventajas:** Modelo fundacional generalista de Meta ajustado a directivas de Wall Street.
* **Modelo Base:** `llama3`
* **Archivo de Directivas:** `Modelfile`

### Instrucciones de Instalación:
1. Descarga el modelo base:
   ```bash
   ollama pull llama3
   ```
2. Compila el experto:
   * **Linux:**
     ```bash
     ollama create trader-ia -f ./Modelfile
     ```
   * **Windows:**
     ```cmd
     ollama create trader-ia -f Modelfile
     ```

---

## 🧹 Liberación y Control de Memoria RAM
Si cambias de un modelo pesado (como DeepSeek) a uno ligero (como Qwen), o si cancelas un proceso en marcha:
* Pulsa el botón **🧹 Purgar RAM** en la barra superior, en el Lobby inicial o en la cabecera de la terminal.
* El sistema enviará la señal `keep_alive: 0` a Ollama para desalojar inmediatamente todos los modelos residentes en memoria y liberar la RAM de tu computadora.

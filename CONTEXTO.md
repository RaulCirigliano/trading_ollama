# Proyecto: AI Trading Agent - Contexto y Arquitectura

## 1. Visión del Proyecto
Plataforma de trading algorítmico y cuantitativo de ejecución **estrictamente local**, diseñada para **eliminar el factor emocional** del inversor minorista. Se apoya en reglas matemáticas estrictas, gestión de capital inquebrantable y asistencia de modelos de Inteligencia Artificial (Local y Cloud) para analizar el mercado y tomar decisiones, probadas primero en simuladores hiperrealistas antes de operar con dinero real.

## 2. Arquitectura Actual (Separación de Concerns)
El proyecto sigue estándares modernos dividiendo claramente Cliente y Servidor en un entorno 100% Local (privacidad absoluta):

* **Frontend (Dashboard):** Alojado en la carpeta `frontend/`. Construido con HTML, Tailwind CSS y JavaScript puro (`app.js`). Maneja la interfaz gráfica, el renderizado de velas (Lightweight Charts) y el Paper Trading (simulación de Multi-billeteras). Se comunica con el backend mediante la variable global `API_BASE_URL`.
* **Backend (FastAPI):** Servidor local de Python que maneja la lógica pesada.
  * **Extracción de datos:** Binance (Cripto) y Yahoo Finance (Acciones, Índices, ETFs, Merval).
  * **Motores de Análisis:** Matemático Avanzado (TA/MACD/Bollinger), **Gemini** (IA vía API) y **Ollama** (IA Local Privada y gratuita).
  * **Persistencia:** Todo el registro de operaciones se guarda en el archivo `historial_trades.csv`.

## 3. Reglas Críticas del Sistema (Core Rules)
1. **Seguridad y Ejecución Local:** Todo el código, las claves de API y el motor de IA local (Ollama) viven únicamente en la PC del usuario. No hay exposición a servidores en la nube de terceros.
2. **Modelo de Tesorería Just-In-Time (Cuentas Ómnibus):** El Agente tiene estrictamente prohibido acceder al capital total del usuario. Al operar con dinero real, el dinero descansa en una "Bóveda" segura. Solo se transfiere el capital exacto a la "Billetera Operativa" por los minutos que dure la transacción, y al cerrar el trade, el capital original más las ganancias se devuelven inmediatamente a la Bóveda. Esto blinda el 95%+ del capital ante cualquier error de software o alucinación de la IA. *(Ref: GEMINI.md)*
3. **Milestone Checker (Toma de Beneficios Automática):** Todo sistema debe incluir una barrera de retiro de ganancias. Al duplicar o llegar a un hito de capital, un porcentaje de la rentabilidad se envía automáticamente a la Bóveda Intocable para asegurar que el bot empiece a operar con las ganancias de la casa ("Free rolling").
4. **Protección de Horarios:** El motor orquestador respeta la liquidez. Activos como SPY, NASDAQ y Merval deben operarse exclusivamente en sus ventanas horarias de alta liquidez; de lo contrario el bot debe entrar en estado de suspensión.

## 4. Roadmap (Próximos Pasos)
- [ ] **Caja de Contexto Macro (Trader Humano):** Habilitar en el dashboard el input directo del humano para que inyecte un "Prompt Macro" al Orquestador (Ej: "Ignorar técnico, noticia bélica, priorizar compras en crudo y oro").
- [ ] **Desarrollo de Conector Real:** Vincular el Orquestador a la API transaccional de un broker real para implementar la arquitectura de Bóveda y Tesorería Just-In-Time.
- [ ] **Optimización del Modelo Ollama:** Perfeccionar el modelo local de IA (`trader-ia`) para hacerlo más eficiente leyendo gráficos y reducir la dependencia de la API externa de Gemini.


## 5. Metodología de Desarrollo y Control de Versiones (Git)
Para garantizar la estabilidad del proyecto y evitar que el repositorio se llene de código experimental o roto, se establece el siguiente flujo de trabajo estricto:

1. **Línea Base (Baseline):** El repositorio en la nube siempre es una copia fiel, limpia y 100% funcional del proyecto. No se utilizan archivos basura ni parches temporales en el control de versiones.
2. **Desarrollo en Local:** Todas las nuevas características, pruebas de IA, y refactorizaciones se realizan y prueban exclusivamente en el entorno local del desarrollador.
3. **Regla de Validación Estricta (Commit & Push):** 
   - Está **prohibido** hacer `commit` o subir código al repositorio remoto durante el proceso de prueba.
   - **SOLO** se empaquetará el código (`git add`, `git commit`) y se subirá al repositorio oficial (`git push`) cuando el usuario **valide explícitamente y apruebe el funcionamiento** de la modificación en su máquina.
4. **Historial Limpio:** Cada subida a Git representará un hito funcional terminado y probado, manteniendo el historial como una verdadera línea de tiempo de versiones estables.

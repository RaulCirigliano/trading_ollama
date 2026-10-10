# Proyecto: AI Trading Agent - Contexto y Arquitectura

## 1. Visión del Proyecto
Plataforma de trading algorítmico y cuantitativo de ejecución **estrictamente local**, diseñada para **eliminar el factor emocional** del inversor minorista. Se apoya en reglas matemáticas estrictas, gestión de capital inquebrantable y asistencia de modelos de Inteligencia Artificial (Local y Cloud) para analizar el mercado y tomar decisiones, probadas primero en simuladores hiperrealistas antes de operar con dinero real.

## 2. Arquitectura Actual (Separación de Concerns)
El proyecto sigue estándares modernos dividiendo claramente Cliente y Servidor en un entorno 100% Local (privacidad absoluta):

* **Frontend (Dashboard):** Alojado en la carpeta `frontend/`. Construido con HTML, Tailwind CSS y JavaScript puro (`app.js`). Maneja la interfaz gráfica, el renderizado de velas y el Paper Trading. Se divide en dos fases: un **"Lobby Macro"** (para leer reportes del fin de semana y elegir activo) y la **"Trinchera"** (pantalla de Live Trading).
* **Backend (FastAPI):** Servidor local de Python que maneja la lógica pesada.
  * **Extracción de datos:** Binance (Cripto) y Yahoo Finance (Acciones, Índices, ETFs, Merval).
  * **Motores de Análisis (Sistema Multi-Agente):** 
    * *Cerebro Principal (Ejecutor):* Motor Matemático Avanzado (TA/MACD) e IA Técnica (Gemini/Ollama) que decide la ejecución.
    * *Escuadrón de IA (Asesores):* Agentes de solo-lectura (ej. **Agente de Inversiones**) que escanean noticias y eventos macro para generar "Tarjetas de Oportunidad" (Activo, Peligro/Oportunidad, % Confianza). No operan, solo proponen al Cerebro Principal depositando sus reportes en un **Buzón Persistente**, permitiendo que el Cerebro lea un resumen consolidado (*Pre-Market Digest*) al abrir el mercado.
  * **Persistencia:** Todo el registro de operaciones se guarda en el archivo `historial_trades.csv`.

## 3. Reglas Críticas del Sistema (Core Rules)
1. **Seguridad y Ejecución Local:** Todo el código, las claves de API y el motor de IA local (Ollama) viven únicamente en la PC del usuario. No hay exposición a servidores en la nube de terceros.
2. **Seguridad de Capital y Tesorería:** El Agente tiene estrictamente prohibido acceder al capital total del usuario en entornos reales. Se utiliza un modelo de *Cuentas Ómnibus* y transferencias *Just-In-Time* para aislar los fondos. *(Ver detalle completo en la Sección 6: Protocolos de Live Trading).*
3. **Milestone Checker (Toma de Beneficios Automática):** Todo sistema debe incluir una barrera de retiro de ganancias. Al duplicar o llegar a un hito de capital, un porcentaje de la rentabilidad se envía automáticamente a la Bóveda Intocable para asegurar que el bot empiece a operar con las ganancias de la casa ("Free rolling").
4. **Protección de Horarios:** El motor orquestador respeta la liquidez. Activos como SPY, NASDAQ y Merval deben operarse exclusivamente en sus ventanas horarias de alta liquidez; de lo contrario el bot debe entrar en estado de suspensión. Al salir del estado de suspensión (ej. lunes por la mañana), su **primera acción obligatoria** es leer el *Buzón Persistente* (Pre-Market Digest) para asimilar lo ocurrido durante el cierre de mercado.

## 4. Roadmap (Próximos Pasos)
- [ ] **Implementación del "Agente de Inversiones":** 
  - [ ] **Reestructuración Frontend (Lobby vs Trinchera):** Crear una pantalla inicial ("Lobby") dedicada exclusivamente a visualizar los informes del Agente de Inversiones (Macro). El usuario valida esta información para elegir el mercado/activo antes de pasar a la pantalla técnica de Trading.
  - [x] **Frontend:** Añadir al panel "Escuadrón de IA" su switch (ON/OFF), descripción detallada, y una ventana tipo *Radar* para visualizar sus recomendaciones.
  - [ ] **Caja de Mando (Override):** Incorporar un input de texto para que el humano pueda inyectar directivas al Cerebro Principal (Ej: "Ignora lo técnico y obedece al Agente de Inversiones").
  - [x] **Backend:** Crear el worker que extrae titulares y genera el análisis con LLMs. Implementar un "Buzón Persistente" local (JSON/SQLite) y la rutina de "Pre-Market Digest" para el despertar del Cerebro.
  - [ ] **Worker Automático (Cron):** Programar una tarea en segundo plano (ej. `APScheduler` o `asyncio`) para que el Agente escanee las noticias automáticamente cada X horas durante el fin de semana sin intervención del usuario.
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

## 6. Grupo Central: Protocolos Estrictos de Live Trading (Dinero Real)
Este es el documento maestro para todas las reglas, directivas y matemáticas que el sistema debe aplicar al operar con dinero real. *(Nota: Las reglas más críticas de seguridad de esta sección están también inyectadas permanentemente en el núcleo de la IA a través de `GEMINI.md`).*

### 6.1. Arquitectura de Seguridad (Cuentas Ómnibus)
El objetivo principal es evitar que un error, bug o alucinación de la IA comprometa el capital total.
- **Aislamiento:** Las billeteras operativas siempre inician con saldo $0.
- **Just-In-Time Funding:** El dinero descansa en una "Bóveda" segura. Solo se transfiere el capital exacto a la "Billetera Operativa" por los minutos que dura la transacción.
- **Sweep-Back Automático:** Al cerrar una posición, el capital base más las ganancias regresan inmediatamente a la Bóveda.
- **Arquitectura Cero Costo Interno:** Los movimientos entre Bóveda y Operativa deben estructurarse usando transferencias internas (subcuentas) para garantizar $0 comisión en el ruteo interno.

### 6.2. Matemática Financiera y Comisiones
La rentabilidad en *Paper Trading* no es real hasta que no se restan los costos del broker. La IA debe evaluar lo siguiente antes de autorizar cualquier trade:
- **Estructura *Round-Trip*:** Restar por adelantado la comisión de entrada (compra) y salida (venta) según el modelo de tarifas del broker (Maker vs Taker).
- **Filtro Anti Micro-Trading:** Regla dura en el Orquestador. La IA tiene PROHIBIDO ejecutar operaciones si el beneficio esperado (*Take Profit*) no supera holgadamente el costo total de comisiones y spread (diferencia Bid/Ask).
- **Costos Overnight:** Si se usa margen o futuros, la IA debe descontar la tasa de fondeo diaria de la rentabilidad proyectada.

### 6.3. [Espacio Reservado para Futuras Directivas]
*(Aquí se añadirán futuras reglas operativas sobre límites de pérdidas diarias, manejo de desconexiones de red, etc., al momento de integrar la API transaccional del broker).*

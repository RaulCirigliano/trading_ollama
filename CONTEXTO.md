# Proyecto: AI Trading Agent - Contexto y Arquitectura

## 1. Visión del Proyecto
Plataforma de trading algorítmico y cuantitativo de ejecución **estrictamente local**, diseñada para **eliminar el factor emocional** del inversor minorista. Se apoya en reglas matemáticas estrictas, gestión de capital inquebrantable y asistencia de modelos de Inteligencia Artificial (Local y Cloud) para analizar el mercado y tomar decisiones, probadas primero en simuladores hiperrealistas antes de operar con dinero real.

## 2. Arquitectura Actual (Separación de Concerns)
El proyecto sigue estándares modernos dividiendo claramente Cliente y Servidor en un entorno 100% Local (privacidad absoluta):

* **Frontend (Dashboard):** Alojado en la carpeta `frontend/`. Construido con HTML, Tailwind CSS y JavaScript puro (`app.js`). Maneja la interfaz gráfica, el renderizado de velas y el Paper Trading. Se divide en dos fases: un **"Lobby Macro"** (para leer reportes del fin de semana y elegir activo) y la **"Trinchera"** (pantalla de Live Trading).
* **Backend (FastAPI):** Servidor local de Python que maneja la lógica pesada.
  * **Extracción de datos:** Binance (Cripto) y Yahoo Finance (Acciones, Índices, ETFs, Merval) con endpoint `/api/market/price` con enrutamiento dinámico, soporte `fast_info` y timestamps de frescura `ts`.
  * **Motores de Análisis (Sistema Multi-Agente):** 
    * *Cerebro Principal (Ejecutor):* Motor Matemático Avanzado (TA/MACD) e IA Técnica (Gemini/Ollama/DeepSeek) que decide la ejecución con guardas estrictas en el servidor y sanitización anti prompt-injection.
    * *Escuadrón de IA (Asesores):* Agentes de solo-lectura (ej. **Agente de Inversiones**) que escanean noticias y eventos macro para generar "Tarjetas de Oportunidad" (Activo, Peligro/Oportunidad, % Confianza). No operan, solo proponen al Cerebro Principal depositando sus reportes en un **Buzón Persistente**, permitiendo que el Cerebro lea un resumen consolidado (*Pre-Market Digest*) al abrir el mercado.
  * **Seguridad de Endpoints:** Endpoints administrativos y de persistencia (`/api/config/gemini`, `/api/log_trade`) protegidos con token de autenticación `X-API-Token` y restricción a localhost.
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
- [x] **Cálculo de Comisiones y Anti-Overtrading:** Incorporar el costo de comisiones del broker en los cálculos del Cerebro (Backend) y en el simulador de Paper Trading (Frontend) para prevenir el desgaste de capital por compras/ventas excesivas.
- [x] **Hardening Integral de Arquitectura y Control de Estado (Fases 1, 2, 3 y 4):** Mutex de ciclo/orden, fuente única de verdad (`getOpenPosition`), Circuit Breaker diario persistido, Breakeven dinámico y Trailing Stop, guardas del servidor anti-DCA/huérfana, scheduler determinista, modal copiloto con expiración (120s), sincronización de timeouts (110s/120s), y sanitización anti prompt-injection.
- [ ] **Fase 5 - Transición a Live Trading:** Simulación de slippage dinámico y spread en Paper Trading, arquitectura de múltiples posiciones concurrentes (`portfolio.positions`), y migración de `historial_trades.csv` a SQLite con event ledger inmutable y checksum sha256 encadenado.
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
- **Estructura *Round-Trip*:** Restar por adelantado la comisión de entrada (compra) y salida (venta) según el modelo de tarifas del broker (Maker vs Taker / tarifa porcentual por orden).
- **Filtro Anti-Overtrading y Desgaste por Comisiones (Churning Protection):**
  - El Cerebro (tanto los modelos de IA como el motor cuantitativo local) tiene **terminantemente prohibido** emitir señales de compra/venta frecuentes o re-entradas constantes si el rendimiento proyectado neto ($\Delta \text{Precio} - 2 \times \text{Comisión} - \text{Spread}$) es marginal o negativo.
  - Cada decisión de compra debe validar un **Umbral Mínimo de Beneficio Neto (Fee Hurdle Rate)**: la ganancia esperada (Take Profit) debe superar con holgura el costo acumulado que cobra el broker en las dos puntas ($Fee_{\text{compra}} + Fee_{\text{venta}}$). De lo contrario, la orden se descarta automáticamente pasando a `MANTENER` con justificación explícita de inviabilidad por comisiones.
- **Filtro de Posición Abierta y Re-entradas Fragmentadas:**
  - El Cerebro debe estar consciente del estado de la posición: si ya existe una posición activa, no debe seguir emitiendo micro-compras al mismo nivel de precio que solo engordan las comisiones pagadas al broker. Debe mantener la posición hasta que se alcance el objetivo de salida (Take Profit / Stop Loss / invalidación técnica).
- **Contabilidad de Capital Real y Rentabilidad Neta:**
  - En los reportes y resúmenes, el "Dinero Inicial" debe reflejar siempre la base real depositada por el inversor. Las comisiones del broker se computan como costos operativos reales desde su cobro (disminuyendo el capital final y el resultado neto), eliminando cualquier rentabilidad maquillada o ficticia.
- **Transparencia en Simulación (Paper Trading):**
  - El simulador debe descontar la comisión del broker en cada ejecución simulada (tanto en compra como en venta), registrando el total acumulado en comisiones pagadas para alertar al usuario si una estrategia está desgastando la cuenta a favor del broker.
- **Costos Overnight:** Si se usa margen o futuros, la IA debe descontar la tasa de fondeo diaria de la rentabilidad proyectada.

### 6.3. Protocolos de Ejecución, Mutex y Resiliencia del Agente (Hardening Operativo)
Para garantizar la integridad operativa antes de conectar capital real, el sistema implementa guardias estrictas:
- **Mutex de Ciclo y de Orden:** Bloqueo de ejecuciones concurrentes (`cycleInFlight` para análisis e `isExecutingTrade` para órdenes) que elimina carreras críticas (*race conditions*) y doble disparo de operaciones por latencia de red.
- **Única Fuente de Verdad de la Posición (`getOpenPosition`):** Erradicación de bifurcaciones de estado entre `portfolio.ASSET` y `portfolio.position`. Toda decisión operativa se evalúa mediante `getOpenPosition()`, forzando la sincronización del selector al activo en posición al recargar la página (F5) y descartando respuestas tardías de red si el usuario cambia de gráfico en vuelo (`reqSymbol !== currentSymbol`).
- **Guardas Inquebrantables del Servidor (Server-Side Overwrite):** El endpoint `/api/market/analysis` intercepta y neutraliza cualquier alucinación del LLM antes de responder: si existe posición activa y el modelo responde `COMPRAR`, el backend fuerza `MANTENER` (*Anti-DCA*); si no existe posición y responde `VENDER`, fuerza `MANTENER` (*Anti-Venta Huérfana*).
- **Protección Anti Prompt-Injection (`sanitize_ctx`):** Las directivas macro inyectadas por el usuario se truncan a 500 caracteres, limpian caracteres de control y se aíslan dentro de la etiqueta pasiva `<contexto_usuario>` en Gemini, DeepSeek y Ollama con advertencia estricta de no interpretar el contenido como comandos de control.
- **Congelamiento Inmutable de SL/TP (*Frozen Risk Limits*):** Los umbrales de Take Profit y Stop Loss se graban en el objeto de la posición activa (`portfolio.position`) en el instante exacto de la entrada, blindándolos contra alteraciones posteriores en los selectores visuales de la interfaz.
- **Aislamiento de Precio Multi-Activo:** El monitoreo dinámico del Stop Loss en segundo plano consulta el precio del activo real de la posición (`window.positionAssetPrice`), garantizando que la navegación del usuario por otros gráficos no contamine el PnL ni provoque cierres erróneos.
- **Scheduler Determinista y Expiración en Modo Copiloto:** Reprogramación centralizada (`scheduleNext`) en todos los caminos de salida del ciclo y temporizador de 120 s (`copilotExpiryTimer`) con soporte de tecla `ESC` para evitar bloqueos humanos indefinidos en el modal de aprobación.
- **Normalización Estricta de Señales y Resiliencia LLM:** Todas las decisiones emitidas por modelos de lenguaje pasan por `normalize_signal()`, aceptando exclusivamente coincidencia exacta (`COMPRAR`, `VENDER`, `MANTENER`). En modelos de razonamiento (DeepSeek R1), se depura el bloque `<think>` previo a la evaluación y se extrae la última coincidencia.
- **Sanitización Anti-XSS:** Todo contenido originado en feeds RSS, noticias o razonamientos libres de IA es sanitizado (`escapeHtml` / `textContent`) antes de su inserción en el DOM.
- **Resiliencia de Feed en Fines de Semana y Futuros:** En activos que operan con horarios especiales o contratos de futuros (ej. Oro `GC=F`, índices o Merval en fin de semana), el endpoint `/api/market/price` implementa un fallback automático a ventana semanal (`period='5d'`) si la serie intradiaria de 1 día está vacía por mercado cerrado, garantizando la recuperación del último precio oficial y evitando errores HTTP 502.
- **Integridad Concurrente y Autocura del Buzón Persistente:** La persistencia de tarjetas macro en el buzón satélite (`buzon_radar.json`) opera con bloqueo interproceso `FileLock` y escrituras atómicas (`.tmp` + `replace`). Si el archivo se corrompe por interrupción de energía o crash del sistema, el cargador aísla automáticamente el archivo a `.corrupt-<timestamp>` y reinicializa un buzón limpio sin bloquear la operativa del servidor.
- **Apagado Programado Post-Cierre (Graceful Shutdown):** Para evitar la interferencia emocional y la absorción innecesaria de comisiones de ida y vuelta al salir de la terminal, el sistema incorpora el protocolo de apagado diferido (`isStopAfterCloseArmed`). El operador puede armarlo desde la tabla de *Posiciones Activas* o mediante directiva en el prompt (`macroContext`). El agente permite que la operación abierta madure con normalidad hasta alcanzar sus objetivos algorítmicos (Take Profit, Breakeven dinámico o Trailing Stop) y, en el evento exacto de venta, ejecuta `stopAgent('post_trade_closure')` e inhibe nuevas compras, dejando la cuenta en liquidez y el bot detenido de forma determinista.

### 6.4. Gestión Dinámica de Riesgo Intradiario y Paradas de Emergencia (Circuit Breaker & Trailing Stop)
- **Circuit Breaker Diario Persistido (`ai_risk_state_v1`):** Monitoreo continuo de pérdidas que activa una parada de emergencia de 24 horas si ocurren 3 pérdidas consecutivas o si el drawdown diario acumulado alcanza o supera el 3% del capital inicial de la jornada. El operador cuenta con la función manual `window.resetCircuitBreaker()` para reanudar bajo criterio propio.
- **Breakeven Automático:** Al alcanzar una ganancia bruta que cubra las comisiones de ida y vuelta más un margen de resguardo (`grossGainPct >= (feeRate * 2) + 0.1%`), el Stop Loss efectivo se desplaza automáticamente al precio de entrada más comisiones, blindando la posición contra pérdidas netas.
- **Trailing Stop Institucional:** Una vez alcanzado el 60% del objetivo congelado de Take Profit (`pos.tp * 0.6`), se activa un stop dinámico que sigue al precio máximo alcanzado (`peakPrice`) a una distancia del 0.5%, asegurando beneficios crecientes mientras el mercado mantenga la tendencia favorable.
- **Monitoreo Fiable y Detección de Feed Caído:** Si la posición abierta está en un activo en segundo plano, el sistema valida la frescura del precio cada 5 s. Si la latencia supera los 20 s, emite advertencia de riesgo; si acumula 5 fallos consecutivos, emite alerta crítica para cierre manual.

### 6.5. Invariantes de Integración con Brokers Reales y Estado en Backend (Fase 5)
Para la transición de Paper Trading a ejecución con dinero real mediante adaptadores de broker (`BrokerAdapter`), el sistema establece los siguientes invariantes arquitectónicos no negociables:
- **Protección Inmediata Obligatoria (Bracket / OCO):** Toda orden de entrada ejecutada en el broker debe tener colocada su orden de protección vinculada (Stop Loss / Take Profit en formato OCO o Bracket) en un plazo estricto de $N$ segundos (máximo 5 s tras confirmación de fill). Si la orden de protección es rechazada por el exchange o no se confirma en el plazo límite, el adaptador debe ejecutar inmediatamente un cierre a mercado (`flatten()`) para liquidar la posición y evitar exposición no acotada.
- **Fondeo Just-In-Time con Asientos Atómicos:** Los movimientos de capital desde la Tesorería/Bóveda a la billetera operativa (`ALLOCATE`) y su posterior devolución tras la salida (`SWEEP_BACK`) deben ejecutarse como transacciones atómicas de doble partida en el backend (`ledger_txns` y `ledger_entries`), garantizando balance cero ($\sum \text{amount} = 0$) y trazabilidad contable inmutable ante caídas del sistema.
- **Seguridad Criptográfica de Claves de API:** Las credenciales de API del broker configuradas en el entorno local deben contar únicamente con permisos operativos de lectura y trading (Spot/Margin). Está **estrictamente prohibido** utilizar claves con permisos de retiro (withdrawals) o transferencias externas.
- **Estado Financiero y Circuit Breaker Transaccionales en Backend:** En operativa con dinero real, el estado de capital, el drawdown diario y el Circuit Breaker viven en la base de datos relacional del backend (`backend/db/schema.sql`). El frontend actúa como visor y panel de control (Copiloto), pero el servidor valida independientemente cada orden contra los límites de riesgo antes de enrutarla al broker.
- **Gestión de Fills Parciales y Restricción de Trade Único:** El sistema contempla la reconciliación de ejecuciones parciales (`fills`) redimensionando las órdenes de protección hijas. Se preserva a nivel de base de datos el índice único parcial `one_open_trade_per_symbol` para impedir físicamente que se abran posiciones simultáneas sobre el mismo activo.


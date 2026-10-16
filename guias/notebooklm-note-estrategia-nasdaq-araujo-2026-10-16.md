---
exported: 2026-10-16T12:42:41.525Z
source: NotebookLM
type: note
title: "Estrategia Nasdaq Araujo"
---

# Estrategia Nasdaq Araujo

Exported at: 16/10/2026, 9:42:41

---

La plantilla operativa desarrollada por **Franklin Araujo** para el **Nasdaq (NQ)** se basa en una regla estadística objetiva de acción del precio que prescinde de conceptos discrecionales complejos (como bloques de órdenes o inducciones de liquidez) para apoyarse en la confluencia de tres factores: el **VWAP**, las **sesiones de Londres y Nueva York**, y los **extremos en 15 minutos (M15)**\[1\]\[2\].

* * *

### 1\. Configuración del Indicador VWAP

-   **Herramienta en plataforma:** Se añade el indicador estándar de **VWAP** (_Volume Weighted Average Price_ o Precio Ponderado por Volumen) en plataformas como TradingView\[1\].
-   **Ciclo diario y reinicio:** El cálculo del VWAP inicia a las **18:00 (hora de Nueva York)** con la apertura de la sesión de Asia y concluye a las **16:00 (hora de Nueva York)** al finalizar la jornada estadounidense\[1\]. Cumplido este ciclo de un solo día, el indicador se reinicia automáticamente\[1\].
-   **Función técnica:** Similar a una media móvil pero ponderada por volumen real transaccionado, el VWAP refleja la tendencia del volumen institucional acumulado durante las sesiones previas (Asia y Londres), sirviendo como filtro direccional indispensable para la apertura americana\[1\].

* * *

### 2\. Estructura y Marcación en el Gráfico

-   **Temporalidad base:** Se utiliza el gráfico en **15 minutos (M15)**\[2\].
-   **Hora de preparación:** El trader se sienta frente a la pantalla a las **9:25 AM (hora de Nueva York)**, cinco minutos antes de la campana de apertura bursátil\[2\].
-   **Marcación de niveles clave:** Se identifican y trazan exactamente los **dos máximos (altos)** y los **dos mínimos (bajos)** recientes de la estructura en M15\[2\]. Visualmente se resume en trazar "dos lineecitas": un nivel de resistencia superior y uno de soporte inferior\[2\].
-   **Referencia de la sesión europea (Londres):** Se evalúa el posicionamiento y rango de precios desarrollado durante la sesión de Londres antes de la llegada del volumen de Nueva York\[1\]\[2\].

* * *

### 3\. Reglas de Gatillo y Ejecución

La decisión de entrada se toma exclusivamente a favor de la confluencia entre la sesión europea, el VWAP y la rotura de los niveles trazados\[2\]:

-   **Escenario de Compra (Largos):**
    -   La apertura de Nueva York cotiza **por encima del VWAP**\[2\]\[3\].
    -   El precio se sitúa **por encima del rango de la sesión de Londres**\[2\].
    -   **Entrada:** Se ejecuta la compra cuando el precio rompe o quiebra la línea de los máximos de M15 ("donde quiebre te vas")\[2\].
-   **Escenario de Venta (Cortos):**
    -   La apertura de Nueva York cotiza **por debajo del VWAP**\[2\]\[3\].
    -   El precio se sitúa **por debajo del rango de la sesión de Londres**\[2\].
    -   **Entrada:** Se ejecuta la venta cuando el precio rompe o quiebra la línea de los mínimos de M15\[2\].

* * *

### 4\. Reglas de Control de Riesgo y Disciplina

-   **Stop Loss inmediato:** El stop loss debe colocarse de forma obligatoria e inmediata en el momento exacto en que se dispara la orden (o preconfigurado previamente en la plataforma si esta lo admite) para neutralizar fallas técnicas o movimientos imprevistos\[4\]\[5\].
-   **Un solo trade al día:** Recomienda ejecutar estrictamente **una única operación por jornada**, independientemente de si el resultado es _take profit_ o _stop loss_\[2\]\[6\]. Esta restricción busca preservar la estabilidad emocional del operador y frenar la necesidad compulsiva de sobreoperar o buscar revancha frente al mercado\[6\].

* * *

💡 Si te gustaría, podemos analizar cómo estructurar estas reglas dentro de las condiciones de entrada del agente cuantitativo para la arquitectura de trading automatizado.
---

## References

[1] Pasé 3 años Quemando Cuentas, Hasta que Entendí que el problema era Yo | Franklin Araujo
[2] Pasé 3 años Quemando Cuentas, Hasta que Entendí que el problema era Yo | Franklin Araujo
[3] Pasé 3 años Quemando Cuentas, Hasta que Entendí que el problema era Yo | Franklin Araujo
[4] Pasé 3 años Quemando Cuentas, Hasta que Entendí que el problema era Yo | Franklin Araujo
[5] Pasé 3 años Quemando Cuentas, Hasta que Entendí que el problema era Yo | Franklin Araujo
[6] Pasé 3 años Quemando Cuentas, Hasta que Entendí que el problema era Yo | Franklin Araujo

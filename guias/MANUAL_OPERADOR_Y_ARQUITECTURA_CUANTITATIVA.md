# Manual del Operador y Especificación de la Arquitectura Cuantitativa
**trading_ollama — Guía de Referencia Técnica y Operativa (Plan Argon)**

> **Estado del Entorno:** Paper Trading local exclusivo.
> **Última Actualización:** Octubre 2026.
> **Propósito:** Documento de referencia permanente para operadores y desarrolladores, detallando cada mejora, fórmula matemática, salvaguarda de riesgo y protocolo de ejecución.

---

## 1. Matriz de Trazabilidad de Mejoras Cuantitativas (Plan Argon)

A continuación se detalla la correspondencia entre los requerimientos de la auditoría técnica y su implementación definitiva en el código base:

| Módulo / Objetivo | Requerimiento Técnico | Estado | Archivos Principales | Mecanismo de Verificación |
| :--- | :--- | :--- | :--- | :--- |
| **Restricción de Temporalidad ATR** | Forzar velas de 15m o 1h para la estrategia ATR; rechazar 1m y 5m en backend y auto-ajustar en UI. | **Implementado** | `backend/main.py`, `frontend/js/trading_guards.js`, `frontend/js/app.js`, `frontend/index.html` | Rechazo con HTTP 422 en llamadas API directas; pruebas en `tests/test_regressions.py` y `frontend_trading_guards.test.cjs`. |
| **Flujo del Auditor IA** | Python evalúa filtros deterministas primero; LLM solo audita como veto si pasa el filtro; temp 0.0 y salida JSON. | **Implementado** | `backend/main.py` | Pruebas de veto y comprobación de que el LLM no se llama si Python rechaza la candidata (`test_regressions.py`). |
| **Fail-Safe de Capital** | Errores de red, timeouts, JSON roto o acciones extrañas del LLM deben forzar MANTENER. | **Implementado** | `backend/main.py` | Pruebas de simulación de timeout y JSON corrupto forzando `signal="MANTENER"` con motivo Fail-Safe registrado. |
| **Esperanza Matemática y Kelly** | Formular $EV_{\text{neto}}$ y Quarter-Kelly descontando comisiones una sola vez. Desactivar Kelly por defecto por falta de muestra out-of-sample $N \ge 30$. | **Implementado** | `backend/quant_risk.py` | Batería de pruebas unitarias en `tests/test_quant_risk.py`; estado `PENDIENTE_DE_VALIDACION_OUT_OF_SAMPLE`. |
| **Validación Fuera de Muestra** | Requerir $N \ge 30$ y aplicar límite inferior conservador del intervalo de confianza de Wilson (95%). | **Implementado** | `backend/quant_risk.py` | Pruebas de rechazo para $N < 30$ y cálculo de cota inferior para $N \ge 30$ en `test_quant_risk.py`. |
| **Backtesting Offline Reproducible** | Simulador cuantitativo sin dependencias de red, sin sesgo de anticipación ($O_{i+1}$) y salida conservadora. | **Implementado** | `backend/backtest.py` | Generador sintético determinista y pruebas de simulación en `tests/test_backtest.py`. |
| **Umbral de Z-Score Centralizado** | Documentar discrepancia entre texto (-2.2) y tablas (-2.0); centralizar base en -2.0. | **Implementado** | `backend/main.py`, `backend/backtest.py`, `frontend/js/trading_guards.js` | Constantes `ATR_Z_SCORE_THRESHOLD = -2.0` utilizadas unívocamente sin dispersión. |
| **Beneficio Neto Mínimo** | Deducción anticipada de comisión y spread ida/vuelta; bloqueo de compras micro y salidas prematuras. | **Implementado** | `frontend/js/trading_guards.js`, `frontend/js/app.js`, `backend/main.py` | Pruebas de guardas en `frontend_trading_guards.test.cjs` y en el endpoint de análisis. |

---

## 2. El Escudo de Costos: "Beneficio Neto Mínimo"

### 2.1. El Problema del Micro-Trading (Churning)
En mercados intradiarios, una estrategia puede tener una tasa de acierto del 70% en movimientos brutos de precio y, sin embargo, quebrar la cuenta debido al costo invisible de las comisiones del broker y el *spread* (diferencial bid/ask).

### 2.2. Matemática de Deducción de Costos
Los costos no se descuentan sumando porcentajes alegremente, sino mediante capitalización de factores de entrada y salida:
$$\text{Factor Entrada} = (1 + \text{fee}) \times (1 + \text{spread})$$
$$\text{Factor Salida} = (1 - \text{fee}) \times (1 - \text{spread})$$
$$\text{Rendimiento Neto (\%)} = \left( (1 + \text{Movimiento Bruto}) \times \frac{\text{Factor Salida}}{\text{Factor Entrada}} - 1 \right) \times 100$$

### 2.3. Las Dos Barreras del Guardián
1. **Barrera de Entrada (Al Comprar):**
   Antes de emitir una orden de compra, el sistema calcula el retorno neto proyectado del Take Profit. Si $\text{TP}_{\text{neto}} < \text{Beneficio Neto Mínimo}$ (configurable entre 0% y 5%, por defecto 0.15% en modo manual y 0.50% en ATR), la operación se aborta de inmediato con aviso en la bitácora.
2. **Barrera de Salida (Al Tomar Ganancias):**
   Si la posición abierta está en territorio positivo pero no ha alcanzado el Beneficio Neto Mínimo, el sistema bloquea cualquier intento de cerrar prematuramente para tomar una ganancia ínfima que solo beneficie al broker en comisiones.
3. **Excepciones Absolutas:**
   Las salidas por Stop Loss, Breakeven/Trailing de protección, invalidación técnica o cierres manuales de emergencia **nunca** están sujetas a este filtro.

---

## 3. Estrategia Cuantitativa ATR: Guía Operativa

### 3.1. Restricción de Temporalidad (15m y 1h)
La estrategia cuantitativa `mean_reversion_atr` tiene bloqueadas las temporalidades de 1 minuto y 5 minutos.
* **Motivo:** En velas de 1m y 5m, el ratio entre el ATR y el costo de comisiones es desfavorable, y los indicadores de reversión a la media generan falsos rompimientos por ruido aleatorio.
* **Control:** El backend rechaza peticiones no conformes con **HTTP 422**. El frontend auto-ajusta el selector a 15m si el operador intenta activar ATR en temporalidades menores.

### 3.2. Reglas Deterministas de Python
Para que se active la señal de compra en una vela cerrada $i$, deben cumplirse todos estos criterios:
1. **Sobreventa Estadística:**
   $$Z\text{-Score}(20) = \frac{\text{Close}_i - \mu_{20}}{\sigma_{20}} \le -2.0$$
2. **Régimen Institucional Alcista:**
   $$\text{Close}_i > \text{EMA200}_i \quad \text{y} \quad \frac{\text{EMA200}_i - \text{EMA200}_{i-5}}{\text{EMA200}_{i-5}} \times 100 \ge 0$$
3. **Rechazo de Mínimos (Mecha Inferior):**
   $$\text{Ratio Mecha} = \frac{\min(\text{Open}_i, \text{Close}_i) - \text{Low}_i}{\text{High}_i - \text{Low}_i} \ge 0.25$$
4. **Volumen Controlado:**
   $$\text{RVOL} = \frac{\text{Volume}_i}{\frac{1}{20}\sum_{k=1}^{20} \text{Volume}_{i-k}} \le 3.5$$
5. **Cobertura Mínima de Costos:**
   $$\text{TP}_{\text{bruto}} = 2.5 \times \frac{\text{ATR14}_i}{\text{Close}_i} \times 100 \ge 3.5 \times (2 \cdot \text{fee} + 2 \cdot \text{spread})$$
6. **Stop Loss Técnico:**
   $$\text{SL}_{\text{bruto}} = 1.5 \times \frac{\text{ATR14}_i}{\text{Close}_i} \times 100$$

---

## 4. Auditoría de Inteligencia Artificial y Fail-Safe

### 4.1. Filosofía del Rol de la IA
En sistemas críticos de trading, un LLM nunca debe ser el motor de cálculo primario. El agente IA actúa como un **Auditor de Contexto no Estructurado**.
* **Pre-condición:** Si Python rechaza la candidata, el LLM no es llamado.
* **Parámetros:** Inferencia con `temperature: 0.0` y esquema estructurado JSON:
  ```json
  {"signal": "COMPRAR", "reason": "Justificación concisa"}
  ```
* **Poder de Veto:** Si el auditor detecta incoherencias macro o riesgo desmedido, responde `MANTENER` y la operación se cancela.

### 4.2. Protocolo Fail-Safe Automático
Ante cualquiera de los siguientes incidentes informáticos:
* Timeout en el endpoint de inferencia (60s en Qwen, 90s en DeepSeek, 110s en Ollama).
* Error HTTP o caída del servicio local de Ollama.
* Salida no parseable como JSON o texto basura.
* Emisión de señales no reconocidas o alucinadas.

El sistema ejecuta inmediatamente el **Fail-Safe Preventivo**:
$$\text{signal} \leftarrow \text{"MANTENER"}$$
$$\text{reason} \leftarrow \text{"Auditor de IA (Veto / Fail-Safe): [Detalle del incidente]"}$$
Bajo ninguna circunstancia un error informático puede culminar en una compra no autorizada.

---

## 5. Gobernanza de Capital y Criterio de Kelly

### 5.1. ¿Por qué Kelly está Desactivado?
El Criterio de Kelly maximiza la tasa de crecimiento del capital a largo plazo, pero es extremadamente sensible al error de estimación en la probabilidad de acierto ($P_w$). 
* Si se sobrestima $P_w$ en apenas un 5%, la fracción de Kelly puede sugerir apalancamientos ruinosos.
* La confianza expresada por un LLM (ej. *"85% de confianza"*) es una medida de calibración lingüística, **no una probabilidad estadística de éxito bursátil**.
* **Directiva:** Kelly permanecerá desactivado (`kelly_active = False`) hasta que el sistema acumule un historial etiquetado de al menos 30 operaciones reales o simuladas en *walk-forward* fuera de muestra.

### 5.2. Método Seguro en Uso: Presupuesto Fijo de Riesgo
Actualmente, el sistema calcula el tamaño de la posición mediante presupuesto fijo de riesgo:
$$\text{Tamaño Posición} = \min\left( \frac{\text{Capital Total} \times \text{Presupuesto de Riesgo (0.25\%)}}{|\text{SL}_{\text{neto}}| / 100}, \quad \text{Capital Total} \times 20\% \right)$$
Esto asegura que, ante cualquier fallo o ejecución de Stop Loss, la pérdida máxima esté estrictamente acotada al 0.25% de la cuenta.

### 5.3. Intervalo de Confianza de Wilson (Para Validación Futura)
Cuando se disponga de $N \ge 30$, la probabilidad conservadora no será el promedio simple $\hat{p}$, sino el límite inferior del intervalo de Wilson al 95% ($z = 1.96$):
$$p_{\text{inferior}} = \frac{\hat{p} + \frac{z^2}{2N} - z \sqrt{\frac{\hat{p}(1-\hat{p})}{N} + \frac{z^2}{4N^2}}}{1 + \frac{z^2}{N}}$$

---

## 6. Módulo de Backtesting Offline (`backend/backtest.py`)

### 6.1. Características de Ejecución
* **Totalmente Desconectado:** Utiliza `generate_synthetic_ohlcv` con semillas fijas para garantizar reproducibilidad exacta entre distintas máquinas.
* **Sin Sesgo de Anticipación (*No Look-Ahead Bias*):**
  * Señal generada en barra $i$ al completarse su cierre.
  * Ejecución simulada al precio de apertura de la barra siguiente ($O_{i+1}$) aplicando penalización por deslizamiento (*slippage*).
* **Salida Intrabarra Conservadora:**
  Si en una misma barra el precio oscila violentamente tocando tanto el nivel de TP como el de SL, el motor liquida la operación por Stop Loss por principio de prudencia.

---

## 7. Protocolo de Ejecución de Pruebas

Para validar la integridad de todo el sistema antes de iniciar una sesión de simulación:

```bash
# 1. Pruebas de interfaz y guardas del frontend
node --test tests/frontend_trading_guards.test.cjs

# 2. Pruebas cuantitativas de riesgo, backtest y regresiones del backend
venv/bin/python -m pytest tests/
```

Todas las pruebas deben concluir con código de salida 0 (100% exitosas) antes de iniciar la operativa.

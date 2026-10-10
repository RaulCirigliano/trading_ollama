# Reglas de Arquitectura - IA Trading Agent

## Arquitectura de Fondeo para Entornos Reales (Live Trading)
Cuando el proyecto migre de "Paper Trading" a "Dinero Real", se debe priorizar estrictamente la implementación de un sistema de **"Cuentas Ómnibus" (Tesorería Central / Billetera Broker)**. 

### Reglas de Diseño:
1. **Aislamiento por defecto:** Las billeteras operativas (Ej: Cripto, Wall Street, Local ARS) deben iniciar con balance `$0`.
2. **Just-In-Time Funding:** El dinero descansa en una única "Billetera Broker / Bóveda". Cuando la Inteligencia Artificial determina comprar un activo, el Orquestador transfiere/asigna el capital exacto necesario desde la Bóveda a la billetera operativa específica solo por el tiempo que dura el trade.
3. **Sweep-Back:** Al vender o cerrar una posición, tanto el capital base como las ganancias se deben devolver inmediatamente a la Billetera Broker.
4. **Objetivo Principal:** Evitar que un error (bug o alucinación de la IA) comprometa todo el capital, limitando su exposición únicamente al capital asignado a la transacción activa. No programar arquitecturas de acceso directo y total a los fondos de los exchanges.
5. **Matemática Anti Micro-Trading:** Es obligatorio restar las comisiones del broker (*Round-Trip* y Spread) de la rentabilidad proyectada antes de abrir un trade.
*(Nota: Para ver el detalle técnico completo de estos protocolos operativos, consultar la **Sección 6 de CONTEXTO.md**).*


## Metodología de Control de Versiones (Regla Estricta Git)
1. **Validación requerida:** Tienes ESTRICTAMENTE PROHIBIDO ejecutar comandos `git commit` o `git push` de forma automática tras modificar el código.
2. **Ciclo de trabajo:** Desarrolla, edita archivos y asiste al usuario. Espera pacientemente a que el usuario pruebe los cambios en su entorno local.
3. **Desencadenante (Trigger):** SOLO debes preparar un commit y sugerir o ejecutar la subida al repositorio cuando el usuario confirme de manera explícita que está satisfecho con los cambios (ej. "me gusta cómo funciona", "funciona perfecto", "súbelo a git").
4. **Repositorio Limpio:** El objetivo es que cada commit sea una versión validada, libre de código roto o experimentos sin terminar.

## Mantenimiento de la Documentación (CONTEXTO.md)
1. **Clasificación Proactiva:** Cuando el usuario pida agregar nuevas directivas o reglas al proyecto, antes de modificar `CONTEXTO.md`, la IA debe analizar la estructura del documento y recomendarle al usuario si la nueva regla encaja en un ítem/sección existente o si amerita crear un bloque nuevo.
2. **Preservación del Grupo Central:** Toda directiva relacionada con brokers, comisiones o seguridad del capital debe ir obligatoriamente a la Sección 6 (Protocolos de Live Trading).

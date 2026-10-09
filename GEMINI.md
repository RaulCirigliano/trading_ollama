# Reglas de Arquitectura - IA Trading Agent

## Arquitectura de Fondeo para Entornos Reales (Live Trading)
Cuando el proyecto migre de "Paper Trading" a "Dinero Real", se debe priorizar estrictamente la implementación de un sistema de **"Cuentas Ómnibus" (Tesorería Central / Billetera Broker)**. 

### Reglas de Diseño:
1. **Aislamiento por defecto:** Las billeteras operativas (Ej: Cripto, Wall Street, Local ARS) deben iniciar con balance `$0`.
2. **Just-In-Time Funding:** El dinero descansa en una única "Billetera Broker / Bóveda". Cuando la Inteligencia Artificial determina comprar un activo, el Orquestador transfiere/asigna el capital exacto necesario desde la Bóveda a la billetera operativa específica solo por el tiempo que dura el trade.
3. **Sweep-Back:** Al vender o cerrar una posición, tanto el capital base como las ganancias se deben devolver inmediatamente a la Billetera Broker.
4. **Objetivo Principal:** Evitar que un error (bug o alucinación de la IA) comprometa todo el capital, limitando su exposición únicamente al capital asignado a la transacción activa. No programar arquitecturas de acceso directo y total a los fondos de los exchanges.

const API_BASE_URL = 'http://127.0.0.1:18767';
// Elementos de UI
const terminal = document.getElementById('terminal');
const agentToggle = document.getElementById('agentToggle');

function logToTerminal(message, type = 'info') {
    if (!terminal) return;
    const time = new Date().toLocaleTimeString();
    const p = document.createElement('p');
    let color = 'text-green-400';
    if (type === 'warn') color = 'text-yellow-400';
    if (type === 'error') color = 'text-red-400';
    if (type === 'action') color = 'text-blue-400';
    
    p.className = color;
    p.innerHTML = `<span class="text-gray-500">[${time}]</span> > ${message}`;
    terminal.appendChild(p);
    terminal.scrollTop = terminal.scrollHeight;
}

// Capturar errores para verlos en pantalla
window.onerror = function(message, source, lineno, colno, error) {
    logToTerminal(`ERROR CRÍTICO: ${message} (Línea ${lineno})`, 'error');
};
window.addEventListener('unhandledrejection', function(event) {
    logToTerminal(`PROMESA FALLIDA: ${event.reason}`, 'error');
});

// Configuración inicial del Gráfico usando Lightweight Charts
const chartOptions = {
    layout: {
        textColor: '#d1d5db',
        background: { type: 'solid', color: 'transparent' },
    },
    grid: {
        vertLines: { color: 'rgba(55, 65, 81, 0.5)' },
        horzLines: { color: 'rgba(55, 65, 81, 0.5)' },
    },
    rightPriceScale: { borderColor: 'rgba(55, 65, 81, 1)' },
    timeScale: { borderColor: 'rgba(55, 65, 81, 1)', timeVisible: true },
};

const chartContainer = document.getElementById('chart-container');
const chart = LightweightCharts.createChart(chartContainer, {
    ...chartOptions,
    width: chartContainer.clientWidth,
    height: chartContainer.clientHeight || 400,
});

const candleSeries = chart.addCandlestickSeries({
    upColor: '#22c55e', downColor: '#ef4444',
    borderDownColor: '#ef4444', borderUpColor: '#22c55e',
    wickDownColor: '#ef4444', wickUpColor: '#22c55e',
});

const smaSeries = chart.addLineSeries({
    color: '#3b82f6', // Azul brillante para la SMA 20
    lineWidth: 2,
    crosshairMarkerVisible: false,
    lastValueVisible: false, // Ocultar etiqueta en columna vertical
    priceLineVisible: false, // Ocultar línea de precio actual
});

const vwapSeries = chart.addLineSeries({
    color: '#eab308', // Amarillo para VWAP principal
    lineWidth: 2,
    lineStyle: 0, // Solid
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    priceLineVisible: false,
});

const vwapUpperSeries = chart.addLineSeries({
    color: '#854d0e', // Amarillo oscuro apagado para Banda Superior
    lineWidth: 1,
    lineStyle: 1, // Dotted
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    priceLineVisible: false,
});

const vwapLowerSeries = chart.addLineSeries({
    color: '#854d0e', // Amarillo oscuro apagado para Banda Inferior
    lineWidth: 1,
    lineStyle: 1, // Dotted
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    priceLineVisible: false,
});

// Leyenda dinámica al hacer hover
const legendOhlc = document.getElementById('legend-ohlc');
const legendSma = document.getElementById('legend-sma');
const legendVwap = document.getElementById('legend-vwap');
const legendVwapBands = document.getElementById('legend-vwap-bands');

chart.subscribeCrosshairMove((param) => {
    if (!param.point || !param.time || param.point.x < 0 || param.point.x > chartContainer.clientWidth || param.point.y < 0 || param.point.y > chartContainer.clientHeight) {
        return; // Fuera del gráfico
    }

    const candleData = param.seriesData.get(candleSeries);
    if (candleData && candleData.close !== undefined) {
        legendOhlc.innerHTML = `Ape: ${candleData.open.toFixed(2)} | Máx: ${candleData.high.toFixed(2)} | Mín: ${candleData.low.toFixed(2)} | Cierre: ${candleData.close.toFixed(2)}`;
        let color = candleData.close >= candleData.open ? 'text-green-400' : 'text-red-400';
        legendOhlc.className = color;
    }
    
    const smaData = param.seriesData.get(smaSeries);
    if (smaData && smaData.value !== undefined) {
        legendSma.innerHTML = `SMA 20: ${smaData.value.toFixed(2)}`;
    }
    
    const vwapData = param.seriesData.get(vwapSeries);
    if (vwapData && vwapData.value !== undefined) {
        legendVwap.innerHTML = `VWAP: ${vwapData.value.toFixed(2)}`;
    }
    
    const vwapUpperData = param.seriesData.get(vwapUpperSeries);
    const vwapLowerData = param.seriesData.get(vwapLowerSeries);
    if (vwapUpperData && vwapLowerData && vwapUpperData.value !== undefined && vwapLowerData.value !== undefined) {
        if(legendVwapBands) legendVwapBands.innerHTML = `Bandas: ${vwapUpperData.value.toFixed(2)} / ${vwapLowerData.value.toFixed(2)}`;
    }
});

const symbolSelect = document.getElementById('symbolSelect');
let currentSymbol = symbolSelect.value;
let currentPrice = 0;

// Variables de Simulación (Paper Trading) persistentes en el navegador
let portfolio = JSON.parse(localStorage.getItem('ai_portfolio_v3')) || {
    VAULT: 1000.00, // Capital total en la Bóveda del Broker (USD)
    balances: {
        USDT: 0.00, // Cripto vacía por defecto
        USD: 0.00,  // Wall Street vacía por defecto
        ARS: 0.00   // Local vacía por defecto
    },
    ASSET: 0,
    entryPrice: 0
};

function getCurrency(symbol) {
    if (!symbol) return 'USD';
    if (symbol.includes('USDT')) return 'USDT';
    if (symbol.includes('.BA')) return 'ARS';
    return 'USD';
}

// Mecanismo de Cordura (Sanity Check) para evitar Save Corruption
if (!portfolio.balances) portfolio.balances = { USDT: 0, USD: 0, ARS: 0 };
if (!portfolio.deposits) portfolio.deposits = { USDT: 0, USD: 0, ARS: 0 };
if (typeof portfolio.balances.USDT !== 'number' || isNaN(portfolio.balances.USDT)) portfolio.balances.USDT = 0;
if (typeof portfolio.balances.USD !== 'number' || isNaN(portfolio.balances.USD)) portfolio.balances.USD = 0;
if (typeof portfolio.balances.ARS !== 'number' || isNaN(portfolio.balances.ARS)) portfolio.balances.ARS = 0;
if (typeof portfolio.deposits.USDT !== 'number' || isNaN(portfolio.deposits.USDT)) portfolio.deposits.USDT = 0;
if (typeof portfolio.deposits.USD !== 'number' || isNaN(portfolio.deposits.USD)) portfolio.deposits.USD = 0;
if (typeof portfolio.deposits.ARS !== 'number' || isNaN(portfolio.deposits.ARS)) portfolio.deposits.ARS = 0;
if (typeof portfolio.VAULT !== 'number' || isNaN(portfolio.VAULT)) portfolio.VAULT = 1000.00;
if (typeof portfolio.ASSET !== 'number' || isNaN(portfolio.ASSET)) portfolio.ASSET = 0;
if (typeof portfolio.entryPrice !== 'number' || isNaN(portfolio.entryPrice)) portfolio.entryPrice = 0;

let tradeHistoryLog = JSON.parse(localStorage.getItem('ai_trade_history')) || [];
if (!Array.isArray(tradeHistoryLog)) tradeHistoryLog = [];

// Función de reseteo para limpiar la memoria si el usuario quiere empezar de cero
window.resetearCuenta = function() {
    localStorage.removeItem('ai_portfolio_v3');
    // No borramos 'ai_trade_history' para que el registro histórico sea eterno
    location.reload();
};

function updateCapitalDisplay() {
    let currency = getCurrency(currentSymbol);
    let total = portfolio.balances[currency] + (portfolio.ASSET * currentPrice);
    
    const currencySymbols = { 'USDT': 'USDT', 'USD': 'USD', 'ARS': 'ARS' };
    const curSym = currencySymbols[currency] || '$';
    document.getElementById('capitalDisplay').innerText = `$${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${curSym}`;
    
    // Actualizar datos en el Modal de Tesorería
    const modalVault = document.getElementById('modalVaultUSD');
    if (modalVault) modalVault.innerText = `$${portfolio.VAULT.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    // Actualizar Billeteras en UI
    const vaultDisplay = document.getElementById('vaultDisplay');
    if (vaultDisplay) vaultDisplay.innerText = `$${portfolio.VAULT.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    const usdtDisp = document.getElementById('walletUsdtDisplay');
    if (usdtDisp) usdtDisp.innerText = `$${portfolio.balances.USDT.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    const usdDisp = document.getElementById('walletUsdDisplay');
    if (usdDisp) usdDisp.innerText = `$${portfolio.balances.USD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    const arsDisp = document.getElementById('walletArsDisplay');
    if (arsDisp) arsDisp.innerText = `$${portfolio.balances.ARS.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    // Calcular Rendimiento Total (PnlD) basado solo en el capital activo del bot
    const pnlDisplay = document.getElementById('pnlDisplay');
    if (pnlDisplay) {
        const diff = total - 100.00;
        const percent = (diff / 100.00) * 100;
        
        const sign = diff >= 0 ? '+' : '';
        const color = diff >= 0 ? (diff > 0 ? 'text-green-400' : 'text-gray-400') : 'text-red-400';
        
        pnlDisplay.className = `font-bold ${color}`;
        pnlDisplay.innerText = `${sign}$${Math.abs(diff).toFixed(2)} (${sign}${percent.toFixed(2)}%)`;
    }

    // Actualizar Tabla de Posiciones Activas
    const activeBody = document.getElementById('activePositionsBody');
    if (activeBody) {
        if (portfolio.ASSET <= 0.0001) {
            if (!document.getElementById('emptyPositionsRow')) {
                activeBody.innerHTML = `<tr id="emptyPositionsRow"><td colspan="6" class="px-4 py-4 text-center text-gray-600 italic">No tienes posiciones activas (100% liquidez en USDT).</td></tr>`;
            }
        } else {
            const baseCoin = currentSymbol.split('/')[0];
            const pnlNoRealizado = (currentPrice - portfolio.entryPrice) * portfolio.ASSET;
            const pnlSign = pnlNoRealizado >= 0 ? '+' : '';
            const pnlColor = pnlNoRealizado >= 0 ? 'text-green-400' : 'text-red-400';
            
            let activeRow = document.getElementById('activePositionRow');
            if (!activeRow) {
                activeBody.innerHTML = `
                    <tr id="activePositionRow" class="border-b border-gray-700/50 bg-blue-900/10">
                        <td class="px-4 py-2 font-bold text-white" id="apCoin"></td>
                        <td class="px-4 py-2 font-mono" id="apAmount"></td>
                        <td class="px-4 py-2 font-mono" id="apEntry"></td>
                        <td class="px-4 py-2 font-mono" id="apCurrent"></td>
                        <td class="px-4 py-2 font-bold" id="apPnl"></td>
                        <td class="px-4 py-2 text-right">
                            <button onclick="window.forceClosePosition()" class="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded font-bold shadow-lg transition duration-200 ease-in-out transform hover:scale-105 border border-red-500">✖ CERRAR</button>
                        </td>
                    </tr>
                `;
            }
            document.getElementById('apCoin').innerText = baseCoin;
            document.getElementById('apAmount').innerText = portfolio.ASSET.toFixed(6);
            document.getElementById('apEntry').innerText = `$${portfolio.entryPrice.toLocaleString()}`;
            document.getElementById('apCurrent').innerText = `$${currentPrice.toLocaleString()}`;
            
            const pnlCell = document.getElementById('apPnl');
            pnlCell.className = `px-4 py-2 font-bold ${pnlColor}`;
            pnlCell.innerText = `${pnlSign}$${Math.abs(pnlNoRealizado).toFixed(2)}`;
        }
    }
}

symbolSelect.addEventListener('change', () => {
    currentSymbol = symbolSelect.value;
    logToTerminal(`Cambiando activo a ${currentSymbol}...`, 'warn');
    candleSeries.setData([]); // Limpiar gráfico
    smaSeries.setData([]);
    vwapSeries.setData([]);
    vwapUpperSeries.setData([]);
    vwapLowerSeries.setData([]);
    fetchMarketData();
    updateSentiment();
});

// --- GESTOR DE TESORERÍA (CUENTAS ÓMNIBUS) ---
window.ejecutarTransferencia = function() {
    const destWallet = document.getElementById('tesoreriaWalletSelect').value;
    const amountStr = document.getElementById('tesoreriaAmount').value;
    const amount = parseFloat(amountStr);
    
    if (isNaN(amount) || amount <= 0) {
        alert("Ingresa un monto válido.");
        return;
    }
    
    // Calcular costo en USD de la Bóveda (Tasa simulada: 1 USD = 1 USDT = 1000 ARS)
    let costoUSD = amount;
    if (destWallet === 'ARS') {
        costoUSD = amount / 1000.00;
    }
    
    if (portfolio.VAULT < costoUSD) {
        alert(`❌ Fondos insuficientes en la Bóveda.\nIntentas sacar $${costoUSD.toFixed(2)} USD pero solo tienes $${portfolio.VAULT.toFixed(2)} USD.`);
        return;
    }
    
    // Ejecutar Transferencia
    portfolio.VAULT -= costoUSD;
    portfolio.balances[destWallet] += amount;
    portfolio.deposits[destWallet] += amount; // Registrar la base para calcular ganancias limpias
    
    localStorage.setItem('ai_portfolio_v3', JSON.stringify(portfolio));
    updateCapitalDisplay();
    document.getElementById('tesoreriaModal').classList.add('hidden');
    document.getElementById('tesoreriaAmount').value = '';
    
    logToTerminal(`🏦 TESORERÍA: Transferidos ${amount} ${destWallet} a la billetera operativa.`, 'action');
};

window.sweepBackAll = function() {
    if (portfolio.ASSET > 0) {
        alert("No puedes vaciar la billetera mientras tengas posiciones abiertas. Cierra la operación primero.");
        return;
    }
    
    // Regresar USD y USDT 1 a 1
    portfolio.VAULT += portfolio.balances.USD;
    portfolio.VAULT += portfolio.balances.USDT;
    // Regresar ARS (1000 a 1)
    portfolio.VAULT += (portfolio.balances.ARS / 1000.00);
    
    portfolio.balances.USD = 0;
    portfolio.balances.USDT = 0;
    portfolio.balances.ARS = 0;
    
    // Resetear base de depósitos al vaciar
    portfolio.deposits.USD = 0;
    portfolio.deposits.USDT = 0;
    portfolio.deposits.ARS = 0;
    portfolio.balances.USDT = 0;
    portfolio.balances.ARS = 0;
    
    localStorage.setItem('ai_portfolio_v3', JSON.stringify(portfolio));
    updateCapitalDisplay();
    document.getElementById('tesoreriaModal').classList.add('hidden');
    
    logToTerminal(`🧹 SWEEP-BACK: Todas las billeteras operativas vaciadas. Capital devuelto a la Bóveda.`, 'action');
};

// Obtener datos reales del motor Python
async function fetchMarketData() {
    try {
        logToTerminal(`Conectando al motor Python para obtener velas de ${currentSymbol}...`, 'info');
        const response = await fetch(`${API_BASE_URL}/api/market/history?symbol=${currentSymbol}&timeframe=${document.getElementById('timeframeSelect')?.value || '1m'}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        if (data && !data.error) {
            
            try {
                const cleanCandleData = data.map(d => ({time: d.time, open: d.open, high: d.high, low: d.low, close: d.close}));
                candleSeries.setData(cleanCandleData);
                
                const smaData = data.filter(d => typeof d.sma_20 === 'number' && !isNaN(d.sma_20)).map(d => ({ time: d.time, value: d.sma_20 }));
                if (smaData.length > 0) smaSeries.setData(smaData);
                
                const vwapData = data.filter(d => typeof d.vwap === 'number' && !isNaN(d.vwap)).map(d => ({ time: d.time, value: d.vwap }));
                if (vwapData.length > 0) vwapSeries.setData(vwapData);
                
                const vwapUpperData = data.filter(d => typeof d.vwap_upper === 'number' && !isNaN(d.vwap_upper)).map(d => ({ time: d.time, value: d.vwap_upper }));
                if (vwapUpperData.length > 0) vwapUpperSeries.setData(vwapUpperData);
                
                const vwapLowerData = data.filter(d => typeof d.vwap_lower === 'number' && !isNaN(d.vwap_lower)).map(d => ({ time: d.time, value: d.vwap_lower }));
                if (vwapLowerData.length > 0) vwapLowerSeries.setData(vwapLowerData);
            } catch(e) {
                logToTerminal("ERROR GRÁFICO: " + e.message, "error");
            }
            const currentPriceElement = document.getElementById('currentPrice');
            currentPrice = data[data.length - 1].close; 
            currentPriceElement.innerText = `$${currentPrice.toLocaleString()}`;
            updateCapitalDisplay();
            logToTerminal('Gráfico actualizado con datos reales.', 'action');
        } else {
            logToTerminal('Error de datos: ' + data.error, 'error');
        }
    } catch (error) {
        logToTerminal(`Fallo al conectar con FastAPI: ${error.message}`, 'error');
    }
}

// Cargar datos al iniciar
fetchMarketData();

window.addEventListener('resize', () => {
    chart.applyOptions({ width: chartContainer.clientWidth });
});

// Ciclo de IA (Cada 15 segundos)
let isAgentActive = false;
let simulateInterval;

agentToggle.addEventListener('click', () => {
    isAgentActive = !isAgentActive;
    if (isAgentActive) {
        agentToggle.innerText = 'Detener Agente (Kill Switch)';
        agentToggle.classList.replace('bg-blue-600', 'bg-red-600');
        agentToggle.classList.replace('hover:bg-blue-700', 'hover:bg-red-700');
        logToTerminal('Agente activado. Iniciando análisis cuantitativo.', 'info');
        
        const ejecutarAnalisis = async () => {
            if (!isAgentActive) return;

            // Verificar si estamos dentro del horario de operación
            const scheduleMode = document.getElementById('scheduleModeSelect')?.value || 'libre';
            if (scheduleMode === 'custom') {
                const startTime = document.getElementById('timeStart').value;
                const endTime = document.getElementById('timeEnd').value;
                const now = new Date();
                const currentMinutes = now.getHours() * 60 + now.getMinutes();
                
                const [startH, startM] = startTime.split(':').map(Number);
                const [endH, endM] = endTime.split(':').map(Number);
                const startMinutes = startH * 60 + startM;
                const endMinutes = endH * 60 + endM;

                let isDentroDeHorario = false;
                if (startMinutes <= endMinutes) {
                    isDentroDeHorario = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
                } else {
                    isDentroDeHorario = currentMinutes >= startMinutes || currentMinutes <= endMinutes;
                }

                if (!isDentroDeHorario) {
                    logToTerminal(`⏳ Fuera de horario operativo (${startTime} - ${endTime}). Análisis pausado...`, 'warn');
                    simulateInterval = setTimeout(ejecutarAnalisis, 60000);
                    return;
                }
            }

            const engine = document.getElementById('engineSelect')?.value || 'local';
            logToTerminal(`Consultando Orquestador (${currentSymbol}) vía ${engine.toUpperCase()}...`, 'info');
            try {
                const tpSlVal = document.getElementById('tpSlSelect')?.value || "3.0|-2.0";
                const [tpStr, slStr] = tpSlVal.split('|');
                const riskVal = document.getElementById('riskSelect')?.value || "0.25";
                
                const macroContextText = document.getElementById('macroContext')?.value || '';
                const sentScore = window.currentSentimentScore || 0;
                const url = `${API_BASE_URL}/api/market/analysis?symbol=${currentSymbol}&timeframe=${document.getElementById('timeframeSelect')?.value || '1m'}&engine=${engine}&tp=${tpStr}&sl=${Math.abs(parseFloat(slStr))}&risk=${riskVal}&sentiment=${sentScore}&macro=${encodeURIComponent(macroContextText)}`;
                const response = await fetch(url);
                const data = await response.json();
                
                if (data && !data.error) {
                    let logType = 'info';
                    if (data.signal === 'COMPRAR') logType = 'action';
                    if (data.signal === 'VENDER') logType = 'error';
                    
                    logToTerminal(`[${data.signal}] RSI: ${data.indicators.rsi} | SMA20: ${data.indicators.sma_20}`, 'warn');
                    logToTerminal(`Razonamiento: ${data.reason}`, logType);
                    
                    // Lógica de Paper Trading & Copiloto
                    const baseCoin = currentSymbol.split('/')[0];
                    const executionMode = document.getElementById('executionModeSelect')?.value || 'copilot';
                    
                    // Permitir que la orden viaje al Ejecutor (ExecuteTrade será el encargado de rechazarla si no hay fondos)
                    const isBuyable = data.signal === 'COMPRAR';
                    const isSellable = data.signal === 'VENDER' && portfolio.ASSET > 0.0001;
                    
                    if (isBuyable || isSellable) {
                        if (executionMode === 'auto') {
                            executeTrade(data.signal, baseCoin, currentPrice);
                        } else {
                            // Detener momentáneamente el ciclo para no spamear
                            isAgentActive = false;
                            document.getElementById('agentToggle').innerText = 'Activar Agente';
                            document.getElementById('agentToggle').classList.replace('bg-red-600', 'bg-blue-600');
                            document.getElementById('agentToggle').classList.replace('hover:bg-red-700', 'hover:bg-blue-700');
                            showCopilotModal(data.signal, data.reason, baseCoin, currentPrice);
                        }
                    }
                } else {
                    logToTerminal('Error de análisis: ' + data.error, 'error');
                }
            } catch (err) {
                logToTerminal('Fallo de conexión con el Agente Python.', 'error');
            }

            // Calcular próximo intervalo basado en temporalidad
            if (isAgentActive) {
                const tf = document.getElementById('timeframeSelect')?.value || '1m';
                let delayMs = 60000; // Por defecto 1 min
                if (tf === '5m') delayMs = 300000;
                if (tf === '15m') delayMs = 900000;
                
                // Si el motor es local, podemos ir más rápido (ej 10 segs) porque es gratis, pero si es IA respetamos las velas
                if (engine === 'local') delayMs = 15000;

                simulateInterval = setTimeout(ejecutarAnalisis, delayMs);
            }
        };

        ejecutarAnalisis(); // Iniciar primer ciclo
    } else {
        agentToggle.innerText = 'Activar Agente';
        agentToggle.classList.replace('bg-red-600', 'bg-blue-600');
        agentToggle.classList.replace('hover:bg-red-700', 'hover:bg-blue-700');
        clearTimeout(simulateInterval);
        logToTerminal('Agente detenido.', 'warn');
    }
});

// Ciclo de Gráfico en Vivo (Cada 2 segundos) para que se mueva rápido
setInterval(async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/market/history?symbol=${currentSymbol}&timeframe=${document.getElementById('timeframeSelect')?.value || '1m'}`);
        const data = await response.json();
        if (data && data.length > 0) {
            const latest_candle = data[data.length - 1];
            candleSeries.update(latest_candle);
            
            if (latest_candle.sma_20 !== undefined) {
                smaSeries.update({ time: latest_candle.time, value: latest_candle.sma_20 });
            }
            if (latest_candle.vwap !== undefined) {
                vwapSeries.update({ time: latest_candle.time, value: latest_candle.vwap });
            }
            if (latest_candle.vwap_upper !== undefined) {
                vwapUpperSeries.update({ time: latest_candle.time, value: latest_candle.vwap_upper });
            }
            if (latest_candle.vwap_lower !== undefined) {
                vwapLowerSeries.update({ time: latest_candle.time, value: latest_candle.vwap_lower });
            }
            
            const currentPriceElement = document.getElementById('currentPrice');
            currentPrice = latest_candle.close;
            currentPriceElement.innerText = `$${currentPrice.toLocaleString()}`;
            updateCapitalDisplay();

            // -- AGENTE DE RIESGO: Stop Loss y Take Profit Dinámicos --
            if (portfolio.ASSET > 0.0001 && portfolio.entryPrice > 0) {
                const pnlPct = ((currentPrice - portfolio.entryPrice) / portfolio.entryPrice) * 100;
                
                const tpSlVal = document.getElementById('tpSlSelect')?.value || "1.5|-1.0";
                const [tpStr, slStr] = tpSlVal.split('|');
                const takeProfitLimit = parseFloat(tpStr);
                const stopLossLimit = parseFloat(slStr);
                
                // Stop Loss
                if (pnlPct <= stopLossLimit) {
                    logToTerminal(`⚠️ AGENTE DE RIESGO: Stop Loss alcanzado (${stopLossLimit}%). Vendiendo para proteger capital.`, 'error');
                    executeTrade('VENDER', currentSymbol.split('/')[0], currentPrice, 'Stop Loss');
                }
                // Take Profit
                else if (pnlPct >= takeProfitLimit) {
                    logToTerminal(`🎯 AGENTE DE RIESGO: Take Profit alcanzado (+${takeProfitLimit}%). Asegurando ganancias.`, 'action');
                    executeTrade('VENDER', currentSymbol.split('/')[0], currentPrice, 'Take Profit');
                }
            }
        }
    } catch (err) {
        // Silencioso para no ensuciar la consola
    }
}, 2000);

// Agente Sentimiento (Cada 60 segundos)
async function updateSentiment() {
    try {
        const source = document.getElementById('newsSourceSelect')?.value || 'coindesk';
        const response = await fetch(`${API_BASE_URL}/api/market/sentiment?symbol=${currentSymbol}&source=${source}`);
        const data = await response.json();
        if (data && !data.error) {
            window.currentSentimentScore = data.score;
            const badge = document.getElementById('sentimentScoreBadge');
            const container = document.getElementById('sentimentNewsContainer');
            
            badge.innerText = `${data.score} (${data.estado})`;
            
            const needle = document.getElementById('sentimentNeedle');
            if (needle) {
                const percent = ((data.score + 1) / 2) * 100;
                needle.style.left = `${Math.max(0, Math.min(100, percent))}%`;
            }
            
            if (data.estado === 'BULLISH') {
                badge.className = 'text-xs bg-green-900 text-green-400 px-2 py-1 rounded font-bold';
            } else if (data.estado === 'BEARISH') {
                badge.className = 'text-xs bg-red-900 text-red-400 px-2 py-1 rounded font-bold';
            } else {
                badge.className = 'text-xs bg-gray-900 text-gray-400 px-2 py-1 rounded font-bold';
            }
            
            container.innerHTML = '';
            data.noticias.forEach(news => {
                let colorClass = 'border-gray-500';
                if (news.score > 0) colorClass = 'border-green-500';
                if (news.score < 0) colorClass = 'border-red-500';
                
                const div = document.createElement('div');
                div.className = `bg-gray-900 p-2 rounded border-l-2 ${colorClass}`;
                div.innerHTML = `
                    <p class="text-[10px] text-gray-400 flex justify-between">
                        <span>📰 ${data.fuente || 'Noticias'}</span>
                        <span>Score: ${news.score}</span>
                    </p>
                    <p class="text-xs text-gray-200 mt-1">${news.title}</p>
                `;
                container.appendChild(div);
            });
        }
    } catch (err) {
        console.error("Fallo el Agente de Sentimiento", err);
    }
}
updateSentiment();
setInterval(updateSentiment, 60000);

const newsSourceSelect = document.getElementById('newsSourceSelect');
if (newsSourceSelect) {
    newsSourceSelect.addEventListener('change', () => {
        logToTerminal(`Cambiando fuente de sentimiento a ${newsSourceSelect.value}...`, 'info');
        updateSentiment();
    });
}

document.getElementById('clearLogs').addEventListener('click', () => {
    terminal.innerHTML = '';
});

// -- Funciones de Trading y Copiloto --

function renderTradeHistory() {
    const tbody = document.getElementById('tradeHistoryBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const todayStr = new Date().toDateString();
    const todaysTrades = tradeHistoryLog.filter(trade => {
        // Fallback para fechas: si no tiene timestamp, asumimos que no es de hoy
        if (!trade.timestamp) return false; 
        return new Date(trade.timestamp).toDateString() === todayStr;
    });

    if (todaysTrades.length === 0) {
        tbody.innerHTML = `<tr id="emptyHistoryRow"><td colspan="6" class="px-4 py-4 text-center text-gray-600 italic">No hay operaciones registradas en el día de hoy.</td></tr>`;
        return;
    }
    
    todaysTrades.forEach(trade => {
        let statusClass = 'text-gray-400';
        if (trade.status === 'Ejecutada') statusClass = 'text-green-400 font-bold';
        if (trade.status === 'Rechazada') statusClass = 'text-red-400 font-bold';
        let typeClass = trade.signal === 'COMPRAR' ? 'text-green-500' : 'text-red-500';
        
        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-700/50 hover:bg-gray-700/20';
        tr.innerHTML = `
            <td class="px-4 py-2">${trade.timeString}</td>
            <td class="px-4 py-2 font-bold">${trade.baseCoin}/USDT</td>
            <td class="px-4 py-2 ${typeClass}">${trade.signal}</td>
            <td class="px-4 py-2 font-mono">$${trade.price.toLocaleString()}</td>
            <td class="px-4 py-2 ${statusClass}">${trade.status}</td>
            <td class="px-4 py-2 text-xs">${trade.mode}</td>
        `;
        tbody.appendChild(tr);
    });
}

function addTradeToHistory(signal, baseCoin, price, status, mode) {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    const timestamp = now.toISOString();
    tradeHistoryLog.unshift({ timeString, timestamp, signal, baseCoin, price, status, mode });
    
    // Guardar en persistencia local (navegador)
    localStorage.setItem('ai_trade_history', JSON.stringify(tradeHistoryLog));
    
    // Guardar en archivo persistente (backend CSV)
    fetch(`${API_BASE_URL}/api/log_trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeString, symbol: baseCoin, signal, price, status, mode })
    }).catch(err => console.error('Error guardando en archivo CSV:', err));
    
    renderTradeHistory();
}

function executeTrade(signal, baseCoin, price, mode = 'Automático') {
    if (signal === 'COMPRAR') {
        // Gestión de Capital Dinámica
        const riskFactor = parseFloat(document.getElementById('riskSelect')?.value || "0.25");
        const currency = getCurrency(currentSymbol);
        const maxRiesgo = portfolio.balances[currency] * riskFactor;
        const tradeAmount = maxRiesgo;
        
        if (tradeAmount < 5) {
            logToTerminal('⚠️ Saldo insuficiente para abrir nueva posición.', 'error');
            return;
        }

        const cantidadAComprar = tradeAmount / price;
        
        // Promediar precio de entrada si el bot hace DCA (compras múltiples)
        const valorPrevio = portfolio.ASSET * portfolio.entryPrice;
        const valorNuevo = cantidadAComprar * price;
        
        portfolio.ASSET += cantidadAComprar;
        portfolio.balances[currency] -= tradeAmount;
        portfolio.entryPrice = (valorPrevio + valorNuevo) / portfolio.ASSET;
        
        logToTerminal(`💰 SIMULACIÓN: COMPRADO ${cantidadAComprar.toFixed(4)} ${baseCoin} a $${price.toLocaleString()} (Inversión: $${tradeAmount.toFixed(2)})`, 'action');
    } else if (signal === 'VENDER') {
        const dolaresObtenidos = portfolio.ASSET * price;
        const currency = getCurrency(currentSymbol);
        portfolio.balances[currency] += dolaresObtenidos;
        portfolio.ASSET = 0;
        portfolio.entryPrice = 0;
        logToTerminal(`💵 SIMULACIÓN: VENDIDO ${baseCoin} a $${price.toLocaleString()}. Nuevo Saldo ${currency}: $${portfolio.balances[currency].toFixed(2)}`, 'error');
        
        // --- LÓGICA DE AUTO-ASEGURAR GANANCIAS ---
        const autoVaultToggle = document.getElementById('autoVaultToggle');
        if (autoVaultToggle && autoVaultToggle.checked && portfolio.deposits[currency] > 0) {
            const threshold = parseFloat(document.getElementById('autoVaultThreshold')?.value || "50");
            const profitPct = ((portfolio.balances[currency] - portfolio.deposits[currency]) / portfolio.deposits[currency]) * 100;
            
            if (profitPct >= threshold) {
                const profitToSweep = portfolio.balances[currency] - portfolio.deposits[currency];
                portfolio.balances[currency] -= profitToSweep;
                
                // Convertir ganancia a USD si es necesario y mandar a bóveda
                if (currency === 'ARS') {
                    portfolio.VAULT += (profitToSweep / 1000.00);
                } else {
                    portfolio.VAULT += profitToSweep;
                }
                
                logToTerminal(`🔒 AUTO-VAULT: Rentabilidad del ${profitPct.toFixed(2)}% alcanzada. Ganancia de $${profitToSweep.toFixed(2)} transferida a la Bóveda Segura.`, 'action');
            }
        }
    }
    
    // Guardar en el navegador (Persistencia)
    localStorage.setItem('ai_portfolio_v3', JSON.stringify(portfolio));
    
    updateCapitalDisplay();
    addTradeToHistory(signal, baseCoin, price, 'Ejecutada', mode);
}

let pendingTrade = null;
const modal = document.getElementById('copilotModal');

function showCopilotModal(signal, reason, baseCoin, price) {
    document.getElementById('copilotMessage').innerText = `El Agente recomienda ${signal} ${baseCoin} a $${price.toLocaleString()}`;
    document.getElementById('copilotReason').innerText = `Razonamiento: ${reason}`;
    modal.classList.remove('hidden');
    pendingTrade = { signal, baseCoin, price };
}

document.getElementById('btnReject').addEventListener('click', () => {
    modal.classList.add('hidden');
    if (pendingTrade) {
        logToTerminal('❌ Operación rechazada por el usuario.', 'warn');
        addTradeToHistory(pendingTrade.signal, pendingTrade.baseCoin, pendingTrade.price, 'Rechazada', 'Copiloto');
        pendingTrade = null;
    }
    // Reactivar ciclo
    agentToggle.click(); // Vuelve a encender el agente que se habia pausado al mostrar el modal
});

document.getElementById('btnApprove').addEventListener('click', () => {
    modal.classList.add('hidden');
    if (pendingTrade) {
        logToTerminal('✅ Operación aprobada por el usuario.', 'action');
        executeTrade(pendingTrade.signal, pendingTrade.baseCoin, pendingTrade.price, 'Copiloto');
        pendingTrade = null;
    }
    // Reactivar ciclo
    agentToggle.click(); // Vuelve a encender el agente que se habia pausado al mostrar el modal
});

// Cierre Manual de Emergencia
window.forceClosePosition = function() {
    if (portfolio.ASSET > 0) {
        logToTerminal(`⚠️ CIERRE MANUAL: El usuario forzó el cierre de la posición en curso.`, 'error');
        const baseCoin = currentSymbol.split('/')[0];
        executeTrade('VENDER', baseCoin, currentPrice, 'Manual');
        
        // Apagar el agente temporalmente si estaba encendido para evitar que compre inmediatamente
        if (isAgentActive) {
            agentToggle.click();
            logToTerminal(`Agente detenido automáticamente por cierre manual. Vuelve a activarlo cuando desees.`, 'warn');
        }
    }
};

// Al cargar la página, restaurar el historial visual
document.addEventListener('DOMContentLoaded', () => {
    renderTradeHistory();
});

// Funciones interactivas de la Bóveda
window.inyectarCapital = function(amount) {
    portfolio.balances[getCurrency(currentSymbol)] += amount;
    localStorage.setItem('ai_portfolio_v3', JSON.stringify(portfolio));
    logToTerminal(`💸 DEPÓSITO: Se han inyectado $${amount} de liquidez al Agente.`, 'action');
    updateCapitalDisplay();
};


// Listeners de la nueva UI de Configuración
document.getElementById('saveApiKeyBtn')?.addEventListener('click', async () => {
    const key = document.getElementById('apiKeyInput').value;
    if(!key) return;
    try {
        const response = await fetch(`${API_BASE_URL}/api/config/gemini`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({api_key: key})
        });
        const data = await response.json();
        logToTerminal(data.message, 'action');
        const status = document.getElementById('apiKeyStatus');
        if (status) {
            status.classList.remove('hidden');
            setTimeout(() => status.classList.add('hidden'), 3000);
        }
    } catch(err) {
        logToTerminal('Error al guardar API Key en el backend.', 'error');
    }
});

document.getElementById('timeframeSelect')?.addEventListener('change', () => {
    logToTerminal(`Cambiando temporalidad a ${document.getElementById('timeframeSelect').value}...`, 'warn');
    candleSeries.setData([]);
    smaSeries.setData([]);
    vwapSeries.setData([]);
    vwapUpperSeries.setData([]);
    vwapLowerSeries.setData([]);
    fetchMarketData();
});

document.getElementById('riskSelect')?.addEventListener('change', () => {
    logToTerminal(`Riesgo actualizado a: ${document.getElementById('riskSelect').options[document.getElementById('riskSelect').selectedIndex].text}`, 'info');
});

document.getElementById('tpSlSelect')?.addEventListener('change', () => {
    logToTerminal(`Límites de ganancia/pérdida actualizados a: ${document.getElementById('tpSlSelect').options[document.getElementById('tpSlSelect').selectedIndex].text}`, 'info');
});

function updateBrainBadge() {
    const engineSelect = document.getElementById('engineSelect');
    const orquestadorBox = document.getElementById('orquestadorBox');
    const brainIcon = document.getElementById('brainIcon');
    const statusBadge = document.getElementById('engineStatusBadge');
    
    if (!engineSelect) return;
    
    const value = engineSelect.value;
    const text = engineSelect.options[engineSelect.selectedIndex].text;
    
    // Sincronizar el texto del badge de lectura
    if (statusBadge) {
        statusBadge.innerText = text;
        statusBadge.className = "w-full rounded p-2 text-xs font-bold border mt-2 flex justify-center items-center shadow-inner transition-colors duration-300 ";
    }
    
    // Reset classes
    engineSelect.className = "w-full bg-gray-900 text-white text-sm rounded p-1.5 border border-gray-700 cursor-pointer relative z-20 mb-3 ";
    if(orquestadorBox) orquestadorBox.className = "p-2 rounded border shadow-md transition-all duration-500 ";
    
    // Animar el cerebro (efecto latido)
    if (brainIcon) {
        brainIcon.classList.add('scale-125');
        setTimeout(() => brainIcon.classList.remove('scale-125'), 300);
    }
    
    if (value === 'deepseek') {
        if(statusBadge) statusBadge.className += "bg-blue-900 text-blue-300 border-blue-500";
        if(orquestadorBox) orquestadorBox.className += "bg-gray-800 border-blue-500 shadow-blue-500/20";
        if(brainIcon) brainIcon.style.filter = "drop-shadow(0 0 5px #3b82f6)";
    } else if (value === 'ollama') {
        if(statusBadge) statusBadge.className += "bg-gray-700 text-gray-300 border-gray-500";
        if(orquestadorBox) orquestadorBox.className += "bg-gray-700 border-gray-500";
        if(brainIcon) brainIcon.style.filter = "none";
    } else if (value === 'ai') {
        if(statusBadge) statusBadge.className += "bg-purple-900 text-purple-300 border-purple-500";
        if(orquestadorBox) orquestadorBox.className += "bg-gray-800 border-purple-500 shadow-purple-500/20";
        if(brainIcon) brainIcon.style.filter = "drop-shadow(0 0 5px #a855f7)";
    } else {
        if(statusBadge) statusBadge.className += "bg-green-900 text-green-300 border-green-500";
        if(orquestadorBox) orquestadorBox.className += "bg-gray-800 border-green-500 shadow-green-500/20";
        if(brainIcon) brainIcon.style.filter = "drop-shadow(0 0 5px #22c55e)";
    }
}

document.getElementById('engineSelect')?.addEventListener('change', () => {
    updateBrainBadge();
    logToTerminal(`Motor de Análisis cambiado a: ${document.getElementById('engineSelect').options[document.getElementById('engineSelect').selectedIndex].text}`, 'warn');
});

// Inicializar el estilo al cargar la página
setTimeout(updateBrainBadge, 500);




// --- FUNCIONALIDAD DE RESUMEN OPERATIVO ---

function toggleResumen() {
    const content = document.getElementById('resumenContent');
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        content.classList.add('block');
        // Inicializar fechas con hoy por defecto
        const hoy = new Date();
        const ayer = new Date(hoy);
        ayer.setDate(ayer.getDate() - 1);
        
        const formatForInput = (d) => {
            const pad = (n) => n.toString().padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };
        
        if (!document.getElementById('resumenStartDate').value) {
            document.getElementById('resumenStartDate').value = formatForInput(ayer);
        }
        if (!document.getElementById('resumenEndDate').value) {
            document.getElementById('resumenEndDate').value = formatForInput(hoy);
        }
    } else {
        content.classList.remove('block');
        content.classList.add('hidden');
    }
}

let chartInstance = null;

function generarResumen() {
    const startInput = document.getElementById('resumenStartDate').value;
    const endInput = document.getElementById('resumenEndDate').value;
    
    if (!startInput || !endInput) {
        alert("Por favor selecciona ambas fechas.");
        return;
    }
    
    const startTime = new Date(startInput).getTime();
    const endTime = new Date(endInput).getTime();
    
    // Filtrar operaciones dentro del rango, asumiendo un timestamp ISO, si no tienen, usamos una heurística o las ignoramos
    // Para trades viejos sin timestamp, asumimos que ocurrieron antes, así que podemos dejarlos fuera o incluirlos

    let tradesEnRango = tradeHistoryLog.filter(t => {
        let tTime;
        if (!t.timestamp) {
            // Fallback para trades antiguos: asume el día de hoy con la hora de timeString
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            tTime = new Date(`${dateStr} ${t.timeString}`).getTime();
        } else {
            tTime = new Date(t.timestamp).getTime();
        }
        return tTime >= startTime && tTime <= endTime && t.status === 'Ejecutada';
    });
    
    // Si queremos incluir trades de prueba sin timestamp
    if (tradesEnRango.length === 0) {
        // En caso de que todo el historial no tenga timestamp, lo tomamos todo como fallback si el usuario eligió un rango muy amplio
        // O mejor solo mostrar mensaje
    }
    
    // Ordenar de más antiguo a más reciente (tradeHistoryLog está de más reciente a antiguo)
    tradesEnRango.reverse();
    
    // Emparejar compras y ventas para sacar profit cerrado
    let posicionesAbiertas = {};
    let tradesCerrados = [];
    
    tradesEnRango.forEach(trade => {
        const asst = trade.baseCoin;
        const precio = parseFloat(trade.price);
        
        if (trade.signal === 'COMPRAR') {
            if (!posicionesAbiertas[asst]) {
                posicionesAbiertas[asst] = [];
            }
            posicionesAbiertas[asst].push({ precioCompra: precio, timestamp: trade.timestamp, timeString: trade.timeString });
        } else if (trade.signal === 'VENDER') {
            if (posicionesAbiertas[asst] && posicionesAbiertas[asst].length > 0) {
                const compra = posicionesAbiertas[asst].shift();
                const pnl = precio - compra.precioCompra;
                const pnlPercent = (pnl / compra.precioCompra) * 100;
                
                tradesCerrados.push({
                    activo: asst,
                    compra: compra.precioCompra,
                    venta: precio,
                    pnl: pnl,
                    pnlPercent: pnlPercent,
                    timeStringCompra: compra.timeString,
                    timeStringVenta: trade.timeString,
                    timestampVenta: trade.timestamp
                });
            }
        }
    });
    
    // Calcular estadísticas
    const totalTrades = tradesCerrados.length;
    let winTrades = 0;
    let totalPnl = 0;
    let capitalInvertidoEstimado = 0;
    
    tradesCerrados.forEach(t => {
        if (t.pnl > 0) winTrades++;
        totalPnl += t.pnl;
        capitalInvertidoEstimado += t.compra; // Estimación simple
    });
    
    const winRate = totalTrades > 0 ? ((winTrades / totalTrades) * 100).toFixed(2) : 0;
    
    // Calcular Capitales (Global)
    const capInicial = parseFloat(document.getElementById('resumenInitialCap').value) || 100000;
    const currency = getCurrency(currentSymbol) || 'USDT';
    
    // Dinero Final = Saldo en Bóveda + (Cantidad de Activo * Precio Actual)
    let asstValue = 0;
    if (portfolio.ASSET && portfolio.ASSET > 0) {
        asstValue = portfolio.ASSET * currentPrice;
    }
    const capFinal = (portfolio.balances && portfolio.balances[currency] !== undefined) 
                        ? portfolio.balances[currency] + asstValue 
                        : (portfolio[currency] || 0) + asstValue;
                        
    const resultadoNeto = capFinal - capInicial;
    const rentabilidadGlobal = capInicial > 0 ? ((resultadoNeto / capInicial) * 100).toFixed(2) : 0;
    
    // Actualizar UI
    document.getElementById('resumenStats').classList.remove('hidden');
    
    // Stats Nuevos
    document.getElementById('resDineroInicial').innerText = `$${capInicial.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    document.getElementById('resDineroFinal').innerText = `$${capFinal.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    
    const sign = resultadoNeto >= 0 ? '+' : '';
    const colorPnl = resultadoNeto >= 0 ? (resultadoNeto > 0 ? 'text-green-400' : 'text-gray-400') : 'text-red-400';
    
    const elResultado = document.getElementById('resResultadoNeto');
    elResultado.innerText = `${sign}$${Math.abs(resultadoNeto).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    elResultado.className = `text-xl font-bold ${colorPnl}`;
    
    const elPorcentaje = document.getElementById('resPorcentaje');
    elPorcentaje.innerText = `${sign}${rentabilidadGlobal}%`;
    elPorcentaje.className = `text-xl font-bold ${colorPnl}`;
    
    // Stats de Rango
    document.getElementById('resTotalTrades').innerText = totalTrades;
    document.getElementById('resWinRate').innerText = `${winRate}%`;
    document.getElementById('resWinRate').className = winRate >= 50 ? 'text-xl font-bold text-green-400' : 'text-xl font-bold text-red-400';
    
    // Actualizar tabla detalle
    document.getElementById('resumenDetalle').classList.remove('hidden');
    const tbody = document.getElementById('resumenDetalleBody');
    tbody.innerHTML = '';
    
    if (tradesCerrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-4 text-center text-gray-600 italic">No hay operaciones de ciclo completo (Compra y Venta) en este periodo.</td></tr>`;
    } else {
        tradesCerrados.forEach(t => {
            const tr = document.createElement('tr');
            const colorTr = t.pnl > 0 ? 'text-green-400' : 'text-red-400';
            const signTr = t.pnl > 0 ? '+' : '';
            tr.innerHTML = `
                <td class="px-4 py-2">${new Date(t.timestampVenta).toLocaleString()}</td>
                <td class="px-4 py-2 font-bold">${t.activo}</td>
                <td class="px-4 py-2 text-gray-300">$${t.compra.toFixed(2)}</td>
                <td class="px-4 py-2 text-gray-300">$${t.venta.toFixed(2)}</td>
                <td class="px-4 py-2 font-bold ${colorTr}">${signTr}$${Math.abs(t.pnl).toFixed(2)} (${signTr}${t.pnlPercent.toFixed(2)}%)</td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    // Actualizar Gráfico
    document.getElementById('resumenChartWrapper').classList.remove('hidden');
    renderChart(tradesCerrados);
}

function renderChart(trades) {
    const ctx = document.getElementById('resumenChart').getContext('2d');
    
    if (chartInstance) {
        chartInstance.destroy();
    }
    
    let labels = [];
    let cumulativePnl = [0];
    let currentPnl = 0;
    
    trades.forEach((t, index) => {
        labels.push(`Trade ${index + 1}`);
        currentPnl += t.pnl;
        cumulativePnl.push(currentPnl);
    });
    
    // Necesitamos el "0" inicial, así que agregamos un label
    labels.unshift('Inicio');
    
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'P&L Acumulado ($)',
                data: cumulativePnl,
                borderColor: '#10B981', // Verde
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#9CA3AF' } }
            },
            scales: {
                x: { ticks: { color: '#9CA3AF' }, grid: { color: '#374151' } },
                y: { ticks: { color: '#9CA3AF' }, grid: { color: '#374151' } }
            }
        }
    });
}


// Inicializar fechas del Resumen Operativo al cargar
document.addEventListener('DOMContentLoaded', () => {
    const hoy = new Date();
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    
    const formatForInput = (d) => {
        const pad = (n) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    
    const startInput = document.getElementById('resumenStartDate');
    const endInput = document.getElementById('resumenEndDate');
    if (startInput && !startInput.value) startInput.value = formatForInput(ayer);
    if (endInput && !endInput.value) endInput.value = formatForInput(hoy);
});

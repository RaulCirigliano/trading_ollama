const API_BASE_URL = 'http://127.0.0.1:18767';
// Elementos de UI
const terminal = document.getElementById('terminal');
const agentToggle = document.getElementById('agentToggle');

// Función de sanitización anti-XSS para contenido externo y texto de LLMs
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function logToTerminal(message, type = 'info') {
    if (!terminal) return;
    const time = new Date().toLocaleTimeString();
    const p = document.createElement('p');
    let color = 'text-green-400';
    if (type === 'warn') color = 'text-yellow-400';
    if (type === 'error') color = 'text-red-400';
    if (type === 'action') color = 'text-blue-400';
    
    p.className = color;
    const timeSpan = document.createElement('span');
    timeSpan.className = 'text-gray-500';
    timeSpan.textContent = `[${time}] > `;
    p.appendChild(timeSpan);
    p.appendChild(document.createTextNode(String(message)));
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
        legendOhlc.textContent = `Ape: ${candleData.open.toFixed(2)} | Máx: ${candleData.high.toFixed(2)} | Mín: ${candleData.low.toFixed(2)} | Cierre: ${candleData.close.toFixed(2)}`;
        let color = candleData.close >= candleData.open ? 'text-green-400' : 'text-red-400';
        legendOhlc.className = color;
    }
    
    const smaData = param.seriesData.get(smaSeries);
    if (smaData && smaData.value !== undefined) {
        legendSma.textContent = `SMA 20: ${smaData.value.toFixed(2)}`;
    }
    
    const vwapData = param.seriesData.get(vwapSeries);
    if (vwapData && vwapData.value !== undefined) {
        legendVwap.textContent = `VWAP: ${vwapData.value.toFixed(2)}`;
    }
    
    const vwapUpperData = param.seriesData.get(vwapUpperSeries);
    const vwapLowerData = param.seriesData.get(vwapLowerSeries);
    if (vwapUpperData && vwapLowerData && vwapUpperData.value !== undefined && vwapLowerData.value !== undefined) {
        if(legendVwapBands) legendVwapBands.textContent = `Bandas: ${vwapUpperData.value.toFixed(2)} / ${vwapLowerData.value.toFixed(2)}`;
    }
});

const symbolSelect = document.getElementById('symbolSelect');
let currentSymbol = symbolSelect ? symbolSelect.value : 'BTC/USDT';
let currentPrice = 0;

// Variables de Simulación (Paper Trading) persistentes en el navegador
let portfolio = JSON.parse(localStorage.getItem('ai_portfolio_v5')) || {
    VAULT: 500.00, // Capital total en la Bóveda del Broker (USD)
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

// Helpers de Única Fuente de Verdad para la Posición (Bloque 1)
function getOpenPosition() {
    if (portfolio.position && typeof portfolio.position.qty === 'number' && portfolio.position.qty > 0.0001) {
        return portfolio.position;
    }
    return null;
}

function hasOpenPosition() {
    return !!getOpenPosition();
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
if (typeof portfolio.VAULT !== 'number' || isNaN(portfolio.VAULT)) portfolio.VAULT = 500.00;
if (typeof portfolio.ASSET !== 'number' || isNaN(portfolio.ASSET)) portfolio.ASSET = 0;
if (typeof portfolio.entryPrice !== 'number' || isNaN(portfolio.entryPrice)) portfolio.entryPrice = 0;
if (typeof portfolio.totalFeesPaid !== 'number' || isNaN(portfolio.totalFeesPaid)) portfolio.totalFeesPaid = 0;

// Migración y compatibilidad con el Modelo de Posición Estructurado
if (!portfolio.position && portfolio.ASSET > 0.0001) {
    const cur = getCurrency(currentSymbol);
    portfolio.position = {
        symbol: currentSymbol,
        baseCoin: currentSymbol.split('/')[0],
        currency: cur,
        qty: portfolio.ASSET,
        entryPrice: portfolio.entryPrice || 0,
        costBasis: portfolio.ASSET * (portfolio.entryPrice || 0),
        tp: 1.5,
        sl: 1.0,
        openedAt: new Date().toISOString()
    };
}

// Al cargar la página, si existe posición abierta, forzar selector y activo al de la posición (Bloque 1)
const initialOpenPos = getOpenPosition();
if (initialOpenPos && initialOpenPos.symbol) {
    currentSymbol = initialOpenPos.symbol;
    if (symbolSelect) symbolSelect.value = initialOpenPos.symbol;
}

// Variables de monitoreo fiable del precio de posición y frescura (Bloque 2)
window.positionAssetPrice = null;
window.positionAssetPriceTs = 0;
let posPriceInFlight = false;
let riskFeedFailures = 0;
let lastStaleWarningTs = 0;
let lastTrailingLogTs = 0;
let lastPortfolioSaveTs = 0;

async function refreshPositionPrice() {
    const pos = getOpenPosition();
    if (!pos || posPriceInFlight) return;
    if (pos.symbol === currentSymbol) {
        window.positionAssetPrice = currentPrice;
        window.positionAssetPriceTs = Math.floor(Date.now() / 1000);
        riskFeedFailures = 0;
        return;
    }
    posPriceInFlight = true;
    try {
        const res = await fetch(`${API_BASE_URL}/api/market/price?symbol=${encodeURIComponent(pos.symbol)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && typeof data.price === 'number' && data.price > 0) {
            window.positionAssetPrice = data.price;
            window.positionAssetPriceTs = data.ts || Math.floor(Date.now() / 1000);
            riskFeedFailures = 0;
        } else {
            riskFeedFailures++;
        }
    } catch (e) {
        riskFeedFailures++;
        if (riskFeedFailures >= 5) {
            logToTerminal(`🚨 [ALERTA CRÍTICA] Feed de riesgo caído para ${pos.symbol} (${riskFeedFailures} fallos consecutivos). Considera cerrar manualmente la posición.`, 'error');
        }
    } finally {
        posPriceInFlight = false;
    }
}

// Consulta periódica cada 5s para precio de posición en segundo plano
setInterval(() => {
    const pos = getOpenPosition();
    if (pos && pos.symbol !== currentSymbol) {
        refreshPositionPrice();
    }
}, 5000);

// --- CIRCUIT BREAKER DIARIO PERSISTIDO (Bloque 4) ---
function getRiskState() {
    const today = new Date().toISOString().split('T')[0];
    let state = null;
    try {
        state = JSON.parse(localStorage.getItem('ai_risk_state_v1'));
    } catch (_) {}

    const cur = getCurrency(currentSymbol);
    const currentVault = portfolio.VAULT || 500;
    const currentBal = (portfolio.balances && portfolio.balances[cur]) || 0;
    const currentCap = currentVault + currentBal;

    if (!state || state.date !== today) {
        state = {
            date: today,
            consecutiveLosses: 0,
            dailyRealizedPnl: 0,
            startOfDayCapital: currentCap > 0 ? currentCap : 500,
            haltedUntil: null
        };
        localStorage.setItem('ai_risk_state_v1', JSON.stringify(state));
    }
    return state;
}

function saveRiskState(state) {
    try {
        localStorage.setItem('ai_risk_state_v1', JSON.stringify(state));
    } catch (_) {}
}

function recordTradeInCircuitBreaker(pnlNeto) {
    const state = getRiskState();
    state.dailyRealizedPnl = (state.dailyRealizedPnl || 0) + pnlNeto;
    if (pnlNeto < 0) {
        state.consecutiveLosses = (state.consecutiveLosses || 0) + 1;
    } else if (pnlNeto > 0) {
        state.consecutiveLosses = 0;
    }

    // 1. Regla 3 pérdidas consecutivas
    if (state.consecutiveLosses >= 3) {
        state.haltedUntil = Date.now() + 24 * 60 * 60 * 1000;
        logToTerminal(`🛑 [CIRCUIT BREAKER] 3 pérdidas consecutivas detectadas. Trading pausado 24h para proteger capital.`, 'error');
    }

    // 2. Regla Drawdown diario > 3%
    const baseCap = state.startOfDayCapital || 500;
    if (state.dailyRealizedPnl < 0 && (Math.abs(state.dailyRealizedPnl) / baseCap) >= 0.03) {
        state.haltedUntil = Date.now() + 24 * 60 * 60 * 1000;
        logToTerminal(`🛑 [CIRCUIT BREAKER] Drawdown diario del 3% alcanzado ($${Math.abs(state.dailyRealizedPnl).toFixed(2)} pérdida vs base $${baseCap.toFixed(2)}). Trading pausado 24h.`, 'error');
    }

    saveRiskState(state);
}

window.resetCircuitBreaker = function() {
    const state = getRiskState();
    state.consecutiveLosses = 0;
    state.dailyRealizedPnl = 0;
    state.haltedUntil = null;
    saveRiskState(state);
    logToTerminal(`🔄 [CIRCUIT BREAKER] Reset manual aplicado por el operador. Límites restaurados.`, 'action');
};

function getBrokerFeeRate() {
    const feeSelect = document.getElementById('brokerFeeSelect');
    if (!feeSelect) return 0.10;
    if (feeSelect.value === 'custom') {
        const customInput = document.getElementById('customFeeInput');
        const val = parseFloat(customInput?.value);
        return isNaN(val) ? 0.10 : Math.max(0, val);
    }
    return parseFloat(feeSelect.value) || 0;
}

function updateBrokerFeeDisplay() {
    const rate = getBrokerFeeRate();
    const badge = document.getElementById('roundTripBadge');
    if (badge) {
        badge.innerText = `Round-Trip: ${(rate * 2).toFixed(2)}%`;
    }
}

let tradeHistoryLog = JSON.parse(localStorage.getItem('ai_trade_history_v2')) || [];
if (!Array.isArray(tradeHistoryLog)) tradeHistoryLog = [];

// --- GESTIÓN DE SESIONES OPERATIVAS ---
// Permite distinguir visualmente las operaciones realizadas antes y después de suspender el agente
let currentSessionId = parseInt(localStorage.getItem('ai_current_session_id') || '1');
if (isNaN(currentSessionId) || currentSessionId < 1) currentSessionId = 1;

// Sincronizar sessionId con el máximo registrado en el log histórico
const maxSessionInLog = tradeHistoryLog.reduce((max, t) => Math.max(max, t.sessionId || 1), 1);
if (currentSessionId < maxSessionInLog) {
    currentSessionId = maxSessionInLog;
}

// Banderas para detectar cuando el agente fue suspendido y se reanuda
let agentWasSuspended = tradeHistoryLog.length > 0;
let isCopilotApprovalPause = false;

// Función de reseteo para limpiar la memoria si el usuario quiere empezar de cero
window.resetearCuenta = function() {
    localStorage.removeItem('ai_portfolio_v5');
    // No borramos 'ai_trade_history' para que el registro histórico sea eterno
    location.reload();
};

function updateCapitalDisplay() {
    let currency = getCurrency(currentSymbol);
    
    // Calcular valor de posición activa sin mezclar activos (Bloque 1)
    let posValue = 0;
    const pos = getOpenPosition();
    if (pos) {
        const isSameSymbol = (pos.symbol === currentSymbol);
        const evalPrice = isSameSymbol ? currentPrice : (window.positionAssetPrice || pos.entryPrice);
        if (pos.currency === currency) {
            posValue = pos.qty * evalPrice;
        }
    }

    let total = portfolio.balances[currency] + posValue;
    
    const currencySymbols = { 'USDT': 'USDT', 'USD': 'USD', 'ARS': 'ARS' };
    const curSym = currencySymbols[currency] || '$';
    document.getElementById('capitalDisplay').innerText = `$${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${curSym}`;
    
    // Actualizar comisiones acumuladas del broker
    const feesDisp = document.getElementById('totalFeesDisplay');
    if (feesDisp) {
        feesDisp.innerText = `$${(portfolio.totalFeesPaid || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    }
    
    // Actualizar datos en el Modal de Tesorería
    const modalVault = document.getElementById('modalVaultUSD');
    if (modalVault) modalVault.innerText = `$${portfolio.VAULT.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    // Actualizar Billeteras en UI
    const vaultDisplay = document.getElementById('vaultDisplay');
    if (vaultDisplay) vaultDisplay.innerText = `USD ${portfolio.VAULT.toFixed(2)}`;
    
    const usdtDisp = document.getElementById('walletUsdtDisplay');
    if (usdtDisp) usdtDisp.innerText = `${portfolio.balances.USDT.toFixed(2)} USDT`;
    
    const usdDisp = document.getElementById('walletUsdDisplay');
    if (usdDisp) usdDisp.innerText = `USD ${portfolio.balances.USD.toFixed(2)}`;
    
    const arsDisp = document.getElementById('walletArsDisplay');
    if (arsDisp) arsDisp.innerText = `$${portfolio.balances.ARS.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ARS`;
    
    // Calcular Rendimiento Total (PnlD) basado exclusivamente en el capital fondeado a la billetera activa
    const pnlDisplay = document.getElementById('pnlDisplay');
    if (pnlDisplay) {
        const base = (portfolio.deposits && portfolio.deposits[currency] > 0) ? portfolio.deposits[currency] : 0;
        
        if (base === 0) {
            pnlDisplay.className = 'font-bold text-gray-400';
            pnlDisplay.innerText = '$0.00 (0.00%)';
        } else {
            const diff = total - base;
            const percent = (diff / base) * 100;
            const sign = diff >= 0 ? '+' : '';
            const color = diff >= 0 ? (diff > 0 ? 'text-green-400' : 'text-gray-400') : 'text-red-400';
            
            pnlDisplay.className = `font-bold ${color}`;
            pnlDisplay.innerText = `${sign}${currency === 'ARS' ? '$' : ''}${Math.abs(diff).toFixed(2)} ${currency} (${sign}${percent.toFixed(2)}%)`;
        }
    }

    // Actualizar Tabla de Posiciones Activas
    const activeBody = document.getElementById('activePositionsBody');
    if (activeBody) {
        const currentPos = getOpenPosition();
        if (!currentPos) {
            if (!document.getElementById('emptyPositionsRow')) {
                activeBody.innerHTML = `<tr id="emptyPositionsRow"><td colspan="6" class="px-4 py-4 text-center text-gray-600 italic">No tienes posiciones activas (100% liquidez en ${currency}).</td></tr>`;
            }
        } else {
            const isSameSymbol = (currentPos.symbol === currentSymbol);
            const activePrice = isSameSymbol ? currentPrice : (window.positionAssetPrice || currentPos.entryPrice);
            const pnlNoRealizado = (activePrice - currentPos.entryPrice) * currentPos.qty;
            const pnlPct = currentPos.entryPrice > 0 ? ((activePrice - currentPos.entryPrice) / currentPos.entryPrice) * 100 : 0;
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
            const symbolIndicator = isSameSymbol 
                ? `<span class="font-bold text-white">${escapeHtml(currentPos.baseCoin)}</span> <span class="text-[10px] text-gray-400">(${escapeHtml(currentPos.symbol)})</span>`
                : `<span class="font-bold text-white">${escapeHtml(currentPos.baseCoin)}</span> <span class="text-[10px] text-yellow-400 bg-yellow-950/60 px-1.5 py-0.5 rounded border border-yellow-700/50">Segundo plano: ${escapeHtml(currentPos.symbol)}</span>`;
            document.getElementById('apCoin').innerHTML = symbolIndicator;
            document.getElementById('apAmount').innerText = currentPos.qty.toFixed(6);
            document.getElementById('apEntry').innerText = `$${currentPos.entryPrice.toLocaleString()}`;
            document.getElementById('apCurrent').innerText = `$${activePrice.toLocaleString()}`;
            
            const pnlCell = document.getElementById('apPnl');
            pnlCell.className = `px-4 py-2 font-bold ${pnlColor}`;
            pnlCell.innerText = `${pnlSign}$${Math.abs(pnlNoRealizado).toFixed(2)} (${pnlSign}${pnlPct.toFixed(2)}%)`;
        }
    }
}

symbolSelect.addEventListener('change', () => {
    currentSymbol = symbolSelect.value;
    logToTerminal(`Cambiando activo a ${currentSymbol}...`, 'warn');
    
    // Si hay una posición abierta en otro activo, alertar y precargar su precio para el SL/TP de fondo
    const pos = getOpenPosition();
    if (pos && pos.symbol !== currentSymbol) {
        logToTerminal(`ℹ️ Posición activa en ${pos.symbol}. El Agente de Riesgo continúa monitoreando tu posición de fondo mientras visualizas ${currentSymbol}.`, 'info');
        refreshPositionPrice();
    }
    
    // Auto-ajustar sugerencia de broker fee según activo (si no está en modo personalizado)
    const feeSelect = document.getElementById('brokerFeeSelect');
    if (feeSelect && feeSelect.value !== 'custom') {
        if (currentSymbol.includes('.BA')) {
            feeSelect.value = "0.50";
        } else if (!currentSymbol.includes('/')) {
            feeSelect.value = "0.25";
        } else {
            feeSelect.value = "0.10";
        }
        updateBrokerFeeDisplay();
    }
    
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
    
    localStorage.setItem('ai_portfolio_v5', JSON.stringify(portfolio));
    updateCapitalDisplay();
    document.getElementById('tesoreriaModal').classList.add('hidden');
    document.getElementById('tesoreriaAmount').value = '';
    
    logToTerminal(`🏦 TESORERÍA: Transferidos ${amount} ${destWallet} a la billetera operativa.`, 'action');
};

window.sweepBackAll = function() {
    if (hasOpenPosition()) {
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
    
    localStorage.setItem('ai_portfolio_v5', JSON.stringify(portfolio));
    updateCapitalDisplay();
    document.getElementById('tesoreriaModal').classList.add('hidden');
    
    logToTerminal(`🧹 SWEEP-BACK: Todas las billeteras operativas vaciadas. Capital devuelto a la Bóveda.`, 'action');
};

// Obtener datos reales del motor Python (con protección contra respuestas tardías)
async function fetchMarketData() {
    const reqSymbol = currentSymbol;
    try {
        logToTerminal(`Conectando al motor Python para obtener velas de ${reqSymbol}...`, 'info');
        const response = await fetch(`${API_BASE_URL}/api/market/history?symbol=${encodeURIComponent(reqSymbol)}&timeframe=${document.getElementById('timeframeSelect')?.value || '1m'}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        if (reqSymbol !== currentSymbol) return; // Descartar si el usuario cambió de símbolo durante la petición
        
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
            logToTerminal('Error de datos: ' + (data?.error || 'Sin datos'), 'error');
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
let cycleInFlight = false; // Mutex para evitar análisis concurrentes en vuelo
let isExecutingTrade = false; // Mutex para evitar ejecuciones concurrentes de órdenes

let copilotExpiryTimer = null;

function scheduleNext(delayMs) {
    if (simulateInterval) clearTimeout(simulateInterval);
    if (isAgentActive) {
        simulateInterval = setTimeout(ejecutarAnalisis, delayMs);
    }
}

agentToggle.addEventListener('click', () => {
    isAgentActive = !isAgentActive;
    if (isAgentActive) {
        agentToggle.innerText = 'Detener Agente (Kill Switch)';
        agentToggle.classList.replace('bg-blue-600', 'bg-red-600');
        agentToggle.classList.replace('hover:bg-blue-700', 'hover:bg-red-700');

        // Si el agente estuvo suspendido y ya hay trades registrados en la sesión actual, avanzar a una nueva sesión
        if (agentWasSuspended && !isCopilotApprovalPause) {
            const hasTradesInCurrentSession = tradeHistoryLog.some(t => (t.sessionId || 1) === currentSessionId);
            if (hasTradesInCurrentSession) {
                currentSessionId += 1;
                localStorage.setItem('ai_current_session_id', currentSessionId.toString());
                logToTerminal(`🔄 Reanudando agente: Nueva sesión iniciada (#${currentSessionId}). Operaciones previas diferenciadas.`, 'info');
            }
            agentWasSuspended = false;
            renderTradeHistory();
        }
        isCopilotApprovalPause = false;

        logToTerminal('Agente activado. Iniciando análisis cuantitativo.', 'info');
        
        ejecutarAnalisis(); // Iniciar primer ciclo
    } else {
        agentToggle.innerText = 'Activar Agente';
        agentToggle.classList.replace('bg-red-600', 'bg-blue-600');
        agentToggle.classList.replace('hover:bg-red-700', 'hover:bg-blue-700');
        
        clearTimeout(simulateInterval);
        if (copilotExpiryTimer) {
            clearInterval(copilotExpiryTimer);
            copilotExpiryTimer = null;
        }
        if (modal && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
            pendingTrade = null;
        }

        if (!isCopilotApprovalPause) {
            agentWasSuspended = true;
            renderTradeHistory();
        }
        logToTerminal('Agente detenido.', 'warn');
    }
});

const ejecutarAnalisis = async () => {
    if (!isAgentActive) return;

    // 1. Verificación del Circuit Breaker (Bloque 4)
    const riskState = getRiskState();
    if (riskState.haltedUntil && Date.now() < riskState.haltedUntil) {
        const hoursLeft = ((riskState.haltedUntil - Date.now()) / (1000 * 60 * 60)).toFixed(1);
        logToTerminal(`🛑 [CIRCUIT BREAKER] Agente en pausa preventiva (${hoursLeft}h restantes). Operación bloqueada.`, 'error');
        if (isAgentActive) {
            isAgentActive = false;
            agentToggle.innerText = 'Activar Agente';
            agentToggle.classList.replace('bg-red-600', 'bg-blue-600');
            agentToggle.classList.replace('hover:bg-red-700', 'hover:bg-blue-700');
        }
        return;
    }

    // 2. Control de concurrencia y mutex (Bloque 3)
    if (cycleInFlight) {
        logToTerminal('⏳ Análisis previo aún en curso. Esperando liberación de recursos...', 'warn');
        scheduleNext(5000);
        return;
    }
    cycleInFlight = true;

    const engine = document.getElementById('engineSelect')?.value || 'local';
    try {
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
                cycleInFlight = false;
                scheduleNext(60000);
                return;
            }
        }

        // 3. Resolución de activo objetivo (Bloque 1 item 8)
        const openPos = getOpenPosition();
        const hasPosition = !!openPos;
        let targetSymbol = currentSymbol;
        let entryPrice = 0;

        if (openPos) {
            targetSymbol = openPos.symbol;
            entryPrice = openPos.entryPrice || 0;
            if (openPos.symbol !== currentSymbol) {
                logToTerminal(`ℹ️ Posición activa en ${openPos.symbol}. Solicitando análisis prioritario de posición abierta...`, 'info');
            }
        }

        logToTerminal(`Consultando Orquestador (${targetSymbol}) vía ${engine.toUpperCase()}...`, 'info');
        
        const tpSlVal = document.getElementById('tpSlSelect')?.value || "3.0|-2.0";
        const [tpStr, slStr] = tpSlVal.split('|');
        const riskVal = document.getElementById('riskSelect')?.value || "0.25";
        
        const macroContextText = document.getElementById('macroContext')?.value || '';
        const sentScore = window.currentSentimentScore || 0;
        const feeRate = getBrokerFeeRate();
        const url = `${API_BASE_URL}/api/market/analysis?symbol=${encodeURIComponent(targetSymbol)}&timeframe=${document.getElementById('timeframeSelect')?.value || '1m'}&engine=${engine}&tp=${tpStr}&sl=${Math.abs(parseFloat(slStr))}&risk=${riskVal}&sentiment=${sentScore}&macro=${encodeURIComponent(macroContextText)}&fee=${feeRate}&has_position=${hasPosition}&entry_price=${entryPrice}`;
        
        // Timeout con AbortController (45s para local/gemini, 120s para modelos locales pesados)
        const timeoutMs = (engine === 'deepseek' || engine === 'ollama') ? 120000 : 45000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        let response;
        try {
            response = await fetch(url, { signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }

        const data = await response.json();
        
        if (data && !data.error) {
            let logType = 'info';
            if (data.signal === 'COMPRAR') logType = 'action';
            if (data.signal === 'VENDER') logType = 'error';
            
            const feeStr = data.fee_info ? ` | Fee Broker: ${data.fee_info.round_trip_fee}% ida/vuelta` : '';
            const rsiDisp = data.indicators?.rsi !== undefined && data.indicators?.rsi !== null ? data.indicators.rsi : '-';
            const smaDisp = data.indicators?.sma_20 !== undefined && data.indicators?.sma_20 !== null ? data.indicators.sma_20 : '-';
            logToTerminal(`[${data.signal}] RSI: ${rsiDisp} | SMA20: ${smaDisp}${feeStr}`, 'warn');
            logToTerminal(`Razonamiento: ${data.reason}`, logType);
            
            // Lógica de Paper Trading & Copiloto
            const baseCoin = targetSymbol.split('/')[0];
            const executionMode = document.getElementById('executionModeSelect')?.value || 'copilot';
            
            // Regla Anti-Overtrading: 1 posición abierta a la vez
            const isBuyable = data.signal === 'COMPRAR' && !hasPosition;
            const isSellable = data.signal === 'VENDER' && hasPosition;
            
            if (data.signal === 'COMPRAR' && hasPosition) {
                logToTerminal(`ℹ️ Ya tienes una posición abierta en ${openPos ? openPos.baseCoin : baseCoin}. Re-compra bloqueada para evitar comisiones innecesarias.`, 'warn');
            }
            
            if (isBuyable || isSellable) {
                let execPrice = currentPrice;
                if (isSellable) {
                    execPrice = (openPos.symbol === currentSymbol) ? currentPrice : (window.positionAssetPrice || openPos.entryPrice);
                }

                if (executionMode === 'auto') {
                    executeTrade(data.signal, targetSymbol, baseCoin, execPrice, 'Automático');
                } else {
                    isCopilotApprovalPause = true;
                    isAgentActive = false;
                    document.getElementById('agentToggle').innerText = 'Activar Agente';
                    document.getElementById('agentToggle').classList.replace('bg-red-600', 'bg-blue-600');
                    document.getElementById('agentToggle').classList.replace('hover:bg-red-700', 'hover:bg-blue-700');
                    showCopilotModal(data.signal, targetSymbol, data.reason, baseCoin, execPrice);
                }
            }
        } else {
            logToTerminal('Error de análisis: ' + (data?.error || 'Respuesta inválida'), 'error');
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            logToTerminal(`⏳ Timeout de análisis agotado en motor ${engine.toUpperCase()}. El servidor tardó demasiado en responder.`, 'warn');
        } else {
            logToTerminal('Fallo de conexión con el Agente Python: ' + err.message, 'error');
        }
    } finally {
        cycleInFlight = false;

        // Calcular próximo intervalo basado en temporalidad y reprogramar deterministamente (Bloque 3)
        if (isAgentActive) {
            const tf = document.getElementById('timeframeSelect')?.value || '1m';
            let delayMs = 60000;
            if (tf === '5m') delayMs = 300000;
            if (tf === '15m') delayMs = 900000;
            if (engine === 'local') delayMs = 15000;

            scheduleNext(delayMs);
        }
    }
};

// Ciclo de Gráfico en Vivo (Cada 2 segundos) para que se mueva rápido con límites y descarte de respuestas tardías
setInterval(async () => {
    const lobby = document.getElementById("lobbyView");
    if (lobby && !lobby.classList.contains("hidden")) return;
    const reqSymbol = currentSymbol;
    try {
        const response = await fetch(`${API_BASE_URL}/api/market/history?symbol=${encodeURIComponent(reqSymbol)}&timeframe=${document.getElementById('timeframeSelect')?.value || '1m'}&limit=60`);
        if (!response.ok) return;
        const data = await response.json();
        if (reqSymbol !== currentSymbol) return; // Descartar respuesta tardía si el usuario cambió de símbolo
        
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

            // -- AGENTE DE RIESGO: Stop Loss y Take Profit Dinámicos con límites congelados --
            const pos = getOpenPosition();
            if (!isExecutingTrade && pos) {
                let evalPrice = currentPrice;
                if (pos.symbol !== currentSymbol) {
                    if (!posPriceInFlight) refreshPositionPrice();
                    const nowSec = Math.floor(Date.now() / 1000);
                    const ageSec = nowSec - (window.positionAssetPriceTs || 0);

                    if (window.positionAssetPrice && ageSec <= 20) {
                        evalPrice = window.positionAssetPrice;
                    } else {
                        if (nowSec - lastStaleWarningTs > 60) {
                            logToTerminal(`⚠️ [RIESGO] SL SIN PRECIO FRESCO (${pos.symbol}, latencia ${ageSec}s). Monitoreando con último valor conocido.`, 'warn');
                            lastStaleWarningTs = nowSec;
                        }
                        evalPrice = window.positionAssetPrice || pos.entryPrice;
                    }
                }

                // Cálculo de PnL Neto después de descontar comisiones del broker
                const feeRate = getBrokerFeeRate();
                const costBasis = pos.costBasis || (pos.qty * pos.entryPrice);
                const valorSalidaNeto = pos.qty * evalPrice * (1 - (feeRate / 100));
                const pnlNetPct = costBasis > 0 ? ((valorSalidaNeto - costBasis) / costBasis) * 100 : 0;
                
                // Inicializar variables dinámicas de Breakeven y Trailing si no existieran (Bloque 5)
                if (typeof pos.peakPrice !== 'number' || pos.peakPrice <= 0) pos.peakPrice = pos.entryPrice;
                if (typeof pos.slEffPct !== 'number') pos.slEffPct = (pos.sl !== undefined ? pos.sl : 1.0);
                if (typeof pos.beArmed !== 'boolean') pos.beArmed = false;
                if (typeof pos.trailPct !== 'number') pos.trailPct = 0.5;

                // Actualizar pico de precio para trailing
                if (evalPrice > pos.peakPrice) {
                    pos.peakPrice = evalPrice;
                }

                const grossGainPct = pos.entryPrice > 0 ? ((evalPrice - pos.entryPrice) / pos.entryPrice) * 100 : 0;

                // 1. Paso Breakeven (K5): activación al cubrir comisiones round-trip + 0.1%
                const beThreshold = (feeRate * 2.0) + 0.1;
                if (grossGainPct >= beThreshold && !pos.beArmed) {
                    pos.slEffPct = -(feeRate * 2.0); // Stop fijado a costo de entrada + fees para pérdida neta 0
                    pos.beArmed = true;
                    logToTerminal(`🛡️ [RIESGO] Breakeven armado en ${pos.symbol} (+${grossGainPct.toFixed(2)}% bruto). Stop Loss movido a precio de entrada + comisiones.`, 'action');
                }

                // 2. Paso Trailing Stop: activación al 60% del camino al Take Profit
                const takeProfitLimit = pos.tp !== undefined ? pos.tp : 1.5;
                if (grossGainPct >= (takeProfitLimit * 0.6)) {
                    const trailSlPrice = pos.peakPrice * (1 - (pos.trailPct / 100));
                    const trailSlPct = pos.entryPrice > 0 ? ((trailSlPrice - pos.entryPrice) / pos.entryPrice) * 100 : 0;
                    if (trailSlPct > -pos.slEffPct) {
                        pos.slEffPct = -trailSlPct;
                        const nowSec = Math.floor(Date.now() / 1000);
                        if (nowSec - lastTrailingLogTs > 10) {
                            logToTerminal(`📈 [RIESGO] Trailing Stop actualizado en ${pos.symbol} (Pico: $${pos.peakPrice.toFixed(2)} | SL dinámico: ${pos.slEffPct > 0 ? '-' : '+'}${Math.abs(pos.slEffPct).toFixed(2)}%).`, 'info');
                            lastTrailingLogTs = nowSec;
                        }
                    }
                }

                // Persistir posición con throttle de 10s
                const nowMs = Date.now();
                if (nowMs - lastPortfolioSaveTs > 10000) {
                    localStorage.setItem('ai_portfolio_v5', JSON.stringify(portfolio));
                    lastPortfolioSaveTs = nowMs;
                }

                // Stop Loss (dispara si la pérdida neta supera el límite dinámico slEffPct)
                if (pnlNetPct <= -pos.slEffPct) {
                    logToTerminal(`⚠️ AGENTE DE RIESGO: Stop Loss / Breakeven disparado en ${pos.symbol} (${pnlNetPct.toFixed(2)}% neto vs límite -${pos.slEffPct.toFixed(2)}%). Vendiendo para proteger capital.`, 'error');
                    executeTrade('VENDER', pos.symbol, pos.baseCoin, evalPrice, 'Stop Loss');
                }
                // Take Profit (dispara si la ganancia neta supera el objetivo congelado)
                else if (pnlNetPct >= takeProfitLimit) {
                    logToTerminal(`🎯 AGENTE DE RIESGO: Take Profit alcanzado en ${pos.symbol} (+${pnlNetPct.toFixed(2)}% neto vs +${takeProfitLimit}% objetivo). Asegurando ganancias.`, 'action');
                    executeTrade('VENDER', pos.symbol, pos.baseCoin, evalPrice, 'Take Profit');
                }
            }
        }
    } catch (err) {
        // Silencioso
    }
}, 2000);

// Agente Sentimiento (Cada 60 segundos)
async function updateSentiment() {
    try {
        const source = document.getElementById('newsSourceSelect')?.value || 'coindesk';
        const response = await fetch(`${API_BASE_URL}/api/market/sentiment?symbol=${encodeURIComponent(currentSymbol)}&source=${source}`);
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
                        <span>📰 ${escapeHtml(data.fuente || 'Noticias')}</span>
                        <span>Score: ${Number(news.score) || 0}</span>
                    </p>
                    <p class="text-xs text-gray-200 mt-1">${escapeHtml(news.title)}</p>
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

// --- Agente de Inversiones (Radar Macro) ---
async function updateMacroRadar() {
    const lobby = document.getElementById("lobbyView");
    if (lobby && !lobby.classList.contains("hidden")) return;

    const toggle = document.getElementById('investmentToggle');
    const container = document.getElementById('macroOpportunitiesContainer');
    if (!toggle || !container) return;

    if (!toggle.checked) {
        container.innerHTML = '<p class="text-xs text-gray-500 text-center py-2">Agente Desactivado.</p>';
        return;
    }

    const engine = document.getElementById('engineSelect')?.value || 'ollama';
    container.innerHTML = '<p class="text-xs text-yellow-500 text-center py-2 animate-pulse">Escaneando eventos globales...</p>';
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/macro/radar?engine=${engine}`);
        const data = await response.json();
        
        container.innerHTML = '';
        if (Array.isArray(data) && data.length > 0) {
            data.forEach(item => {
                const isOp = item.type === 'Oportunidad';
                const colorClass = isOp ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10';
                const typeColor = isOp ? 'text-green-400' : 'text-red-400';
                const div = document.createElement('div');
                div.className = 'bg-gray-800 p-2 rounded border border-gray-600 mb-2';
                div.innerHTML = `
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-xs font-bold text-white">${escapeHtml(item.asset || 'N/A')}</span>
                        <span class="text-[10px] ${colorClass} font-bold px-1 rounded">${Number(item.confidence) || 0}% Conf.</span>
                    </div>
                    <p class="text-[10px] text-gray-400 leading-tight"><span class="font-bold ${typeColor}">${escapeHtml(item.type)}:</span> ${escapeHtml(item.reason)}</p>
                    <p class="text-[9px] text-gray-500 mt-1">⏳ Sugerido: ${escapeHtml(item.schedule || '-')}</p>
                `;
                container.appendChild(div);
            });
        } else {
            container.innerHTML = '<p class="text-xs text-gray-500 text-center py-2">Sin hallazgos macro.</p>';
        }
    } catch (err) {
        console.error("Fallo el Agente de Inversiones", err);
        container.innerHTML = '<p class="text-xs text-red-500 text-center py-2">Error de conexión.</p>';
    }
}
updateMacroRadar();
setInterval(updateMacroRadar, 120000); // 2 minutos

const investmentToggle = document.getElementById('investmentToggle');
if (investmentToggle) {
    investmentToggle.addEventListener('change', () => {
        const isChecked = investmentToggle.checked;
        logToTerminal(isChecked ? "Agente de Inversiones ACTIVADO" : "Agente de Inversiones DESACTIVADO", "info");
        
        const badge = document.getElementById('radarLiveStatus');
        if (badge) {
            if (isChecked) {
                badge.innerText = "EN VIVO";
                badge.className = "text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded border border-yellow-500/50 transition-colors";
            } else {
                badge.innerText = "OFF";
                badge.className = "text-[10px] bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded border border-gray-500/50 transition-colors";
            }
        }
        
        updateMacroRadar();
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
        if (!trade.timestamp) return false; 
        return new Date(trade.timestamp).toDateString() === todayStr;
    });

    if (todaysTrades.length === 0) {
        const msg = isAgentActive 
            ? `Sesión #${currentSessionId} activa. Esperando primeras operaciones del día...`
            : `No hay operaciones registradas en el día de hoy.`;
        tbody.innerHTML = `<tr id="emptyHistoryRow"><td colspan="7" class="px-4 py-4 text-center ${isAgentActive ? 'text-blue-400' : 'text-gray-600'} italic">${msg}</td></tr>`;
        return;
    }

    const hasTradesInCurrentSession = todaysTrades.some(t => (t.sessionId || 1) === currentSessionId);
    if (isAgentActive && !hasTradesInCurrentSession) {
        const activeHeaderTr = document.createElement('tr');
        activeHeaderTr.className = 'bg-blue-950/40 border-b border-blue-500/40 text-blue-300';
        activeHeaderTr.innerHTML = `
            <td colspan="7" class="px-4 py-2 text-center text-xs">
                <div class="inline-flex items-center space-x-2">
                    <span class="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                    <span class="font-bold text-white">Sesión Actual Activa (#${currentSessionId})</span>
                    <span class="text-blue-300/80">— Agente reanudado, monitoreando el mercado...</span>
                </div>
            </td>
        `;
        tbody.appendChild(activeHeaderTr);
    }

    let lastSessionSeen = null;

    todaysTrades.forEach((trade, index) => {
        const tradeSession = trade.sessionId || 1;
        const isCurrentSession = (tradeSession === currentSessionId);

        if (lastSessionSeen !== null && tradeSession !== lastSessionSeen) {
            const dividerTr = document.createElement('tr');
            dividerTr.className = 'bg-gray-900/90 border-y-2 border-dashed border-gray-600/70 text-gray-400 select-none';
            dividerTr.innerHTML = `
                <td colspan="7" class="px-4 py-2 text-center">
                    <div class="inline-flex items-center space-x-2 text-xs text-yellow-400/90 bg-yellow-950/40 px-3 py-1 rounded-full border border-yellow-700/50">
                        <span>⏸️</span>
                        <span class="font-semibold text-yellow-300">Agente Suspendido & Reanudado</span>
                        <span class="text-gray-400">— Operaciones de sesión previa (#${tradeSession})</span>
                    </div>
                </td>
            `;
            tbody.appendChild(dividerTr);
        } else if (index === 0 && !isCurrentSession) {
            const dividerTr = document.createElement('tr');
            dividerTr.className = 'bg-gray-900/90 border-y-2 border-dashed border-gray-600/70 text-gray-400 select-none';
            dividerTr.innerHTML = `
                <td colspan="7" class="px-4 py-2 text-center">
                    <div class="inline-flex items-center space-x-2 text-xs text-gray-400 bg-gray-900/90 px-3 py-1 rounded-full border border-gray-700">
                        <span>⏸️</span>
                        <span class="font-semibold text-gray-300">Sesión Previa (#${tradeSession})</span>
                        <span class="text-gray-500">— Operaciones anteriores a la última suspensión</span>
                    </div>
                </td>
            `;
            tbody.appendChild(dividerTr);
        }

        lastSessionSeen = tradeSession;

        let statusClass = 'text-gray-400';
        if (trade.status === 'Ejecutada') statusClass = 'text-green-400 font-bold';
        if (trade.status === 'Rechazada') statusClass = 'text-red-400 font-bold';
        if (trade.status === 'Expirada') statusClass = 'text-yellow-400 font-bold';
        let typeClass = trade.signal === 'COMPRAR' ? 'text-green-500 font-bold' : 'text-red-500 font-bold';
        const feeVal = trade.fee !== undefined ? trade.fee : 0;
        
        const tr = document.createElement('tr');
        if (isCurrentSession) {
            tr.className = 'border-b border-blue-900/50 bg-blue-950/20 hover:bg-blue-900/30 transition-colors border-l-4 border-l-blue-500';
        } else {
            tr.className = 'border-b border-gray-800 bg-gray-900/50 opacity-75 hover:opacity-100 hover:bg-gray-800/40 transition-all border-l-4 border-l-gray-700';
        }

        const sessionBadge = isCurrentSession 
            ? `<span class="inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/40 ml-1">Actual</span>`
            : `<span class="inline-block text-[10px] px-1.5 py-0.5 rounded font-normal bg-gray-800 text-gray-400 border border-gray-700 ml-1">Previa</span>`;

        const displaySymbol = escapeHtml(trade.symbol || (trade.baseCoin ? trade.baseCoin + '/USDT' : 'N/A'));

        tr.innerHTML = `
            <td class="px-4 py-2 whitespace-nowrap">
                <span class="font-mono text-gray-200">${escapeHtml(trade.timeString)}</span>
            </td>
            <td class="px-4 py-2 font-bold text-white">${displaySymbol}</td>
            <td class="px-4 py-2 ${typeClass}">
                ${escapeHtml(trade.signal)}
            </td>
            <td class="px-4 py-2 font-mono text-white">$${Number(trade.price || 0).toLocaleString()}</td>
            <td class="px-4 py-2 font-mono text-yellow-400">$${feeVal.toFixed(2)}</td>
            <td class="px-4 py-2 ${statusClass}">${escapeHtml(trade.status)}</td>
            <td class="px-4 py-2 text-xs text-gray-300 whitespace-nowrap">
                ${escapeHtml(trade.mode)} ${sessionBadge}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function addTradeToHistory(signal, symbol, baseCoin, price, status, mode, fee = 0, qty = 0) {
    // Normalización defensiva retrocompatible
    if (typeof price === 'string' && (price === 'Ejecutada' || price === 'Rechazada' || price === 'Expirada')) {
        qty = fee || 0;
        fee = mode || 0;
        mode = status;
        status = price;
        price = baseCoin;
        baseCoin = symbol;
        symbol = baseCoin ? (baseCoin.includes('/') ? baseCoin : baseCoin + '/USDT') : currentSymbol;
    }

    const now = new Date();
    const timeString = now.toLocaleTimeString();
    const timestamp = now.toISOString();
    const effectiveSymbol = symbol || (baseCoin ? baseCoin + '/USDT' : currentSymbol);

    tradeHistoryLog.unshift({ 
        timeString, 
        timestamp, 
        signal, 
        symbol: effectiveSymbol,
        baseCoin, 
        price: Number(price) || 0, 
        qty: Number(Number(qty || 0).toFixed(6)),
        status, 
        mode, 
        fee: Number(Number(fee).toFixed(2)),
        sessionId: currentSessionId
    });
    
    localStorage.setItem('ai_trade_history_v2', JSON.stringify(tradeHistoryLog));
    
    // Guardar en backend CSV incluyendo X-API-Token si existe
    const token = localStorage.getItem('ai_app_token') || '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['X-API-Token'] = token;

    fetch(`${API_BASE_URL}/api/log_trade`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
            timeString, 
            symbol: effectiveSymbol, 
            signal, 
            price: Number(price) || 0, 
            status, 
            mode,
            qty: Number(Number(qty || 0).toFixed(6)),
            fee: Number(Number(fee || 0).toFixed(2)),
            session_id: currentSessionId 
        })
    }).catch(err => console.error('Error guardando en archivo CSV:', err));
    
    renderTradeHistory();
}

function executeTrade(signal, symbol, baseCoin, price, mode = 'Automático') {
    // Soporte retrocompatible de 4 argumentos
    if (typeof baseCoin === 'number') {
        mode = price || 'Automático';
        price = baseCoin;
        baseCoin = symbol ? symbol.split('/')[0] : 'BTC';
        symbol = symbol ? (symbol.includes('/') ? symbol : symbol + '/USDT') : currentSymbol;
    }

    if (isExecutingTrade) {
        logToTerminal('⚠️ Operación en curso. Ignorando solicitud concurrente.', 'warn');
        return;
    }
    if (!Number.isFinite(price) || price <= 0) {
        logToTerminal(`⚠️ Ejecución abortada: precio inválido o no numérico ($${price}).`, 'error');
        return;
    }

    const effectiveSymbol = symbol || currentSymbol;
    const currency = getCurrency(effectiveSymbol);
    if (!Number.isFinite(portfolio.balances[currency])) {
        logToTerminal(`⚠️ Ejecución abortada: balance no numérico en moneda ${currency}.`, 'error');
        return;
    }

    isExecutingTrade = true;
    try {
        const openPos = getOpenPosition();
        const hasPosition = !!openPos;

        if (signal === 'COMPRAR' && hasPosition) {
            logToTerminal(`⚠️ Compra bloqueada: ya existe una posición activa en ${openPos.baseCoin}.`, 'warn');
            return;
        }
        if (signal === 'VENDER' && !hasPosition) {
            logToTerminal(`⚠️ Venta ignorada: no hay posición abierta que cerrar.`, 'warn');
            return;
        }

        const feeRate = getBrokerFeeRate();
        if (signal === 'COMPRAR') {
            const riskFactor = parseFloat(document.getElementById('riskSelect')?.value || "0.25");
            const maxRiesgo = portfolio.balances[currency] * riskFactor;
            const tradeAmount = maxRiesgo;
            
            if (tradeAmount < 5) {
                logToTerminal('⚠️ Saldo insuficiente para abrir nueva posición (mínimo $5).', 'error');
                return;
            }

            const feeAmount = tradeAmount * (feeRate / 100);
            const capitalNeto = tradeAmount - feeAmount;
            const cantidadAComprar = capitalNeto / price;
            
            const tpSlVal = document.getElementById('tpSlSelect')?.value || "1.5|-1.0";
            const [tpStr, slStr] = tpSlVal.split('|');
            const tpLimit = Math.abs(parseFloat(tpStr)) || 1.5;
            const slLimit = Math.abs(parseFloat(slStr)) || 1.0;

            portfolio.position = {
                symbol: effectiveSymbol,
                baseCoin: baseCoin,
                currency: currency,
                qty: cantidadAComprar,
                entryPrice: price,
                costBasis: tradeAmount,
                tp: tpLimit,
                sl: slLimit,
                peakPrice: price,
                slEffPct: slLimit,
                beArmed: false,
                trailPct: 0.5,
                openedAt: new Date().toISOString()
            };
            
            // Espejo retrocompatible
            portfolio.ASSET = cantidadAComprar;
            portfolio.entryPrice = price;
            portfolio.balances[currency] -= tradeAmount;
            portfolio.totalFeesPaid = (portfolio.totalFeesPaid || 0) + feeAmount;
            
            logToTerminal(`💰 SIMULACIÓN: COMPRADO ${cantidadAComprar.toFixed(4)} ${baseCoin} (${effectiveSymbol}) a $${price.toLocaleString()} (Inversión: $${tradeAmount.toFixed(2)} | Fee Broker: $${feeAmount.toFixed(2)} [${feeRate}%] | TP: +${tpLimit}% | SL: -${slLimit}%)`, 'action');
            addTradeToHistory(signal, effectiveSymbol, baseCoin, price, 'Ejecutada', mode, feeAmount, cantidadAComprar);
        } else if (signal === 'VENDER') {
            // VENDER siempre usa los datos reales de la posición (Bloque 1 item 5)
            const pos = openPos;
            const sellSymbol = pos.symbol;
            const sellCoin = pos.baseCoin;
            const sellCurrency = pos.currency || getCurrency(sellSymbol);
            const posQty = pos.qty;

            // Validación de frescura para ventas si no está en pantalla
            let execSellPrice = price;
            if (sellSymbol !== currentSymbol && mode !== 'Stop Loss' && mode !== 'Take Profit') {
                const nowSec = Math.floor(Date.now() / 1000);
                const ageSec = nowSec - (window.positionAssetPriceTs || 0);
                if (!window.positionAssetPrice || ageSec > 15) {
                    logToTerminal(`⚠️ [VENTA ABORTADA] No hay precio fresco (< 15s) de segundo plano para ${sellSymbol}. Cambia al activo en pantalla o espera respuesta del feed.`, 'error');
                    return;
                }
                execSellPrice = window.positionAssetPrice;
            }

            const dolaresObtenidosBruto = posQty * execSellPrice;
            const feeAmount = dolaresObtenidosBruto * (feeRate / 100);
            const dolaresNetos = dolaresObtenidosBruto - feeAmount;
            const costBasis = pos.costBasis || (posQty * pos.entryPrice);
            const pnlNeto = dolaresNetos - costBasis;
            
            portfolio.balances[sellCurrency] += dolaresNetos;
            portfolio.position = null;
            portfolio.ASSET = 0;
            portfolio.entryPrice = 0;
            window.positionAssetPrice = null;
            portfolio.totalFeesPaid = (portfolio.totalFeesPaid || 0) + feeAmount;
            
            // Actualizar Circuit Breaker diario (Bloque 4)
            recordTradeInCircuitBreaker(pnlNeto);

            logToTerminal(`💵 SIMULACIÓN: VENDIDO ${sellCoin} (${sellSymbol}) a $${execSellPrice.toLocaleString()} (Bruto: $${dolaresObtenidosBruto.toFixed(2)} | Fee Broker: $${feeAmount.toFixed(2)} [${feeRate}%] | Neto: $${dolaresNetos.toFixed(2)} | PnL: ${pnlNeto >= 0 ? '+' : ''}$${pnlNeto.toFixed(2)}). Saldo ${sellCurrency}: $${portfolio.balances[sellCurrency].toFixed(2)}`, 'error');
            
            // --- LÓGICA DE AUTO-ASEGURAR GANANCIAS ---
            const autoVaultToggle = document.getElementById('autoVaultToggle');
            if (autoVaultToggle && autoVaultToggle.checked && portfolio.deposits[sellCurrency] > 0) {
                const threshold = parseFloat(document.getElementById('autoVaultThreshold')?.value || "50");
                const profitPct = ((portfolio.balances[sellCurrency] - portfolio.deposits[sellCurrency]) / portfolio.deposits[sellCurrency]) * 100;
                
                if (profitPct >= threshold) {
                    const profitToSweep = portfolio.balances[sellCurrency] - portfolio.deposits[sellCurrency];
                    portfolio.balances[sellCurrency] -= profitToSweep;
                    
                    if (sellCurrency === 'ARS') {
                        portfolio.VAULT += (profitToSweep / 1000.00);
                    } else {
                        portfolio.VAULT += profitToSweep;
                    }
                    
                    logToTerminal(`🔒 AUTO-VAULT: Rentabilidad del ${profitPct.toFixed(2)}% alcanzada. Ganancia de $${profitToSweep.toFixed(2)} transferida a la Bóveda Segura.`, 'action');
                }
            }
            addTradeToHistory(signal, sellSymbol, sellCoin, execSellPrice, 'Ejecutada', mode, feeAmount, posQty);
        }
        
        localStorage.setItem('ai_portfolio_v5', JSON.stringify(portfolio));
        updateCapitalDisplay();
    } finally {
        isExecutingTrade = false;
    }
}

let pendingTrade = null;
const modal = document.getElementById('copilotModal');

function showCopilotModal(signal, symbol, reason, baseCoin, price) {
    if (copilotExpiryTimer) {
        clearInterval(copilotExpiryTimer);
        copilotExpiryTimer = null;
    }
    document.getElementById('copilotMessage').innerText = `El Agente recomienda ${signal} ${baseCoin} (${symbol}) a $${price.toLocaleString()}`;
    document.getElementById('copilotReason').innerText = `Razonamiento: ${reason}`;
    modal.classList.remove('hidden');
    pendingTrade = { signal, symbol, baseCoin, price, signalPrice: price, openedAt: Date.now() };

    let timeLeft = 120;
    copilotExpiryTimer = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(copilotExpiryTimer);
            copilotExpiryTimer = null;
            if (pendingTrade && !modal.classList.contains('hidden')) {
                modal.classList.add('hidden');
                logToTerminal(`⌛ [COPILOTO] Orden expirada tras 120s sin confirmación (${pendingTrade.signal} ${pendingTrade.symbol}).`, 'warn');
                addTradeToHistory(pendingTrade.signal, pendingTrade.symbol, pendingTrade.baseCoin, pendingTrade.signalPrice, 'Expirada', 'Copiloto', 0, 0);
                pendingTrade = null;
                isAgentActive = true;
                agentToggle.innerText = 'Detener Agente (Kill Switch)';
                agentToggle.classList.replace('bg-blue-600', 'bg-red-600');
                agentToggle.classList.replace('hover:bg-blue-700', 'hover:bg-red-700');
                scheduleNext(5000);
            }
        }
    }, 1000);
}

// Tecla ESC para rechazar orden en modal copiloto (Bloque 3 item 3)
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
        document.getElementById('btnReject')?.click();
    }
});

document.getElementById('btnReject').addEventListener('click', () => {
    if (copilotExpiryTimer) {
        clearInterval(copilotExpiryTimer);
        copilotExpiryTimer = null;
    }
    modal.classList.add('hidden');
    if (pendingTrade) {
        logToTerminal('❌ Operación rechazada por el usuario.', 'warn');
        addTradeToHistory(pendingTrade.signal, pendingTrade.symbol, pendingTrade.baseCoin, pendingTrade.signalPrice, 'Rechazada', 'Copiloto');
        pendingTrade = null;
    }
    isCopilotApprovalPause = true;
    agentToggle.click();
});

document.getElementById('btnApprove').addEventListener('click', () => {
    if (copilotExpiryTimer) {
        clearInterval(copilotExpiryTimer);
        copilotExpiryTimer = null;
    }
    modal.classList.add('hidden');
    if (pendingTrade) {
        const openPos = getOpenPosition();
        const hasPos = !!openPos;
        
        // 1. Revalidar estado antes de ejecutar
        if (pendingTrade.signal === 'COMPRAR') {
            if (hasPos) {
                logToTerminal('⚠️ Orden descartada: ya tienes una posición abierta mientras decidías.', 'warn');
                pendingTrade = null;
                isCopilotApprovalPause = true;
                agentToggle.click();
                return;
            }
            if (currentSymbol !== pendingTrade.symbol) {
                logToTerminal(`⚠️ Orden de compra descartada: cambiaste de activo en pantalla (${currentSymbol} != ${pendingTrade.symbol}).`, 'warn');
                pendingTrade = null;
                isCopilotApprovalPause = true;
                agentToggle.click();
                return;
            }
        }
        if (pendingTrade.signal === 'VENDER' && !hasPos) {
            logToTerminal('⚠️ Orden descartada: la posición ya fue cerrada previamente (ej. Stop Loss).', 'warn');
            pendingTrade = null;
            isCopilotApprovalPause = true;
            agentToggle.click();
            return;
        }

        // 2. Control de Slippage
        const tradeSymbol = pendingTrade.symbol || currentSymbol;
        const evalCurrentPrice = (tradeSymbol === currentSymbol) ? currentPrice : (window.positionAssetPrice || pendingTrade.signalPrice);
        if (pendingTrade.signalPrice > 0) {
            const priceDiffPct = Math.abs((evalCurrentPrice - pendingTrade.signalPrice) / pendingTrade.signalPrice) * 100;
            if (priceDiffPct > 1.0) {
                logToTerminal(`⚠️ Deslizamiento detectado (${priceDiffPct.toFixed(2)}%). Ejecutando a precio actual: $${evalCurrentPrice.toLocaleString()}`, 'warn');
            }
        }

        logToTerminal('✅ Operación aprobada por el usuario.', 'action');
        executeTrade(pendingTrade.signal, tradeSymbol, pendingTrade.baseCoin, evalCurrentPrice, 'Copiloto');
        pendingTrade = null;
    }
    isCopilotApprovalPause = true;
    agentToggle.click();
});

// Cierre Manual de Emergencia (Bloque 1 item 6)
window.forceClosePosition = function() {
    const pos = getOpenPosition();
    if (pos) {
        logToTerminal(`⚠️ CIERRE MANUAL: El usuario forzó el cierre de la posición activa en ${pos.symbol}.`, 'error');
        
        if (modal && !modal.classList.contains('hidden')) {
            if (copilotExpiryTimer) {
                clearInterval(copilotExpiryTimer);
                copilotExpiryTimer = null;
            }
            modal.classList.add('hidden');
            pendingTrade = null;
        }

        const activePrice = (pos.symbol === currentSymbol) ? currentPrice : (window.positionAssetPrice || pos.entryPrice);
        executeTrade('VENDER', pos.symbol, pos.baseCoin, activePrice, 'Manual');
        
        if (isAgentActive) {
            isCopilotApprovalPause = false;
            agentToggle.click();
            logToTerminal(`Agente detenido automáticamente por cierre manual. Vuelve a activarlo cuando desees.`, 'warn');
        }
    } else {
        logToTerminal(`ℹ️ No hay posición abierta que cerrar.`, 'info');
    }
};

// Al cargar la página, restaurar el historial visual
document.addEventListener('DOMContentLoaded', () => {
    renderTradeHistory();
});

// Funciones interactivas de la Bóveda
window.inyectarCapital = function(amount) {
    const cur = getCurrency(currentSymbol);
    portfolio.balances[cur] += amount;
    portfolio.deposits[cur] = (portfolio.deposits[cur] || 0) + amount;
    localStorage.setItem('ai_portfolio_v5', JSON.stringify(portfolio));
    logToTerminal(`💸 DEPÓSITO: Se han inyectado $${amount} ${cur} de liquidez a la billetera operativa.`, 'action');
    updateCapitalDisplay();
};


// Listeners de la nueva UI de Configuración
document.getElementById('saveApiKeyBtn')?.addEventListener('click', async () => {
    const key = document.getElementById('apiKeyInput').value;
    if(!key) return;
    try {
        const token = localStorage.getItem('ai_app_token') || '';
        const headers = {'Content-Type': 'application/json'};
        if (token) headers['X-API-Token'] = token;

        const response = await fetch(`${API_BASE_URL}/api/config/gemini`, {
            method: 'POST',
            headers,
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

const brokerFeeSelect = document.getElementById('brokerFeeSelect');
const customFeeWrapper = document.getElementById('customFeeWrapper');
const customFeeInput = document.getElementById('customFeeInput');

brokerFeeSelect?.addEventListener('change', () => {
    if (brokerFeeSelect.value === 'custom') {
        customFeeWrapper?.classList.remove('hidden');
    } else {
        customFeeWrapper?.classList.add('hidden');
    }
    updateBrokerFeeDisplay();
    logToTerminal(`Comisión del Broker fijada en: ${getBrokerFeeRate()}% por orden (Round-Trip: ${(getBrokerFeeRate() * 2).toFixed(2)}%)`, 'info');
});

customFeeInput?.addEventListener('input', () => {
    updateBrokerFeeDisplay();
});

setTimeout(updateBrokerFeeDisplay, 300);

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
            const tradeQty = (trade.qty && trade.qty > 0) ? trade.qty : 1;
            posicionesAbiertas[asst].push({ 
                precioCompra: precio, 
                qty: tradeQty,
                timestamp: trade.timestamp, 
                timeString: trade.timeString, 
                fee: trade.fee || 0 
            });
        } else if (trade.signal === 'VENDER') {
            if (posicionesAbiertas[asst] && posicionesAbiertas[asst].length > 0) {
                const compra = posicionesAbiertas[asst].shift();
                const feeVenta = trade.fee || 0;
                const feeCompra = compra.fee || 0;
                const feeTotalTrade = feeCompra + feeVenta;
                const matchedQty = (trade.qty && trade.qty > 0) ? trade.qty : (compra.qty || 1);
                const pnlBruto = (precio - compra.precioCompra) * matchedQty;
                const pnlNeto = pnlBruto - feeTotalTrade;
                const costoBase = (compra.precioCompra * matchedQty);
                const pnlPercent = costoBase > 0 ? (pnlNeto / costoBase) * 100 : 0;
                
                tradesCerrados.push({
                    activo: asst,
                    compra: compra.precioCompra,
                    venta: precio,
                    qty: matchedQty,
                    feeTotal: feeTotalTrade,
                    pnl: pnlNeto,
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
    
    // Sumar comisiones totales del periodo
    let totalFeesPeriodo = 0;
    tradesEnRango.forEach(t => {
        totalFeesPeriodo += (t.fee || 0);
    });
    
    const winRate = totalTrades > 0 ? ((winTrades / totalTrades) * 100).toFixed(2) : 0;
    
    // Calcular Capitales con MATEMÁTICA PURA basada en operaciones reales
    const currency = getCurrency(currentSymbol) || 'USDT';
    
    // Dinero actual en cuenta (Bóveda + Billetera Operativa + Posición abierta)
    let asstValue = 0;
    const openPos = getOpenPosition();
    if (openPos) {
        const evalPrice = (openPos.symbol === currentSymbol) ? currentPrice : (window.positionAssetPrice || openPos.entryPrice);
        if (openPos.currency === currency) {
            asstValue = openPos.qty * evalPrice;
        }
    }
    // El bot y el Resumen se enfocan EXCLUSIVAMENTE en la Billetera Operativa Activa (Aislamiento de Fondos)
    const saldoOperativoActual = (portfolio.balances && portfolio.balances[currency] !== undefined)
                                    ? portfolio.balances[currency] + asstValue
                                    : (portfolio[currency] || 0) + asstValue;
    
    // Base de Capital Inicial: toma siempre la base real inyectada por el usuario (sin maquillar comisiones)
    const baseFondeada = (portfolio.deposits && portfolio.deposits[currency] > 0) ? portfolio.deposits[currency] : (saldoOperativoActual - totalPnl);
    const capInicial = baseFondeada;
    const capFinal = saldoOperativoActual;
    
    // El Resultado Neto real es la diferencia entre el capital final (efectivo + valor actual de posición) y el inicial depositado
    const resultadoNeto = capFinal - capInicial;
    const rentabilidadGlobal = capInicial > 0 ? ((resultadoNeto / capInicial) * 100).toFixed(2) : 0;
    
    // Actualizar UI
    document.getElementById('resumenStats').classList.remove('hidden');
    
    // Stats Nuevos con Moneda Real de la Billetera Operada
    const prefix = (currency === 'ARS') ? '$' : '';
    document.getElementById('resDineroInicial').innerText = `${prefix}${capInicial.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})} ${currency}`;
    document.getElementById('resDineroFinal').innerText = `${prefix}${capFinal.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})} ${currency}`;
    
    const sign = resultadoNeto >= 0 ? '+' : '';
    const colorPnl = resultadoNeto >= 0 ? (resultadoNeto > 0 ? 'text-green-400' : 'text-gray-400') : 'text-red-400';
    
    const elResultado = document.getElementById('resResultadoNeto');
    elResultado.innerText = `${sign}${prefix}${Math.abs(resultadoNeto).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})} ${currency}`;
    elResultado.className = `text-xl font-bold ${colorPnl}`;
    
    const elFeesCard = document.getElementById('resComisionesBroker');
    if (elFeesCard) {
        elFeesCard.innerText = `$${totalFeesPeriodo.toFixed(2)}`;
    }
    
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
        if (openPos) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-4 text-center text-yellow-400 font-medium bg-yellow-900/10">⏳ Posición activa en curso (${openPos.qty.toFixed(6)} ${escapeHtml(openPos.baseCoin)} comprados a $${openPos.entryPrice.toLocaleString()}). Las estadísticas de acierto (Win Rate) y curva se completarán al cerrar la venta.</td></tr>`;
        } else {
            tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-4 text-center text-gray-600 italic">No hay operaciones de ciclo completo (Compra y Venta) en este periodo.</td></tr>`;
        }
    } else {
        tradesCerrados.forEach(t => {
            const tr = document.createElement('tr');
            const colorTr = t.pnl > 0 ? 'text-green-400' : 'text-red-400';
            const signTr = t.pnl > 0 ? '+' : '';
            tr.innerHTML = `
                <td class="px-4 py-2">${new Date(t.timestampVenta).toLocaleString()}</td>
                <td class="px-4 py-2 font-bold">${escapeHtml(t.activo)}</td>
                <td class="px-4 py-2 text-gray-300">$${t.compra.toFixed(2)}</td>
                <td class="px-4 py-2 text-gray-300">$${t.venta.toFixed(2)}</td>
                <td class="px-4 py-2 font-mono text-yellow-400">$${t.feeTotal.toFixed(2)}</td>
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

// --- PRE-MARKET DIGEST LOGIC ---
const btnPremarket = document.getElementById("btnPremarket");
if (btnPremarket) {
    btnPremarket.addEventListener("click", async () => {
        btnPremarket.innerText = "Analizando buzón...";
        btnPremarket.disabled = true;
        
        const engine = document.getElementById("aiEngineSelect") ? document.getElementById("aiEngineSelect").value : "ollama";
        
        logToTerminal("Iniciando secuencia de Despertar Pre-Market...", "info");
        
        try {
            const res = await fetch(`${API_BASE_URL}/api/macro/premarket?engine=${engine}`);
            const data = await res.json();
            
            if (data.status === "error") {
                logToTerminal(`Error Pre-Market: ${data.message}`, "error");
                btnPremarket.innerText = "Error";
                setTimeout(() => { btnPremarket.innerText = "Despertar Cerebro (Pre-Market)"; btnPremarket.disabled = false; }, 3000);
                return;
            }
            
            if (data.status === "idle") {
                logToTerminal(`Pre-Market: ${data.message}`, "info");
                btnPremarket.innerText = "Buzón Vacío";
                setTimeout(() => { btnPremarket.innerText = "Despertar Cerebro (Pre-Market)"; btnPremarket.disabled = false; }, 3000);
                return;
            }
            
            // Éxito
            window.premarketData = data; // Guardamos globalmente
            logToTerminal(`PRE-MARKET COMPLETADO: ${data.resumen_general}`, "success");
            
            // Si hay activos analizados, los listamos en el terminal (Bloque 7)
            if (data.activos && data.activos.length > 0) {
                data.activos.forEach(a => {
                    const msg = `Consenso [${a.simbolo || 'N/A'}]: ${a.consenso_direccional || 'NEUTRAL'}. Razón: ${a.razonamiento || '-'}. Autorizado: ${a.autorizar_operacion || false}`;
                    const logType = a.consenso_direccional === "ALCISTA" ? "action" : (a.consenso_direccional === "BAJISTA" || a.consenso_direccional === "PELIGRO" ? "error" : "warn");
                    logToTerminal(msg, logType);
                });
            }
            
            btnPremarket.innerText = "Consenso Listo";
            btnPremarket.classList.replace("bg-blue-600", "bg-green-600");
            setTimeout(() => { 
                btnPremarket.innerText = "Despertar Cerebro (Pre-Market)"; 
                btnPremarket.classList.replace("bg-green-600", "bg-blue-600");
                btnPremarket.disabled = false; 
            }, 5000);
            
        } catch (e) {
            logToTerminal(`Error de red al consultar Pre-Market: ${e.message}`, "error");
            btnPremarket.innerText = "Despertar Cerebro (Pre-Market)";
            btnPremarket.disabled = false;
        }
    });
}
// Mostrar el botón si el toggle de inversiones está activado
// removed redeclaration
if (investmentToggle && btnPremarket) {
    investmentToggle.addEventListener("change", (e) => {
        if (e.target.checked) {
            btnPremarket.classList.remove("hidden");
        } else {
            btnPremarket.classList.add("hidden");
        }
    });
}

// --- LÓGICA DEL LOBBY MACRO ---
document.addEventListener("DOMContentLoaded", () => {
    const btnLobbyPremarket = document.getElementById("btnLobbyPremarket");
    const lobbyReportBox = document.getElementById("lobbyReportBox");
    const btnEnterTrench = document.getElementById("btnEnterTrench");
    const lobbyView = document.getElementById("lobbyView");
    const tradingView = document.getElementById("tradingView");
    const lobbySymbolSelect = document.getElementById("lobbySymbolSelect");
    const mainSymbolSelect = document.getElementById("symbolSelect");
    if (lobbySymbolSelect && mainSymbolSelect) {
        // Clonar todas las opciones del selector principal al del lobby para que no falte ninguna
        lobbySymbolSelect.innerHTML = mainSymbolSelect.innerHTML;
        // Restaurar las clases para que se vea bien en el lobby
        Array.from(lobbySymbolSelect.options).forEach(opt => {
            if (!opt.disabled) opt.className = "bg-gray-900 text-white";
        });
    }

    
    if (btnLobbyPremarket) {
        btnLobbyPremarket.addEventListener("click", async () => {
            btnLobbyPremarket.innerHTML = '<span class="animate-spin">🔄</span> Consultando al Cerebro...';
            btnLobbyPremarket.disabled = true;
            lobbyReportBox.classList.remove("hidden");
            lobbyReportBox.innerHTML = '<span class="text-yellow-400">Generando resumen del fin de semana (puede tomar hasta 2 minutos con Ollama local)...</span>';
            
            try {
                // By default try to use the engine selected, if not default to ollama
                const engine = document.getElementById("aiEngineSelect") ? document.getElementById("aiEngineSelect").value : "ollama";
                const res = await fetch(`${API_BASE_URL}/api/macro/premarket?engine=${engine}`);
                const data = await res.json();
                
                if (data.status === "error") {
                    lobbyReportBox.innerHTML = `<span class="text-red-400">Error: ${escapeHtml(data.message)}</span>`;
                } else if (data.status === "idle") {
                    lobbyReportBox.innerHTML = `<span class="text-gray-400">${escapeHtml(data.message)}</span>`;
                } else {
                    let html = `<p class="font-bold text-white text-base mb-2">Resumen General:</p>
                                <p class="mb-4 text-green-300">${escapeHtml(data.resumen_general)}</p>
                                <p class="font-bold text-white text-base mb-2">Análisis por Activo:</p><ul class="space-y-2">`;
                    if (data.activos) {
                        data.activos.forEach(a => {
                            const dir = escapeHtml(a.consenso_direccional);
                            const color = a.consenso_direccional === "ALCISTA" ? "text-green-400" : (a.consenso_direccional === "BAJISTA" || a.consenso_direccional === "PELIGRO" ? "text-red-400" : "text-yellow-400");
                            html += `<li class="bg-gray-800 p-2 rounded border border-gray-700">
                                <span class="font-bold text-white">${escapeHtml(a.simbolo)}</span> - <span class="${color} font-bold">${dir}</span><br>
                                <span class="text-gray-400 text-xs">${escapeHtml(a.razonamiento)}</span>
                            </li>`;
                        });
                    }
                    html += `</ul>`;
                    lobbyReportBox.innerHTML = html;
                }
            } catch (e) {
                lobbyReportBox.innerHTML = `<span class="text-red-400">Fallo de red: ${escapeHtml(e.message)}</span>`;
            }
            
            btnLobbyPremarket.innerHTML = '✅ Reporte Generado';
            setTimeout(() => {
                btnLobbyPremarket.innerHTML = '<span class="animate-pulse">🧠</span> Generar Consenso del Cerebro';
                btnLobbyPremarket.disabled = false;
            }, 5000);
        });
    }

    if (btnEnterTrench) {
        btnEnterTrench.addEventListener("click", () => {
            // Sincronizar el selector del lobby con el selector principal
            const chosenSymbol = lobbySymbolSelect.value;
            if (mainSymbolSelect) {
                mainSymbolSelect.value = chosenSymbol;
                // Disparar evento de cambio para que la app reaccione
                mainSymbolSelect.dispatchEvent(new Event('change'));
            }
            
            // Inyectar el consenso pre-market en la Caja de Mando para el Orquestador
            const macroInput = document.getElementById('macroContext');
            if (macroInput && window.premarketData && window.premarketData.activos) {
                const assetData = window.premarketData.activos.find(a => a.simbolo === chosenSymbol || chosenSymbol.includes(a.simbolo));
                if (assetData) {
                    macroInput.value = `Sesgo Pre-Market [${assetData.consenso_direccional}]: ${assetData.razonamiento}`;
                } else {
                    macroInput.value = `Sesgo Pre-Market General: ${window.premarketData.resumen_general}`;
                }
            }
            
            // Ocultar lobby, mostrar trading
            lobbyView.classList.add("hidden");
            tradingView.classList.remove("hidden");
            
            // Forzar resize del gráfico para que ocupe el espacio correcto que estaba hidden
            window.dispatchEvent(new Event('resize'));
            
            // Opcional: auto-iniciar agente
            // document.getElementById('agentToggle').click();
            logToTerminal(`🚀 Sistema desplegado en la Trinchera. Mercado seleccionado: ${chosenSymbol}`, "system");
        });
    }
});

// ==============================================================================
// // TODO(FASE5):
// - Slippage dinámico y spread en Paper Trading: simular peor ejecución en órdenes de mercado (0.05% de slippage mínimo + spread del orderbook).
// - Soporte multi-posición: transicionar portfolio.position a portfolio.positions (array indexado por symbol) con límites de exposición por activo y global.
// - Event ledger inmutable: migrar historial_trades.csv a SQLite con checksum sha256 encadenado por fila para auditoría de live trading.
// ==============================================================================

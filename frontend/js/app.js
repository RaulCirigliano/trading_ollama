const API_BASE_URL = (window.location.protocol && window.location.hostname)
    ? `${window.location.protocol}//${window.location.hostname}:18767`
    : 'http://127.0.0.1:18767';
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

// Diccionario de Metadatos y Clasificación de Activos
const ASSET_METADATA = {
    // 🛢️ Materias Primas y Energía
    'CL=F': { name: 'Petróleo WTI', ticker: 'CL=F', icon: '🛢️', category: 'Materias Primas y Energía' },
    'GC=F': { name: 'Oro', ticker: 'GC=F', icon: '🥇', category: 'Materias Primas y Energía' },
    'SI=F': { name: 'Plata', ticker: 'SI=F', icon: '🥈', category: 'Materias Primas y Energía' },
    'NG=F': { name: 'Gas Natural', ticker: 'NG=F', icon: '🔥', category: 'Materias Primas y Energía' },

    // ⚡ Criptomonedas
    'BTC/USDT': { name: 'Bitcoin', ticker: 'BTC/USDT', icon: '⚡', category: 'Criptomonedas' },
    'BTC-USD': { name: 'Bitcoin', ticker: 'BTC-USD', icon: '⚡', category: 'Criptomonedas' },
    'ETH/USDT': { name: 'Ethereum', ticker: 'ETH/USDT', icon: '⚡', category: 'Criptomonedas' },
    'ETH-USD': { name: 'Ethereum', ticker: 'ETH-USD', icon: '⚡', category: 'Criptomonedas' },
    'SOL/USDT': { name: 'Solana', ticker: 'SOL/USDT', icon: '⚡', category: 'Criptomonedas' },
    'SOL-USD': { name: 'Solana', ticker: 'SOL-USD', icon: '⚡', category: 'Criptomonedas' },

    // 🏛️ Bonos e Índices Macro
    'TLT': { name: 'Bonos Tesoro EE.UU. 20+ Años', ticker: 'TLT', icon: '🏛️', category: 'Bonos e Índices Macro' },
    '^GSPC': { name: 'S&P 500 (Índice)', ticker: '^GSPC', icon: '📈', category: 'Bonos e Índices Macro' },
    'SPY': { name: 'S&P 500 (ETF)', ticker: 'SPY', icon: '📊', category: 'Bonos e Índices Macro' },
    'QQQ': { name: 'Nasdaq 100', ticker: 'QQQ', icon: '💻', category: 'Bonos e Índices Macro' },

    // 🏢 Acciones / Empresas Globales
    'BABA': { name: 'Alibaba Group', ticker: 'BABA', icon: '🏢', category: 'Empresas Globales' },
    'NVDA': { name: 'Nvidia Corp.', ticker: 'NVDA', icon: '🤖', category: 'Empresas Globales' },
    'AAPL': { name: 'Apple Inc.', ticker: 'AAPL', icon: '🍎', category: 'Empresas Globales' },
    'TSLA': { name: 'Tesla Inc.', ticker: 'TSLA', icon: '🚗', category: 'Empresas Globales' },
    'MSFT': { name: 'Microsoft Corp.', ticker: 'MSFT', icon: '🪟', category: 'Empresas Globales' },

    // 🇦🇷 Mercado Argentino (Acciones / CEDEARs)
    'GGAL.BA': { name: 'Grupo Fin. Galicia', ticker: 'GGAL', icon: '🇦🇷', category: 'Mercado Argentino' },
    'YPFD.BA': { name: 'YPF / Vaca Muerta', ticker: 'YPFD', icon: '🇦🇷', category: 'Mercado Argentino' },
    'PAMP.BA': { name: 'Pampa Energía', ticker: 'PAMP', icon: '🇦🇷', category: 'Mercado Argentino' },
    'BMA.BA': { name: 'Banco Macro', ticker: 'BMA', icon: '🇦🇷', category: 'Mercado Argentino' },
    'ALUA.BA': { name: 'Aluar Aluminio', ticker: 'ALUA', icon: '🇦🇷', category: 'Mercado Argentino' },
    'TXAR.BA': { name: 'Ternium Argentina', ticker: 'TXAR', icon: '🇦🇷', category: 'Mercado Argentino' },

    // 🌐 ETFs Temáticos y Emergentes
    'MCHI': { name: 'ETF Mercado Chino', ticker: 'MCHI', icon: '🇨🇳', category: 'China y Emergentes' },
    'KWEB': { name: 'ETF Internet China', ticker: 'KWEB', icon: '🇨🇳', category: 'China y Emergentes' },
    'BOTZ': { name: 'ETF Robótica & AI', ticker: 'BOTZ', icon: '🤖', category: 'Inteligencia Artificial' }
};

function getAssetMeta(symbol) {
    if (!symbol) return null;
    const clean = String(symbol).trim();
    if (ASSET_METADATA[clean]) return ASSET_METADATA[clean];
    const slashSym = clean.replace('-', '/');
    if (ASSET_METADATA[slashSym]) return ASSET_METADATA[slashSym];
    const dashSym = clean.replace('/', '-');
    if (ASSET_METADATA[dashSym]) return ASSET_METADATA[dashSym];
    // Coincidencia parcial por ticker base (ej: GGAL)
    for (const k in ASSET_METADATA) {
        if (ASSET_METADATA[k].ticker === clean || clean.startsWith(ASSET_METADATA[k].ticker)) {
            return ASSET_METADATA[k];
        }
    }
    return null;
}

function formatAssetLabel(symbol) {
    if (!symbol) return '';
    const meta = getAssetMeta(symbol);
    if (meta) {
        return `${meta.icon} ${meta.name} (${meta.ticker})`;
    }
    return String(symbol);
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
    // Limitar el buffer del DOM para evitar saturación de RAM en sesiones largas
    while (terminal.children.length > 300) {
        terminal.removeChild(terminal.firstChild);
    }
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
let currentPriceSymbol = currentSymbol;
let currentPriceTs = 0;

// Variables de Simulación (Paper Trading) persistentes en el navegador
let portfolio = JSON.parse(localStorage.getItem('ai_portfolio_v5')) || {
    VAULT: 500.00, // Capital total en la Bóveda del Broker (USD)
    balances: {
        USDT: 100.00, // Cripto con $100 iniciales para operar
        USD: 0.00,  // Wall Street vacía por defecto
        ARS: 0.00   // Local vacía por defecto
    },
    deposits: {
        USDT: 100.00,
        USD: 0.00,
        ARS: 0.00
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

// Resolutor canónico multi-alias para auto-ruteo infalible entre el Monitor y los Tickers del Dashboard
function resolveSymbol(candAsset) {
    if (!candAsset) return null;
    const raw = String(candAsset).trim();
    const upper = raw.toUpperCase();
    const clean = upper.replace(/[^A-Z0-9=^.]/g, '');

    const ALIASES = {
        // Cripto (Normaliza BTCUSD, BTCUSDT, BTC, etc. hacia BTC/USDT)
        'BTCUSD': 'BTC/USDT',
        'BTCUSDT': 'BTC/USDT',
        'BTC': 'BTC/USDT',
        'BITCOIN': 'BTC/USDT',
        'ETHUSD': 'ETH/USDT',
        'ETHUSDT': 'ETH/USDT',
        'ETH': 'ETH/USDT',
        'ETHEREUM': 'ETH/USDT',
        'SOLUSD': 'SOL/USDT',
        'SOLUSDT': 'SOL/USDT',
        'SOL': 'SOL/USDT',
        'SOLANA': 'SOL/USDT',

        // Commodities y Materias Primas
        'GOLD': 'GC=F',
        'ORO': 'GC=F',
        'XAUUSD': 'GC=F',
        'XAU': 'GC=F',
        'GC': 'GC=F',
        'OIL': 'CL=F',
        'PETROLEO': 'CL=F',
        'WTI': 'CL=F',
        'CRUDE': 'CL=F',
        'CL': 'CL=F',
        'SILVER': 'SI=F',
        'PLATA': 'SI=F',
        'XAGUSD': 'SI=F',
        'SI': 'SI=F',
        'GAS': 'NG=F',
        'NATGAS': 'NG=F',
        'NG': 'NG=F',

        // Índices y Bonos Soberanos
        'SP500': 'SPY',
        'SPX': '^GSPC',
        'S&P500': 'SPY',
        'S&P 500': 'SPY',
        'GSPC': '^GSPC',
        '^GSPC': '^GSPC',
        'SPY': 'SPY',
        'NASDAQ': 'QQQ',
        'NAS100': 'QQQ',
        'NDX': 'QQQ',
        'QQQ': 'QQQ',
        'TLT': 'TLT',
        'BONOS': 'TLT',

        // Acciones y Tech
        'ALIBABA': 'BABA',
        'BABA': 'BABA',
        'NVIDIA': 'NVDA',
        'NVDA': 'NVDA',
        'APPLE': 'AAPL',
        'AAPL': 'AAPL',
        'TESLA': 'TSLA',
        'TSLA': 'TSLA',
        'MICROSOFT': 'MSFT',
        'MSFT': 'MSFT',

        // Mercado Argentino
        'GGAL': 'GGAL.BA',
        'GALICIA': 'GGAL.BA',
        'YPF': 'YPFD.BA',
        'YPFD': 'YPFD.BA',
        'PAMP': 'PAMP.BA',
        'PAMPA': 'PAMP.BA',
        'BMA': 'BMA.BA',
        'MACRO': 'BMA.BA',
        'ALUA': 'ALUA.BA',
        'ALUAR': 'ALUA.BA',
        'TXAR': 'TXAR.BA',
        'TERNIUM': 'TXAR.BA'
    };

    if (ALIASES[upper]) return ALIASES[upper];
    if (ALIASES[clean]) return ALIASES[clean];

    // Búsqueda heurística directa en las opciones de symbolSelect
    const selectEl = document.getElementById('symbolSelect');
    if (selectEl) {
        for (const opt of selectEl.options) {
            const optVal = opt.value;
            const optUpper = optVal.toUpperCase();
            const optClean = optVal.replace(/[^A-Z0-9=^.]/g, '').toUpperCase();
            const optBase = optVal.split('/')[0].toUpperCase();

            if (optVal === raw || optUpper === upper) return optVal;
            if (optClean === clean) return optVal;
            if (optBase === clean || optBase === upper) return optVal;
            if (clean.startsWith(optBase) && (clean.endsWith('USD') || clean.endsWith('USDT'))) return optVal;
            if (upper.includes(optBase) && optBase.length >= 3) return optVal;
        }
    }
    return null;
}

// Detección de sesiones bursátiles y horarios de mercado activos
function isAssetMarketOpen(symbol) {
    if (!symbol) return true;
    // Criptomonedas: abiertas 24/7/365
    if (symbol.includes('/')) return true;

    const now = new Date();
    const utcDay = now.getUTCDay(); // 0 = Domingo, 6 = Sábado
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

    // Fin de semana: Wall Street y Merval completamente inactivos
    if (utcDay === 0 || utcDay === 6) {
        // Futuros de materias primas (GC=F, CL=F, etc.) abren domingo a las 22:00 UTC (18:00 EDT)
        if (symbol.includes('=F') && utcDay === 0 && utcMinutes >= 22 * 60) return true;
        return false;
    }

    // Mercado Local Argentino (.BA): 11:00 a 17:00 ARG (14:00 a 20:00 UTC)
    if (symbol.includes('.BA')) {
        return (utcMinutes >= 14 * 60 && utcMinutes < 20 * 60);
    }

    // Wall Street regular (SPY, QQQ, AAPL, TLT, etc.): 13:30 a 20:00 UTC (09:30 a 16:00 EDT)
    // Con ventana pre/after market ampliada hasta 21:00 UTC
    if (!symbol.includes('=F')) {
        return (utcMinutes >= 13 * 60 + 30 && utcMinutes < 20 * 60);
    }

    // Futuros de materias primas y energía (=F): 24h Lu-Vi con descanso técnico 21:00 - 22:00 UTC
    if (symbol.includes('=F')) {
        return !(utcMinutes >= 21 * 60 && utcMinutes < 22 * 60);
    }

    return true;
}

// Helpers de Única Fuente de Verdad para la Posición (Bloque 1)
function getOpenPosition() {
    if (portfolio.position && typeof portfolio.position.qty === 'number' && portfolio.position.qty > 0.0001) {
        // Migración a convención stopNetPct firmado neto (Bloque 1)
        if (portfolio.position.stopNetPct === undefined || portfolio.position.stopNetPct === null) {
            if (portfolio.position.beArmed) {
                portfolio.position.stopNetPct = Math.max(-Math.abs(portfolio.position.slEffPct ?? portfolio.position.sl ?? 1.0), +0.05);
            } else {
                portfolio.position.stopNetPct = -Math.abs(portfolio.position.slEffPct ?? portfolio.position.sl ?? 1.0);
            }
            delete portfolio.position.slEffPct;
        }
        return portfolio.position;
    }
    return null;
}

function hasOpenPosition() {
    return !!getOpenPosition();
}

// Matemática unificada de PnL y salida neta (R1)
function netPctAtPrice(pos, price, feeRate) {
    if (!pos || !Number.isFinite(price) || price <= 0) return 0;
    const effectiveFeeRate = (pos && typeof pos.feeRate === 'number') ? pos.feeRate : (feeRate !== undefined ? feeRate : getBrokerFeeRate());
    const costBasis = pos.costBasis || (pos.qty * pos.entryPrice);
    if (!costBasis || costBasis <= 0) return 0;
    const netExitValue = pos.qty * price * (1 - (effectiveFeeRate / 100));
    return ((netExitValue - costBasis) / costBasis) * 100;
}

// Tests puros de consola para verificación matemática de riesgo (R1 item 6)
window.testRiskMath = function() {
    const feeRate = 0.10;
    const tradeAmount = 100;
    const feeAmount = tradeAmount * (feeRate / 100);
    const capitalNeto = tradeAmount - feeAmount;
    const testPos = {
        qty: capitalNeto / 100, // 0.999
        entryPrice: 100,
        costBasis: tradeAmount, // 100
        feeRate: feeRate,
        tp: 1.5,
        sl: 1.0,
        stopNetPct: -1.0,
        beArmed: false,
        trailActive: false,
        trailPct: 0.5,
        peakPrice: 100
    };

    // Armar BE
    testPos.beArmed = true;
    testPos.stopNetPct = Math.max(testPos.stopNetPct, +0.05);

    // 1. Evaluar a 100.30 tras armar BE
    const netAt100_30 = netPctAtPrice(testPos, 100.30, feeRate);
    const stopsAt100_30 = netAt100_30 <= testPos.stopNetPct;

    // 2. Precio cae a 100.05
    const netAt100_05 = netPctAtPrice(testPos, 100.05, feeRate);
    const stopsAt100_05 = netAt100_05 <= testPos.stopNetPct;

    const pass = !stopsAt100_30 && stopsAt100_05;
    console.log(`[TEST R1] A 100.30: Neto=${netAt100_30.toFixed(4)}% vs Stop=${testPos.stopNetPct}%. ¿Dispara? ${stopsAt100_30} (Esperado: false)`);
    console.log(`[TEST R1] A 100.05: Neto=${netAt100_05.toFixed(4)}% vs Stop=${testPos.stopNetPct}%. ¿Dispara? ${stopsAt100_05} (Esperado: true)`);
    console.log(`[TEST R1] Resultado general: ${pass ? 'PASÓ ✅' : 'FALLÓ ❌'}`);
    return pass;
};

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

// --- MONITOR DE RIESGO INDEPENDIENTE (R2, R3) ---
window.positionAssetPrice = null;
window.positionAssetPriceTs = 0;
let riskTickInFlight = false;
let riskFeedFailures = 0;
let staleFeedStartTime = 0; // ms: inicio de periodo estancado con mercado abierto
let lastMarketClosedLoggedSymbol = ''; // Símbolo para registrar una sola vez aviso de mercado cerrado
let lastRiskStaleLogTs = 0; // ms
let lastRiskFailAlarmTs = 0; // ms
let lastRiskCatchLogTs = 0; // ms
let lastTrailingLogTs = 0; // s
let lastPortfolioSaveTs = 0; // ms

async function riskTick() {
    const pos = getOpenPosition();
    if (!pos) {
        riskFeedFailures = 0;
        staleFeedStartTime = 0;
        return;
    }
    if (isExecutingTrade) return;
    if (riskTickInFlight) return;
    riskTickInFlight = true;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
        const res = await fetch(`${API_BASE_URL}/api/market/price?symbol=${encodeURIComponent(pos.symbol)}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
            riskFeedFailures++;
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        // 3. riskTick: tras el await del fetch y antes de evaluar, si getOpenPosition() !== pos, abortar el tick
        const currentPos = getOpenPosition();
        if (!currentPos || currentPos !== pos) {
            return;
        }

        const price = Number(data.price);
        if (!Number.isFinite(price) || price <= 0) {
            riskFeedFailures++;
            throw new Error(`Precio inválido recibido: ${data?.price}`);
        }

        // 1. Detección de mercado abierto y umbral por activo (20s cripto, 150s Yahoo)
        const thresholdSec = (typeof data.stale_threshold_s === 'number') ? data.stale_threshold_s : (pos.symbol.includes('/') ? 20 : 150);
        const isMarketOpen = (data.market_open !== undefined) ? Boolean(data.market_open) : (data.quote_age_s !== undefined ? data.quote_age_s < 900 : true);

        // 2. Si market_open es false, loguear UNA vez y no contarlo como falla
        if (!isMarketOpen) {
            if (lastMarketClosedLoggedSymbol !== pos.symbol) {
                logToTerminal(`⏸️ [MERCADO CERRADO] Mercado cerrado para ${pos.symbol}. SL en pausa hasta reapertura.`, 'info');
                lastMarketClosedLoggedSymbol = pos.symbol;
            }
            riskFeedFailures = 0;
            staleFeedStartTime = 0;
            return;
        }

        // Si el mercado está abierto, resetear aviso de mercado cerrado
        lastMarketClosedLoggedSymbol = '';

        // 3. Comprobación de frescura usando quote_age_s
        const nowMs = Date.now();
        const quoteAgeSec = (typeof data.quote_age_s === 'number') ? data.quote_age_s : Math.max(0, Math.floor((nowMs - (data.ts || nowMs)) / 1000));
        const isStale = quoteAgeSec > thresholdSec;

        if (isStale) {
            // Contar tiempo estancado con mercado abierto y emitir alarma crítica tras 5 minutos (300s)
            if (!staleFeedStartTime) staleFeedStartTime = nowMs;
            const staleElapsedSec = Math.floor((nowMs - staleFeedStartTime) / 1000);

            if (nowMs - lastRiskStaleLogTs > 60000) {
                if (data.feed_delayed) {
                    logToTerminal(`⚠️ [FEED CON DELAY] Feed con delay para ${pos.symbol} (latencia ${quoteAgeSec}s > umbral ${thresholdSec}s). Monitoreo pausado.`, 'warn');
                } else {
                    logToTerminal(`⚠️ [RIESGO] SL SIN PRECIO FRESCO (${pos.symbol}, latencia ${quoteAgeSec}s > umbral ${thresholdSec}s). Monitoreo pausado para evitar falsos cierres.`, 'warn');
                }
                lastRiskStaleLogTs = nowMs;
            }

            if (staleElapsedSec >= 300 && (nowMs - lastRiskFailAlarmTs > 30000)) {
                logToTerminal(`🚨 [ALARMA CRÍTICA] Feed estancado durante ${(staleElapsedSec / 60).toFixed(1)} min con mercado abierto para ${pos.symbol}. Considera cerrar manualmente la posición.`, 'error');
                lastRiskFailAlarmTs = nowMs;
            }
            return; // NO evaluar con entryPrice ni publicar precio si no está fresco
        }

        // 4. Publicar window.positionAssetPrice SOLO si el dato es fresco
        riskFeedFailures = 0;
        staleFeedStartTime = 0;
        window.positionAssetPrice = price;
        window.positionAssetPriceTs = nowMs - (quoteAgeSec * 1000);

        const evalPrice = window.positionAssetPrice;
        const feeRate = (pos && typeof pos.feeRate === 'number') ? pos.feeRate : getBrokerFeeRate();
        const pnlNetPct = netPctAtPrice(pos, evalPrice, feeRate);

        if (typeof pos.peakPrice !== 'number' || pos.peakPrice <= 0) pos.peakPrice = pos.entryPrice;
        if (typeof pos.stopNetPct !== 'number') pos.stopNetPct = -(pos.slEffPct ?? pos.sl ?? 1.0);
        delete pos.slEffPct;
        if (typeof pos.beArmed !== 'boolean') pos.beArmed = false;
        if (typeof pos.trailActive !== 'boolean') pos.trailActive = false;
        if (typeof pos.trailPct !== 'number') pos.trailPct = 0.5;

        // Trailing peak
        if (evalPrice > pos.peakPrice) pos.peakPrice = evalPrice;

        // 1. Breakeven
        const BE_ARM_NET = (feeRate * 2.0) + 0.1;
        if (pnlNetPct >= BE_ARM_NET && !pos.beArmed) {
            pos.beArmed = true;
            pos.stopNetPct = Math.max(pos.stopNetPct, +0.05);
            logToTerminal(`🛡️ [RIESGO] Breakeven armado en ${pos.symbol} (+${pnlNetPct.toFixed(2)}% neto >= ${BE_ARM_NET.toFixed(2)}%). Stop Loss movido a +0.05% neto.`, 'action');
        }

        // 2. Trailing Stop
        const takeProfitLimit = pos.tp !== undefined ? pos.tp : 1.5;
        if (pnlNetPct >= (takeProfitLimit * 0.6)) {
            pos.trailActive = true;
            const trailPrice = pos.peakPrice * (1 - (pos.trailPct / 100));
            const trailNet = netPctAtPrice(pos, trailPrice, feeRate);
            if (trailNet > pos.stopNetPct) {
                pos.stopNetPct = trailNet;
                const nowSec = Math.floor(Date.now() / 1000);
                if (nowSec - lastTrailingLogTs > 10) {
                    logToTerminal(`📈 [RIESGO] Trailing Stop actualizado en ${pos.symbol} (Pico: $${pos.peakPrice.toFixed(2)} | Stop Neto: ${pos.stopNetPct >= 0 ? '+' : ''}${pos.stopNetPct.toFixed(2)}%).`, 'info');
                    lastTrailingLogTs = nowSec;
                }
            }
        }

        // Persistencia throttled
        if (nowMs - lastPortfolioSaveTs > 10000) {
            localStorage.setItem('ai_portfolio_v5', JSON.stringify(portfolio));
            lastPortfolioSaveTs = nowMs;
        }

        // 3. Evaluar Stop DESPUÉS de actualizar BE y Trailing
        if (pnlNetPct <= pos.stopNetPct) {
            let exitReason = 'Stop Loss';
            if (pos.stopNetPct < 0) {
                exitReason = 'Stop Loss';
            } else if (pos.beArmed && pos.stopNetPct < 0.5 && !pos.trailActive) {
                exitReason = 'Breakeven';
            } else {
                exitReason = 'Trailing';
            }
            logToTerminal(`⚠️ AGENTE DE RIESGO: ${exitReason} disparado en ${pos.symbol} (${pnlNetPct.toFixed(2)}% neto vs umbral ${pos.stopNetPct >= 0 ? '+' : ''}${pos.stopNetPct.toFixed(2)}% neto). Vendiendo para proteger capital.`, 'error');
            executeTrade('VENDER', pos.symbol, pos.baseCoin, evalPrice, exitReason);
        } else if (pnlNetPct >= takeProfitLimit) {
            logToTerminal(`🎯 AGENTE DE RIESGO: Take Profit alcanzado en ${pos.symbol} (+${pnlNetPct.toFixed(2)}% neto vs +${takeProfitLimit}% objetivo). Asegurando ganancias.`, 'action');
            executeTrade('VENDER', pos.symbol, pos.baseCoin, evalPrice, 'Take Profit');
        }

    } catch (err) {
        clearTimeout(timeoutId);
        riskFeedFailures++;
        const nowMs = Date.now();
        if (riskFeedFailures >= 5 && (nowMs - lastRiskFailAlarmTs > 30000)) {
            logToTerminal(`🚨 [ALARMA CRÍTICA] Feed de riesgo falló ${riskFeedFailures} veces consecutivas para ${pos.symbol}. Considera cerrar manualmente la posición.`, 'error');
            lastRiskFailAlarmTs = nowMs;
        } else if (nowMs - lastRiskCatchLogTs > 15000) {
            logToTerminal(`⚠️ [RIESGO] Error consultando precio de posición ${pos.symbol}: ${err.message}`, 'warn');
            lastRiskCatchLogTs = nowMs;
        }
    } finally {
        riskTickInFlight = false;
    }
}

// Iniciar monitor de riesgo independiente cada 2000 ms (R2)
setInterval(riskTick, 2000);

// Notificación de inicio al cargar la página (R2 item 8)
if (hasOpenPosition()) {
    const pInit = getOpenPosition();
    logToTerminal(`🛡️ Posición abierta en ${pInit.symbol}: monitor de riesgo ACTIVO.`, 'action');
}

// --- CIRCUIT BREAKER MULTI-LIBRO PERSISTIDO (Bloque 3 - R4) ---
function localDayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getRiskState() {
    const today = localDayKey();
    let state = null;
    try {
        state = JSON.parse(localStorage.getItem('ai_risk_state_v2'));
    } catch (_) {}

    // Migración retrocompatible desde v1
    if (!state) {
        try {
            const v1 = JSON.parse(localStorage.getItem('ai_risk_state_v1'));
            if (v1) {
                state = {
                    books: {},
                    haltedUntil: v1.haltedUntil || null,
                    haltReason: v1.haltedUntil ? 'Migrado de V1' : null
                };
            }
        } catch (_) {}
    }

    if (!state) {
        state = {
            books: {},
            haltedUntil: null,
            haltReason: null
        };
    }
    if (!state.books) state.books = {};

    // Iniciar libros para las monedas soportadas respetando día local
    ['USDT', 'USD', 'ARS'].forEach(currency => {
        const book = state.books[currency];
        if (!book || book.dayKey !== today) {
            let equity = (portfolio.balances && portfolio.balances[currency]) || 0;
            const openPos = getOpenPosition();
            if (openPos && (openPos.currency === currency || getCurrency(openPos.symbol) === currency)) {
                equity += (openPos.costBasis || (openPos.qty * openPos.entryPrice));
            }
            
            const isPlaceholder = (equity <= 0);
            const startEquity = isPlaceholder ? (currency === 'ARS' ? 0 : 100) : equity;

            state.books[currency] = {
                dayKey: today,
                startEquity: startEquity,
                realizedPnl: 0,
                consecLosses: 0,
                placeholder: isPlaceholder
            };
        }
    });

    return state;
}

function saveRiskState(state) {
    try {
        localStorage.setItem('ai_risk_state_v2', JSON.stringify(state));
    } catch (_) {}
}

function isCircuitBreakerActive() {
    const state = getRiskState();
    return !!(state.haltedUntil && Date.now() < state.haltedUntil);
}

function recordTradeInCircuitBreaker(pnlNeto, currency) {
    const cur = currency || getCurrency(currentSymbol);
    const state = getRiskState();
    const today = localDayKey();
    
    if (!state.books[cur] || state.books[cur].dayKey !== today) {
        let equity = (portfolio.balances && portfolio.balances[cur]) || 0;
        const isPlaceholder = (equity <= 0);
        state.books[cur] = {
            dayKey: today,
            startEquity: isPlaceholder ? (cur === 'ARS' ? 0 : 100) : equity,
            realizedPnl: 0,
            consecLosses: 0,
            placeholder: isPlaceholder
        };
    }

    const book = state.books[cur];

    // Si el libro tiene placeholder:true (primer trade con balance originalmente 0), recalcular startEquity con el equity real previo al trade
    if (book.placeholder) {
        const currentBal = (portfolio.balances && portfolio.balances[cur]) || 0;
        const realPriorEquity = currentBal - pnlNeto;
        if (realPriorEquity > 0) {
            book.startEquity = realPriorEquity;
            book.placeholder = false;
        } else if (currentBal > 0) {
            book.startEquity = currentBal;
            book.placeholder = false;
        }
    }

    book.realizedPnl = (book.realizedPnl || 0) + pnlNeto;
    if (pnlNeto < 0) {
        book.consecLosses = (book.consecLosses || 0) + 1;
    } else if (pnlNeto > 0) {
        book.consecLosses = 0;
    }

    // 1. Regla 3 pérdidas consecutivas en el libro específico
    if (book.consecLosses >= 3) {
        state.haltedUntil = Date.now() + 24 * 60 * 60 * 1000;
        state.haltReason = `3 pérdidas consecutivas en libro ${cur}`;
        logToTerminal(`🛑 [CIRCUIT BREAKER] 3 pérdidas consecutivas detectadas en libro ${cur}. Trading pausado 24h para proteger capital.`, 'error');
        if (typeof stopAgent === 'function') stopAgent('circuit_breaker');
    }

    // 2. Regla Drawdown diario <= -3% en el libro específico
    const startEq = book.startEquity || (cur === 'ARS' ? 0 : 100);
    const drawdownPct = startEq > 0 ? ((book.realizedPnl / startEq) * 100) : 0;
    if (startEq > 0 && drawdownPct <= -3.0) {
        state.haltedUntil = Date.now() + 24 * 60 * 60 * 1000;
        state.haltReason = `Drawdown diario <= -3% en libro ${cur} (${drawdownPct.toFixed(2)}%)`;
        logToTerminal(`🛑 [CIRCUIT BREAKER] Drawdown diario del 3% alcanzado en libro ${cur} (${drawdownPct.toFixed(2)}% PnL: $${book.realizedPnl.toFixed(2)} vs equity inicial $${startEq.toFixed(2)}). Trading pausado 24h.`, 'error');
        if (typeof stopAgent === 'function') stopAgent('circuit_breaker');
    }

    saveRiskState(state);
}

window.resetCircuitBreaker = function() {
    if (!confirm("¿Deseas reiniciar manualmente el Circuit Breaker de todos los libros contables?")) return;
    const state = getRiskState();
    state.haltedUntil = null;
    state.haltReason = null;
    ['USDT', 'USD', 'ARS'].forEach(cur => {
        if (state.books[cur]) {
            state.books[cur].consecLosses = 0;
            state.books[cur].realizedPnl = 0;
        }
    });
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
    if (confirm("¿Deseas reiniciar la cuenta de Paper Trading? Se restablecerán $100 en la billetera activa y se limpiarán los bloqueos.")) {
        localStorage.removeItem('ai_portfolio_v5');
        localStorage.removeItem('ai_risk_state_v2');
        localStorage.removeItem('ai_cooldown_v1');
        localStorage.removeItem('ai_stop_after_close');
        location.reload();
    }
};

// Función para establecer el saldo exacto deseado sin perder el historial
window.fijarCapital = function(monto = 100) {
    const cur = getCurrency(currentSymbol);
    portfolio.balances[cur] = monto;
    portfolio.deposits[cur] = monto;
    portfolio.position = null;
    portfolio.ASSET = 0;
    portfolio.entryPrice = 0;
    localStorage.setItem('ai_portfolio_v5', JSON.stringify(portfolio));
    const rState = getRiskState();
    if (rState.books && rState.books[cur]) {
        rState.books[cur].startEquity = monto;
        rState.books[cur].realizedPnl = 0;
        rState.books[cur].consecLosses = 0;
        rState.books[cur].placeholder = false;
        saveRiskState(rState);
    }
    updateCapitalDisplay();
    logToTerminal(`🔄 [CAPITAL REAJUSTADO] Saldo de la billetera ${cur} fijado en $${monto.toFixed(2)}.`, 'success');
};

function updateCapitalDisplay() {
    let currency = getCurrency(currentSymbol);
    
    // Calcular valor de posición activa sin mezclar activos (Bloque 1)
    let posValue = 0;
    const pos = getOpenPosition();
    if (pos) {
        const isSameSymbol = (pos.symbol === currentSymbol && currentPriceSymbol === currentSymbol && currentPrice > 0);
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
    const statusBadge = document.getElementById('posGracefulStatus');
    if (activeBody) {
        const currentPos = getOpenPosition();
        if (!currentPos) {
            isStopAfterCloseArmed = false;
            localStorage.removeItem('ai_stop_after_close');
            if (statusBadge) statusBadge.classList.add('hidden');
            if (!document.getElementById('emptyPositionsRow')) {
                activeBody.innerHTML = `<tr id="emptyPositionsRow"><td colspan="6" class="px-4 py-4 text-center text-gray-600 italic">No tienes posiciones activas (100% liquidez en ${currency}).</td></tr>`;
            }
        } else {
            if (statusBadge) {
                if (isStopAfterCloseArmed) {
                    statusBadge.classList.remove('hidden');
                } else {
                    statusBadge.classList.add('hidden');
                }
            }
            const isSameSymbol = (currentPos.symbol === currentSymbol && currentPriceSymbol === currentSymbol && currentPrice > 0);
            const activePrice = isSameSymbol ? currentPrice : (window.positionAssetPrice || currentPos.entryPrice);
            const pnlNoRealizado = (activePrice - currentPos.entryPrice) * currentPos.qty;
            const pnlPct = currentPos.entryPrice > 0 ? ((activePrice - currentPos.entryPrice) / currentPos.entryPrice) * 100 : 0;
            const pnlSign = pnlNoRealizado >= 0 ? '+' : '';
            const pnlColor = pnlNoRealizado >= 0 ? 'text-green-400' : 'text-red-400';
            
            let activeRow = document.getElementById('activePositionRow');
            if (!activeRow) {
                activeBody.innerHTML = `
                    <tr id="activePositionRow" class="border-b border-gray-700/50 bg-blue-900/10">
                        <td class="px-2.5 py-2 font-bold text-white" id="apCoin"></td>
                        <td class="px-2.5 py-2 font-mono" id="apAmount"></td>
                        <td class="px-2.5 py-2 font-mono" id="apEntry"></td>
                        <td class="px-2.5 py-2 font-mono" id="apCurrent"></td>
                        <td class="px-2.5 py-2 font-bold" id="apPnl"></td>
                        <td class="px-2.5 py-2 text-right whitespace-nowrap">
                            <button id="btnStopAfterClose" onclick="window.toggleStopAfterClose()" class="text-xs px-2.5 py-1 rounded font-semibold transition mr-2"></button>
                            <button onclick="window.forceClosePosition(event)" class="text-xs bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded font-bold shadow-lg transition duration-200 ease-in-out transform hover:scale-105 border border-red-500 cursor-pointer" title="Cerrar posición inmediatamente al precio actual">✖ CERRAR</button>
                        </td>
                    </tr>
                `;
            }

            const btnSac = document.getElementById('btnStopAfterClose');
            if (btnSac) {
                if (isStopAfterCloseArmed) {
                    btnSac.className = 'text-xs bg-yellow-500 hover:bg-yellow-400 text-black px-2 py-1 rounded font-bold transition mr-2 border border-yellow-300 shadow-[0_0_10px_rgba(234,179,8,0.5)] animate-pulse';
                    btnSac.innerHTML = '⏹️ Parada Programada ACTIVA';
                    btnSac.title = 'El agente se detendrá solo al cerrar este trade. Clic para cancelar.';
                } else {
                    btnSac.className = 'text-xs bg-gray-700 hover:bg-gray-600 text-yellow-400 px-2 py-1 rounded font-semibold transition mr-2 border border-gray-600 hover:border-yellow-500';
                    btnSac.innerHTML = '⏹️ Detener al cerrar';
                    btnSac.title = 'Deja que el trade madure hasta TP/SL y detén el agente automáticamente al vender.';
                }
            }

            const meta = getAssetMeta(currentPos.symbol);
            const coinName = meta ? `${meta.icon} ${meta.name}` : currentPos.baseCoin;
            const symbolIndicator = isSameSymbol 
                ? `<span class="font-bold text-white">${escapeHtml(coinName)}</span> <span class="text-[10px] text-gray-400">(${escapeHtml(currentPos.symbol)})</span>`
                : `<span class="font-bold text-white">${escapeHtml(coinName)}</span> <span class="text-[10px] text-yellow-400 bg-yellow-950/60 px-1.5 py-0.5 rounded border border-yellow-700/50">Segundo plano: ${escapeHtml(currentPos.symbol)}</span>`;
            document.getElementById('apCoin').innerHTML = symbolIndicator;
            document.getElementById('apAmount').innerText = currentPos.qty.toFixed(6);
            document.getElementById('apEntry').innerText = `$${currentPos.entryPrice.toLocaleString()}`;
            document.getElementById('apCurrent').innerText = `$${activePrice.toLocaleString()}`;
            
            const pnlCell = document.getElementById('apPnl');
            pnlCell.className = `px-2.5 py-2 font-bold ${pnlColor}`;
            pnlCell.innerText = `${pnlSign}$${Math.abs(pnlNoRealizado).toFixed(2)} (${pnlSign}${pnlPct.toFixed(2)}%)`;
        }
    }
}

symbolSelect.addEventListener('change', () => {
    currentSymbol = symbolSelect.value;
    logToTerminal(`Cambiando activo a ${currentSymbol}...`, 'warn');
    
    // Invalidad precio en pantalla y estado de activo para prevenir órdenes con precios desfasados
    currentPrice = 0;
    currentPriceSymbol = '';
    currentPriceTs = 0;
    const currentPriceElement = document.getElementById('currentPrice');
    if (currentPriceElement) currentPriceElement.innerText = '$--.---';
    updateChartHeaderTitles();

    // R2 item 5: Limpiar precio en segundo plano al cambiar de símbolo
    window.positionAssetPrice = null;
    window.positionAssetPriceTs = 0;

    // Si hay una posición abierta en otro activo, alertar y ejecutar riskTick de inmediato
    const pos = getOpenPosition();
    if (pos && pos.symbol !== currentSymbol) {
        logToTerminal(`ℹ️ Posición activa en ${pos.symbol}. El Agente de Riesgo continúa monitoreando tu posición de fondo mientras visualizas ${currentSymbol}.`, 'info');
        riskTick();
    }
    
    // Auto-ajustar sugerencia de broker fee según activo (si no está en modo personalizado)
    const feeSelect = document.getElementById('brokerFeeSelect');
    if (feeSelect && feeSelect.value !== 'custom') {
        if (currentSymbol.includes('.BA')) {
            feeSelect.value = "0.50";
        } else if (!currentSymbol.includes('/')) {
            // Acciones y ETFs EE.UU. / Wall Street (IBKR Tiered / Discount: 0.02% orden, 0.04% round-trip)
            feeSelect.value = "0.02";
        } else {
            // Cripto Spot estándar (Binance / Bybit: 0.10% orden, 0.20% round-trip)
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
    
    // Al primer fondeo con placeholder, recalcular startEquity; si no-placeholder, ajustar startEquity en el mismo monto
    const rState = getRiskState();
    if (rState.books && rState.books[destWallet]) {
        if (rState.books[destWallet].placeholder) {
            let actualEquity = portfolio.balances[destWallet] || 0;
            const openPos = getOpenPosition();
            if (openPos && (openPos.currency === destWallet || getCurrency(openPos.symbol) === destWallet)) {
                actualEquity += (openPos.costBasis || (openPos.qty * openPos.entryPrice));
            }
            rState.books[destWallet].startEquity = actualEquity;
            rState.books[destWallet].placeholder = false;
        } else {
            rState.books[destWallet].startEquity = (rState.books[destWallet].startEquity || 0) + amount;
        }
        saveRiskState(rState);
    }

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
    
    const sweptUSD = portfolio.balances.USD || 0;
    const sweptUSDT = portfolio.balances.USDT || 0;
    const sweptARS = portfolio.balances.ARS || 0;

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

    // Ajustar startEquity del Circuit Breaker al retirar capital
    const rState = getRiskState();
    if (rState.books) {
        if (rState.books.USD && !rState.books.USD.placeholder) {
            rState.books.USD.startEquity = Math.max(0, (rState.books.USD.startEquity || 0) - sweptUSD);
        }
        if (rState.books.USDT && !rState.books.USDT.placeholder) {
            rState.books.USDT.startEquity = Math.max(0, (rState.books.USDT.startEquity || 0) - sweptUSDT);
        }
        if (rState.books.ARS && !rState.books.ARS.placeholder) {
            rState.books.ARS.startEquity = Math.max(0, (rState.books.ARS.startEquity || 0) - sweptARS);
        }
        saveRiskState(rState);
    }
    
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
            currentPriceSymbol = reqSymbol;
            currentPriceTs = Date.now();
            currentPriceElement.innerText = `$${currentPrice.toLocaleString()}`;
            updateCapitalDisplay();
            updateChartHeaderTitles();
            logToTerminal('Gráfico actualizado con datos reales.', 'action');
        } else {
            logToTerminal('Error de datos: ' + (data?.error || 'Sin datos'), 'error');
        }
    } catch (error) {
        logToTerminal(`Fallo al conectar con FastAPI: ${error.message}`, 'error');
    }
}

function updateChartHeaderTitles() {
    const titleSym = document.getElementById('chartTitleSymbol');
    if (titleSym) {
        const meta = getAssetMeta(currentSymbol);
        if (meta) {
            titleSym.innerHTML = `<span class="mr-1">${meta.icon}</span><span class="text-white">${escapeHtml(meta.name)}</span> <span class="text-xs text-blue-400 font-mono font-normal">(${escapeHtml(currentSymbol)})</span>`;
        } else {
            titleSym.innerText = currentSymbol;
        }
    }
    const titleTf = document.getElementById('chartTitleTf');
    if (titleTf) {
        const tfVal = document.getElementById('timeframeSelect')?.value || '1m';
        const tfLabels = { '1m': '1 Minuto', '5m': '5 Minutos', '15m': '15 Minutos' };
        titleTf.innerText = tfLabels[tfVal] || tfVal;
    }
}

// Cargar datos al iniciar
fetchMarketData();
updateChartHeaderTitles();

window.addEventListener('resize', () => {
    chart.applyOptions({ width: chartContainer.clientWidth });
});

// Ciclo de IA (Bloque 4: Ciclo de vida idempotente y gestión de señales)
let isAgentActive = false;
let copilotState = 'idle'; // 'idle' | 'awaiting'
let simulateInterval = null;
let cycleInFlight = false; // Mutex para evitar análisis concurrentes en vuelo
let cycleStartedAt = 0; // Timestamp de inicio para watchdog
let isExecutingTrade = false; // Mutex para evitar ejecuciones concurrentes de órdenes
let lastHandledCandle = { symbol: '', candleTs: 0 };
let copilotExpiryTimer = null;
let isStopAfterCloseArmed = localStorage.getItem('ai_stop_after_close') === 'true'; // Graceful Shutdown post-trade

function scheduleNext(delayMs) {
    if (simulateInterval) clearTimeout(simulateInterval);
    if (isAgentActive) {
        simulateInterval = setTimeout(ejecutarAnalisis, delayMs);
    }
}

function isSmartMode() {
    const navVal = document.getElementById('navAgentModeSelect')?.value;
    const execVal = document.getElementById('executionModeSelect')?.value;
    return navVal === 'smart' || execVal === 'smart';
}

function updateAgentButtonState() {
    if (copilotState === 'awaiting') {
        agentToggle.innerText = 'Esperando decisión…';
        agentToggle.disabled = true;
        agentToggle.className = 'bg-yellow-600 opacity-75 cursor-not-allowed px-4 py-2 rounded font-semibold transition';
        return;
    }
    agentToggle.disabled = false;
    if (isAgentActive) {
        agentToggle.innerText = 'Detener Agente (Kill Switch)';
        agentToggle.className = 'bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-semibold transition';
    } else {
        if (isSmartMode()) {
            agentToggle.innerText = 'Activar Modo Inteligente';
            agentToggle.className = 'bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded font-semibold transition shadow-[0_0_12px_rgba(168,85,247,0.4)]';
        } else {
            agentToggle.innerText = 'Activar Agente';
            agentToggle.className = 'bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-semibold transition';
        }
    }
}

function updateTransferButtons(isAuto) {
    const btnManual = document.getElementById('btnTransferManual');
    const btnAuto = document.getElementById('btnTransferAuto');
    if (!btnManual || !btnAuto) return;
    if (isAuto) {
        btnManual.className = 'px-2 py-0.5 rounded font-bold transition text-gray-400 hover:text-white cursor-pointer';
        btnAuto.className = 'px-2 py-0.5 rounded font-bold transition bg-purple-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.4)] cursor-pointer';
    } else {
        btnManual.className = 'px-2 py-0.5 rounded font-bold transition bg-blue-600 text-white shadow cursor-pointer';
        btnAuto.className = 'px-2 py-0.5 rounded font-bold transition text-gray-400 hover:text-white cursor-pointer';
    }
}

function syncAgentModes(source) {
    const navEl = document.getElementById('navAgentModeSelect');
    const execEl = document.getElementById('executionModeSelect');
    const badgeEl = document.getElementById('smartRoutingBadge');
    
    let isSmart = false;
    if (source === 'nav' && navEl) {
        isSmart = navEl.value === 'smart';
        if (execEl) {
            if (isSmart) {
                execEl.value = 'smart';
            } else if (execEl.value === 'smart') {
                execEl.value = 'auto';
            }
        }
        if (badgeEl) badgeEl.classList.toggle('hidden', !isSmart);
        logToTerminal(isSmart 
            ? '🧠 Modo Inteligente ACTIVADO: El bot auto-ruteará hacia las oportunidades recomendadas por el Monitor.' 
            : '🎯 Modo Fijo ACTIVADO: El bot operará exclusivamente en el activo actual en pantalla.', 'info');
    } else if (source === 'exec' && execEl) {
        isSmart = execEl.value === 'smart';
        if (navEl) navEl.value = isSmart ? 'smart' : 'fixed';
        if (badgeEl) badgeEl.classList.toggle('hidden', !isSmart);
        if (isSmart) {
            logToTerminal('🧠 Modo Inteligente sincronizado desde el panel lateral.', 'info');
        }
    } else if (source === 'transfer_btn') {
        isSmart = (document.getElementById('navAgentModeSelect')?.value === 'smart');
        if (badgeEl) badgeEl.classList.toggle('hidden', !isSmart);
    }
    
    updateTransferButtons(isSmart);
    updateAgentButtonState();
}

document.getElementById('navAgentModeSelect')?.addEventListener('change', () => syncAgentModes('nav'));
document.getElementById('executionModeSelect')?.addEventListener('change', () => syncAgentModes('exec'));

document.getElementById('btnTransferManual')?.addEventListener('click', () => {
    const navEl = document.getElementById('navAgentModeSelect');
    if (navEl) navEl.value = 'fixed';
    syncAgentModes('nav');
    logToTerminal('✍️ [RADAR] Pase a Contexto Macro fijado en MANUAL. Tú tienes el control: puedes copiar o pulsar [Aplicar a Macro].', 'info');
});

document.getElementById('btnTransferAuto')?.addEventListener('click', () => {
    const navEl = document.getElementById('navAgentModeSelect');
    if (navEl) navEl.value = 'smart';
    syncAgentModes('nav');
    logToTerminal('⚡ [RADAR] Pase a Contexto Macro fijado en AUTOMÁTICO. Las oportunidades recibidas se inyectarán solas.', 'action');
});

function startAgent(reason = 'user') {
    if (isCircuitBreakerActive()) {
        const state = getRiskState();
        logToTerminal(`🛑 No se puede activar el agente: Circuit Breaker activo (${state.haltReason || 'Pausa 24h'}).`, 'error');
        return;
    }
    if (isAgentActive) return;
    isAgentActive = true;
    copilotState = 'idle';

    updateAgentButtonState();

    // Distinguir sesión si el agente estuvo suspendido
    if (agentWasSuspended && !isCopilotApprovalPause) {
        const hasTradesInCurrentSession = tradeHistoryLog.some(t => (t.sessionId || 1) === currentSessionId);
        if (hasTradesInCurrentSession) {
            currentSessionId += 1;
            localStorage.setItem('ai_current_session_id', currentSessionId.toString());
            logToTerminal(`🔄 Reanudando agente: Nueva sesión iniciada (#${currentSessionId}).`, 'info');
        }
        agentWasSuspended = false;
        renderTradeHistory();
    }
    isCopilotApprovalPause = false;

    const smartSuffix = isSmartMode() ? ' en Modo Inteligente (Multi-Activo)' : '';
    logToTerminal(`Agente activado${smartSuffix} (Motivo: ${reason}). Iniciando análisis cuantitativo.`, 'info');
    ejecutarAnalisis();
}

function stopAgent(reason = 'user', { copilotPause = false } = {}) {
    if (simulateInterval) {
        clearTimeout(simulateInterval);
        simulateInterval = null;
    }

    if (copilotPause) {
        copilotState = 'awaiting';
        isCopilotApprovalPause = true;
        isAgentActive = false;
        updateAgentButtonState();
    } else {
        const wasActive = isAgentActive;
        copilotState = 'idle';
        isCopilotApprovalPause = false;
        isAgentActive = false;
        updateAgentButtonState();

        if (copilotExpiryTimer) {
            clearInterval(copilotExpiryTimer);
            copilotExpiryTimer = null;
        }
        if (modal && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
            pendingTrade = null;
        }

        if (wasActive && reason !== 'circuit_breaker') {
            agentWasSuspended = true;
            renderTradeHistory();
        }
        logToTerminal(`Agente detenido (Motivo: ${reason}).`, 'warn');
    }
}

agentToggle.addEventListener('click', () => {
    if (copilotState === 'awaiting') return;
    if (isAgentActive) {
        stopAgent('manual_user');
    } else {
        startAgent('manual_user');
    }
});

const ejecutarAnalisis = async () => {
    if (!isAgentActive) return;

    // 1. Verificación del Circuit Breaker (Bloque 3)
    if (isCircuitBreakerActive()) {
        const state = getRiskState();
        const hoursLeft = state.haltedUntil ? ((state.haltedUntil - Date.now()) / (1000 * 60 * 60)).toFixed(1) : 0;
        logToTerminal(`🛑 [CIRCUIT BREAKER] Agente en pausa preventiva (${hoursLeft}h restantes. Motivo: ${state.haltReason || 'Riesgo'}).`, 'error');
        stopAgent('circuit_breaker');
        return;
    }

    // 2. Watchdog: liberación de mutex si quedó colgado más de 130s (Bloque 4 item 5)
    const nowMs = Date.now();
    if (cycleInFlight && (nowMs - cycleStartedAt > 130000)) {
        logToTerminal('⚠️ [WATCHDOG] Ciclo de análisis previo excedió tiempo límite. Liberando mutex.', 'warn');
        cycleInFlight = false;
    }

    if (cycleInFlight) {
        logToTerminal('⏳ Análisis previo aún en curso. Esperando liberación de recursos...', 'warn');
        scheduleNext(5000);
        return;
    }

    cycleInFlight = true;
    cycleStartedAt = nowMs;
    let rescheduled = false;
    let timeoutId = null;

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
                rescheduled = true;
                scheduleNext(60000);
                return;
            }
        }

        // 3. Resolución de activo objetivo
        const openPos = getOpenPosition();
        const hasPosition = !!openPos;
        let targetSymbol = currentSymbol;
        let entryPrice = 0;

        if (openPos) {
            targetSymbol = openPos.symbol;
            entryPrice = openPos.entryPrice || 0;
            if (openPos.symbol !== currentSymbol) {
                logToTerminal(`ℹ️ Posición activa en ${openPos.symbol}. Priorizando análisis para salida en cartera en lugar de ${currentSymbol}.`, 'info');
            }
        } else if (isSmartMode() && window.currentInjectedMacro && window.currentInjectedMacro.asset) {
            const candAsset = String(window.currentInjectedMacro.asset).trim();
            let matchedSymbol = null;
            if (symbolSelect) {
                for (const opt of symbolSelect.options) {
                    if (opt.value === candAsset || opt.value.split('/')[0] === candAsset || candAsset.includes(opt.value)) {
                        matchedSymbol = opt.value;
                        break;
                    }
                }
            }
            if (matchedSymbol) {
                const candCur = getCurrency(matchedSymbol);
                const hasCapital = (portfolio.balances[candCur] >= 5 || portfolio.VAULT >= 5);
                if (hasCapital) {
                    if (targetSymbol !== matchedSymbol) {
                        logToTerminal(`⚡ [MODO INTELIGENTE] Auto-ruteando a ${matchedSymbol} por directiva del Monitor del Mercado.`, 'action');
                        targetSymbol = matchedSymbol;
                        currentSymbol = matchedSymbol;
                        if (symbolSelect) {
                            symbolSelect.value = matchedSymbol;
                            symbolSelect.dispatchEvent(new Event('change'));
                        }
                        if (window.currentInjectedMacro.text) {
                            const macroBox = document.getElementById('macroContext');
                            if (macroBox) macroBox.value = window.currentInjectedMacro.text;
                        }
                    }
                } else {
                    logToTerminal(`⚠️ [MODO INTELIGENTE] Oportunidad en ${matchedSymbol} pausada: saldo en ${candCur} ($${portfolio.balances[candCur].toFixed(2)}) y Bóveda ($${portfolio.VAULT.toFixed(2)}) menor al mínimo de $5.`, 'warn');
                }
            }
        }

        const tf = document.getElementById('timeframeSelect')?.value || '1m';
        const tpSlVal = document.getElementById('tpSlSelect')?.value || "3.0|-2.0";
        const [tpStr, slStr] = tpSlVal.split('|');
        const tpVal = Math.abs(parseFloat(tpStr)) || 1.5;
        const slVal = Math.abs(parseFloat(slStr)) || 1.0;
        const feeRate = getBrokerFeeRate();
        const roundTripFee = feeRate * 2.0;

        // R9: Filtro de viabilidad matemática: tp >= 2 * roundTripFee
        if (tpVal < (2 * roundTripFee)) {
            logToTerminal(`⚠️ [FILTRO VIABILIDAD] Take Profit neto (+${tpVal}%) es inferior al doble de comisiones (${(2 * roundTripFee).toFixed(2)}%). Aumenta el TP o reduce fees.`, 'warn');
            return;
        }

        const riskVal = document.getElementById('riskSelect')?.value || "0.25";
        const macroContextText = document.getElementById('macroContext')?.value || '';
        
        // Auto-detección de Apagado Programado en el prompt del trader
        if (macroContextText && /deten(er|te|te\s+el\s+agente)?(\s+al|\s+tras|\s+despu[eé]s\s+de)\s+cerrar|stop\s+after\s+close/i.test(macroContextText)) {
            if (!isStopAfterCloseArmed && hasPosition) {
                isStopAfterCloseArmed = true;
                localStorage.setItem('ai_stop_after_close', 'true');
                logToTerminal(`🛑 [APAGADO PROGRAMADO] Detectada directiva en el prompt: El agente se detendrá automáticamente al cerrar ${targetSymbol}.`, 'action');
                updateCapitalDisplay();
            }
        }

        const sentScore = window.currentSentimentScore || 0;
        const url = `${API_BASE_URL}/api/market/analysis?symbol=${encodeURIComponent(targetSymbol)}&timeframe=${tf}&engine=${engine}&tp=${tpVal}&sl=${slVal}&risk=${riskVal}&sentiment=${sentScore}&macro=${encodeURIComponent(macroContextText)}&fee=${feeRate}&has_position=${hasPosition}&entry_price=${entryPrice}`;
        
        // Timeout que cubre cuerpo y conexión (Bloque 4 item 5)
        const timeoutMs = (engine === 'deepseek' || engine === 'ollama') ? 120000 : 45000;
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        logToTerminal(`Consultando Orquestador (${targetSymbol}) vía ${engine.toUpperCase()}...`, 'info');
        const response = await fetch(url, { signal: controller.signal });

        // R6: Validación HTTP antes de leer datos
        if (!response.ok) {
            const errObj = await response.json().catch(() => ({}));
            throw new Error(errObj.detail || `HTTP ${response.status}`);
        }

        const data = await response.json();
        clearTimeout(timeoutId);
        timeoutId = null;

        if (typeof data?.signal !== 'string') {
            throw new Error('Respuesta inválida: falta propiedad signal de tipo string.');
        }

        // R7: Deduplicación por vela
        const signalCandleTs = Number(data.signal_candle_ts) || 0;
        if (signalCandleTs > 0 && lastHandledCandle.symbol === targetSymbol && lastHandledCandle.candleTs === signalCandleTs) {
            logToTerminal(`⏳ Señal de ${data.signal} ignorada: vela ${signalCandleTs} ya fue gestionada.`, 'info');
            return;
        }

        const feeStr = data.fee_info ? ` | Fee Broker: ${data.fee_info.round_trip_fee}% ida/vuelta` : '';
        const rsiDisp = data.indicators?.rsi !== undefined && data.indicators?.rsi !== null ? data.indicators.rsi : '-';
        const smaDisp = data.indicators?.sma_20 !== undefined && data.indicators?.sma_20 !== null ? data.indicators.sma_20 : '-';
        const logType = data.signal === 'COMPRAR' ? 'action' : (data.signal === 'VENDER' ? 'error' : 'info');
        logToTerminal(`[${data.signal}] RSI: ${rsiDisp} | SMA20: ${smaDisp}${feeStr}`, 'warn');
        logToTerminal(`Razonamiento: ${data.reason}`, logType);

        const baseCoin = targetSymbol.split('/')[0];
        const executionMode = document.getElementById('executionModeSelect')?.value || 'copilot';

        const isBuyable = data.signal === 'COMPRAR' && !hasPosition;
        const isSellable = data.signal === 'VENDER' && hasPosition;

        // R8: Comprobar cooldown post-cierre al intentar comprar
        if (isBuyable) {
            const savedCooldown = Number(localStorage.getItem('ai_cooldown_v1')) || 0;
            if (Date.now() < savedCooldown) {
                const minLeft = ((savedCooldown - Date.now()) / 60000).toFixed(1);
                logToTerminal(`⏳ [COOLDOWN ACTIVO] Nueva compra bloqueada. Restan ${minLeft} min tras el último cierre.`, 'warn');
                if (signalCandleTs > 0) lastHandledCandle = { symbol: targetSymbol, candleTs: signalCandleTs };
                return;
            }
        }

        if (data.signal === 'COMPRAR' && hasPosition) {
            logToTerminal(`ℹ️ Ya tienes una posición abierta en ${openPos ? openPos.baseCoin : baseCoin}. Re-compra bloqueada.`, 'warn');
        }

        if (isBuyable || isSellable) {
            let execPrice = 0;
            if (isBuyable) {
                // Validación estricta de precio para compras:
                // Prioridad 1: Precio verificado de la vela recibido del backend para targetSymbol
                if (data.indicators && typeof data.indicators.current_price === 'number' && data.indicators.current_price > 0) {
                    execPrice = data.indicators.current_price;
                } else if (currentPriceSymbol === targetSymbol && currentPrice > 0) {
                    execPrice = currentPrice;
                } else {
                    logToTerminal(`⚠️ [SEGURIDAD] Compra abortada: sin precio verificado para ${targetSymbol} (sincronizando activo).`, 'error');
                    if (signalCandleTs > 0) lastHandledCandle = { symbol: targetSymbol, candleTs: signalCandleTs };
                    return;
                }
            } else if (isSellable) {
                if (openPos.symbol === currentSymbol && currentPriceSymbol === currentSymbol && currentPrice > 0) {
                    execPrice = currentPrice;
                } else if (data.indicators && typeof data.indicators.current_price === 'number' && data.indicators.current_price > 0) {
                    execPrice = data.indicators.current_price;
                } else if (window.positionAssetPrice && (Date.now() - (window.positionAssetPriceTs || 0)) <= 15000) {
                    execPrice = window.positionAssetPrice;
                } else {
                    execPrice = openPos.entryPrice;
                }
            }

            if (!Number.isFinite(execPrice) || execPrice <= 0) {
                logToTerminal(`⚠️ [SEGURIDAD] Orden abortada: precio inválido o no numérico ($${execPrice}) para ${targetSymbol}.`, 'error');
                return;
            }

            if (executionMode === 'auto' || executionMode === 'smart') {
                if (signalCandleTs > 0) lastHandledCandle = { symbol: targetSymbol, candleTs: signalCandleTs };
                executeTrade(data.signal, targetSymbol, baseCoin, execPrice, executionMode === 'smart' ? 'Inteligente' : 'Automático');
            } else {
                stopAgent('copilot_awaiting', { copilotPause: true });
                showCopilotModal(data.signal, targetSymbol, data.reason, baseCoin, execPrice, signalCandleTs);
            }
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            logToTerminal(`⏳ Timeout de análisis agotado en motor ${engine.toUpperCase()}. El servidor tardó demasiado.`, 'warn');
        } else {
            logToTerminal('Fallo en análisis: ' + err.message, 'error');
        }
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        cycleInFlight = false;

        // Reprogramar deterministamente si no se reprogramó expresamente arriba
        if (isAgentActive && !rescheduled) {
            const tf = document.getElementById('timeframeSelect')?.value || '1m';
            let delayMs = 60000;
            if (tf === '5m') delayMs = 300000;
            if (tf === '15m') delayMs = 900000;
            if (engine === 'local') delayMs = 15000;

            scheduleNext(delayMs);
        }
    }
};

// Ciclo de Gráfico en Vivo (Cada 2 segundos) aislado exclusivamente para renderizado visual (Bloque 2)
let chartInFlight = false;
let lastChartErrorLogTs = 0;
setInterval(async () => {
    const lobby = document.getElementById("lobbyView");
    if (lobby && !lobby.classList.contains("hidden")) return;
    if (chartInFlight) return;
    chartInFlight = true;
    const reqSymbol = currentSymbol;
    try {
        const response = await fetch(`${API_BASE_URL}/api/market/history?symbol=${encodeURIComponent(reqSymbol)}&timeframe=${document.getElementById('timeframeSelect')?.value || '1m'}&limit=60`);
        if (!response.ok) {
            const now = Date.now();
            if (now - lastChartErrorLogTs > 30000) {
                logToTerminal(`⚠️ [GRÁFICO] Error actualizando velas de ${reqSymbol}: HTTP ${response.status}`, 'warn');
                lastChartErrorLogTs = now;
            }
            return;
        }
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
            currentPriceSymbol = reqSymbol;
            currentPriceTs = Date.now();
            currentPriceElement.innerText = `$${currentPrice.toLocaleString()}`;
            updateCapitalDisplay();
        }
    } catch (err) {
        const now = Date.now();
        if (now - lastChartErrorLogTs > 30000) {
            logToTerminal(`⚠️ [GRÁFICO] Fallo en renderizado de velas para ${reqSymbol}: ${err.message}`, 'warn');
            lastChartErrorLogTs = now;
        }
    } finally {
        chartInFlight = false;
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

// --- PUENTE CON MONITOR DEL MERCADO Y AGENTE DE INVERSIONES ---
let lastInjectedTs = null;
window.currentInjectedMacro = null;

async function checkInjectedMacro() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/macro/current_injected`);
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.text && data.timestamp && data.timestamp !== lastInjectedTs) {
            lastInjectedTs = data.timestamp;
            window.currentInjectedMacro = data;
            
            // 1. Bitácora en el terminal
            const sourceLabel = data.source || 'Monitor del Mercado';
            logToTerminal(`🌐 [${sourceLabel.toUpperCase()}] Directiva recibida para ${data.asset || 'Activo'} (${data.confidence || 80}% conf).`, 'action');
            logToTerminal(`🧠 [CEREBRO DEL BOT] Tesis: "${String(data.text || '').substring(0, 90)}..."`, 'info');
            logToTerminal(`🎯 [PREPARADO] Listo para evaluar con análisis cuantitativo y horario de mercado.`, 'warn');
            
            // 2. Si estamos en Modo Inteligente y no hay posición activa, aplicar y auto-rutear automáticamente
            if (isSmartMode() && !hasOpenPosition()) {
                const macroInput = document.getElementById('macroContext');
                if (macroInput) {
                    macroInput.value = data.text;
                    macroInput.classList.add('border-purple-500', 'bg-purple-950/30');
                    setTimeout(() => macroInput.classList.remove('border-purple-500', 'bg-purple-950/30'), 3000);
                }
                logToTerminal(`⚡ [MODO INTELIGENTE] Contexto Macro actualizado automáticamente con tesis de ${data.asset}.`, 'action');

                // Auto-ruteo inmediato de activo
                const cleanSym = String(data.asset || '').trim();
                let matchedSymbol = null;
                if (symbolSelect && cleanSym) {
                    for (const opt of symbolSelect.options) {
                        if (opt.value === cleanSym || opt.value.split('/')[0] === cleanSym || cleanSym.includes(opt.value)) {
                            matchedSymbol = opt.value;
                            break;
                        }
                    }
                }
                if (matchedSymbol && symbolSelect.value !== matchedSymbol) {
                    const candCur = getCurrency(matchedSymbol);
                    const hasCapital = (portfolio.balances[candCur] >= 5 || portfolio.VAULT >= 5);
                    if (hasCapital) {
                        symbolSelect.value = matchedSymbol;
                        symbolSelect.dispatchEvent(new Event('change'));
                        logToTerminal(`⚡ [MODO INTELIGENTE] Auto-ruteando a ${matchedSymbol} de forma inmediata.`, 'action');
                    } else {
                        logToTerminal(`⚠️ [MODO INTELIGENTE] Oportunidad en ${matchedSymbol} pausada: saldo en ${candCur} ($${portfolio.balances[candCur].toFixed(2)}) y Bóveda ($${portfolio.VAULT.toFixed(2)}) menor al mínimo de $5.`, 'warn');
                    }
                }

                // Disparo inmediato de análisis cuantitativo con Qwen
                if (isAgentActive && !cycleInFlight) {
                    logToTerminal(`⚡ [MODO INTELIGENTE] Disparando análisis cuantitativo inmediato para ${data.asset}...`, 'info');
                    if (simulateInterval) clearTimeout(simulateInterval);
                    simulateInterval = setTimeout(ejecutarAnalisis, 600);
                }
            }
            
            // 3. Refrescar radar para reflejar la tarjeta de inmediato
            updateMacroRadar();
        }
    } catch (_) {}
}
setInterval(checkInjectedMacro, 3000); // Polling cada 3 segundos

window.applyMacroContext = function(asset, text) {
    const macroInput = document.getElementById('macroContext');
    if (macroInput) {
        macroInput.value = text || '';
        macroInput.classList.add('border-green-500', 'bg-green-950/40');
        setTimeout(() => macroInput.classList.remove('border-green-500', 'bg-green-950/40'), 2500);
    }
    
    const openPos = getOpenPosition();
    if (asset && !openPos) {
        const cleanSym = String(asset).trim();
        let matchedSymbol = null;
        if (symbolSelect) {
            for (const opt of symbolSelect.options) {
                if (opt.value === cleanSym || opt.value.split('/')[0] === cleanSym || cleanSym.includes(opt.value)) {
                    matchedSymbol = opt.value;
                    break;
                }
            }
        }
        if (matchedSymbol && symbolSelect.value !== matchedSymbol) {
            symbolSelect.value = matchedSymbol;
            symbolSelect.dispatchEvent(new Event('change'));
            logToTerminal(`📥 [CONTEXTO MACRO] Tesis aplicada y gráfico cambiado a ${matchedSymbol}.`, 'action');
        } else {
            logToTerminal(`📥 [CONTEXTO MACRO] Tesis aplicada al Cuadro de Contexto Macro.`, 'action');
        }
    } else if (openPos) {
        logToTerminal(`📥 [CONTEXTO MACRO] Tesis aplicada. (El gráfico se mantiene en ${openPos.symbol} por posición abierta).`, 'info');
    }
};

window.copyMacroText = function(text, btnElement) {
    const cleanText = text || '';
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(cleanText).then(() => {
            if (btnElement) {
                const prev = btnElement.innerText;
                btnElement.innerText = '✅ Copiado';
                setTimeout(() => { btnElement.innerText = prev; }, 1500);
            }
            logToTerminal(`📋 Tesis copiada al portapapeles.`, 'info');
        }).catch(() => {
            fallbackCopy(cleanText, btnElement);
        });
    } else {
        fallbackCopy(cleanText, btnElement);
    }
};

function fallbackCopy(text, btnElement) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        if (btnElement) {
            const prev = btnElement.innerText;
            btnElement.innerText = '✅ Copiado';
            setTimeout(() => { btnElement.innerText = prev; }, 1500);
        }
        logToTerminal(`📋 Tesis copiada al portapapeles.`, 'info');
    } catch (_) {}
    document.body.removeChild(ta);
}

// --- Agente de Inversiones (Radar Macro) ---
async function updateMacroRadar() {
    const lobby = document.getElementById("lobbyView");
    if (lobby && !lobby.classList.contains("hidden")) return;

    const toggle = document.getElementById('investmentToggle');
    const squadToggle = document.getElementById('investmentSquadToggle');
    const container = document.getElementById('macroOpportunitiesContainer');
    if (!container) return;

    const isEnabled = (toggle && toggle.checked) || (squadToggle && squadToggle.checked);
    if (!isEnabled) {
        container.innerHTML = '<p class="text-xs text-gray-500 text-center py-2">Agente Desactivado.</p>';
        return;
    }

    const engine = document.getElementById('engineSelect')?.value || 'ollama';
    const source = document.getElementById('investmentSourceSelect')?.value || 'hybrid';
    container.innerHTML = `<p class="text-xs text-yellow-500 text-center py-2 animate-pulse">Consultando radar de oportunidades (${source})...</p>`;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/macro/radar?engine=${engine}&source=${source}`);
        const data = await response.json();
        
        container.innerHTML = '';
        if (Array.isArray(data) && data.length > 0) {
            data.forEach((item, index) => {
                const isOp = item.type === 'Oportunidad';
                const colorClass = isOp ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10';
                const typeColor = isOp ? 'text-green-400' : 'text-red-400';
                const itemSource = item.source || (item.injected ? 'monitor' : 'native');
                const sourceBadge = (itemSource === 'monitor')
                    ? '<span class="text-[9px] bg-cyan-900/60 text-cyan-300 border border-cyan-600/50 px-1.5 py-0.5 rounded font-mono">🖥️ Monitor</span>'
                    : '<span class="text-[9px] bg-yellow-900/60 text-yellow-300 border border-yellow-600/50 px-1.5 py-0.5 rounded font-mono">🌐 Nativo</span>';
                
                const safeAsset = escapeHtml(item.asset || 'N/A');
                const safeReason = escapeHtml(item.reason || '');
                const rawReason = (item.reason || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                const rawAsset = (item.asset || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                
                const div = document.createElement('div');
                div.className = 'bg-gray-800 p-2.5 rounded border border-gray-600 mb-2 shadow-sm';
                div.innerHTML = `
                    <div class="flex justify-between items-center mb-1">
                        <div class="flex items-center gap-1.5">
                            <span class="text-xs font-bold text-white">${safeAsset}</span>
                            ${sourceBadge}
                        </div>
                        <span class="text-[10px] ${colorClass} font-bold px-1 rounded">${Number(item.confidence) || 0}% Conf.</span>
                    </div>
                    <p class="text-[10px] text-gray-300 leading-tight mb-2"><span class="font-bold ${typeColor}">${escapeHtml(item.type || 'Análisis')}:</span> ${safeReason}</p>
                    <div class="flex items-center justify-between pt-1 border-t border-gray-700/60 text-[10px]">
                        <span class="text-gray-500 text-[9px]">⏳ ${escapeHtml(item.schedule || 'Inmediato')}</span>
                        <div class="flex items-center gap-1.5">
                            <button onclick="window.applyMacroContext('${rawAsset}', '${rawReason}')" class="bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded text-[10px] font-semibold transition flex items-center gap-1 shadow cursor-pointer" title="Cargar tesis en Contexto Macro">
                                <span>📥</span> Aplicar a Macro
                            </button>
                            <button onclick="window.copyMacroText('${rawReason}', this)" class="bg-gray-700 hover:bg-gray-600 text-gray-200 px-1.5 py-0.5 rounded text-[10px] transition cursor-pointer" title="Copiar tesis">
                                📋 Copiar
                            </button>
                        </div>
                    </div>
                `;
                container.appendChild(div);
            });
        } else {
            container.innerHTML = `<p class="text-xs text-gray-500 text-center py-2">Sin hallazgos en radar (${source}).</p>`;
        }
    } catch (err) {
        console.error("Fallo el Agente de Inversiones", err);
        container.innerHTML = '<p class="text-xs text-red-500 text-center py-2">Error de conexión.</p>';
    }
}
updateMacroRadar();
setInterval(updateMacroRadar, 120000); // 2 minutos

// Sincronización bidireccional de Agente de Inversiones
function setInvestmentAgentState(isChecked) {
    const invToggle = document.getElementById('investmentToggle');
    const squadToggle = document.getElementById('investmentSquadToggle');
    if (invToggle && invToggle.checked !== isChecked) invToggle.checked = isChecked;
    if (squadToggle && squadToggle.checked !== isChecked) squadToggle.checked = isChecked;

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
    logToTerminal(isChecked ? "🔭 Agente de Inversiones ACTIVADO" : "Agente de Inversiones DESACTIVADO", "info");
    updateMacroRadar();
}

document.getElementById('investmentToggle')?.addEventListener('change', (e) => {
    setInvestmentAgentState(e.target.checked);
});

document.getElementById('investmentSquadToggle')?.addEventListener('change', (e) => {
    setInvestmentAgentState(e.target.checked);
});

document.getElementById('investmentSourceSelect')?.addEventListener('change', () => {
    const src = document.getElementById('investmentSourceSelect')?.value || 'hybrid';
    logToTerminal(`Fuente de Agente de Inversiones cambiada a: ${src}`, 'info');
    updateMacroRadar();
});

document.getElementById('clearLogs')?.addEventListener('click', () => {
    terminal.innerHTML = '';
});

// -- Funciones de Trading y Copiloto --

let isTradeHistoryExpanded = false;

window.toggleTradeHistory = function() {
    isTradeHistoryExpanded = !isTradeHistoryExpanded;
    renderTradeHistory();
};

function renderTradeHistory() {
    const tbody = document.getElementById('tradeHistoryBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const todayStr = new Date().toDateString();
    const todaysTrades = tradeHistoryLog.filter(trade => {
        if (!trade.timestamp) return false; 
        return new Date(trade.timestamp).toDateString() === todayStr;
    });

    const currentSessionTrades = todaysTrades.filter(t => (t.sessionId || 1) === currentSessionId);
    const previousSessionTrades = todaysTrades.filter(t => (t.sessionId || 1) !== currentSessionId);

    const toggleBtn = document.getElementById('btnToggleHistory');
    if (toggleBtn) {
        if (previousSessionTrades.length > 0) {
            toggleBtn.classList.remove('hidden');
            toggleBtn.innerText = isTradeHistoryExpanded ? 'Ocultar previas' : `Mostrar previas (${previousSessionTrades.length})`;
            toggleBtn.className = isTradeHistoryExpanded
                ? 'bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1 px-3 rounded text-xs transition border border-gray-600'
                : 'bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-3 rounded text-xs transition shadow';
        } else {
            toggleBtn.classList.add('hidden');
        }
    }

    if (todaysTrades.length === 0) {
        const msg = isAgentActive 
            ? `Sesión #${currentSessionId} activa. Esperando primeras operaciones del día...`
            : `No hay operaciones registradas en el día de hoy.`;
        tbody.innerHTML = `<tr id="emptyHistoryRow"><td colspan="7" class="px-4 py-4 text-center ${isAgentActive ? 'text-blue-400' : 'text-gray-600'} italic">${msg}</td></tr>`;
        return;
    }

    // Si está colapsado y la sesión actual aún no tiene operaciones
    if (!isTradeHistoryExpanded && currentSessionTrades.length === 0) {
        const waitingTr = document.createElement('tr');
        waitingTr.className = 'bg-blue-950/30 text-blue-300 border-b border-blue-900/40';
        waitingTr.innerHTML = `
            <td colspan="7" class="px-4 py-4 text-center text-xs">
                <div class="inline-flex items-center space-x-2">
                    <span class="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                    <span class="font-bold text-white">Sesión Actual (#${currentSessionId})</span>
                    <span class="text-blue-300/80">— Sin operaciones aún en esta sesión.</span>
                </div>
            </td>
        `;
        tbody.appendChild(waitingTr);

        if (previousSessionTrades.length > 0) {
            const expandFooterTr = document.createElement('tr');
            expandFooterTr.className = 'bg-gray-900/90 hover:bg-gray-800 cursor-pointer border-t border-gray-700 text-center select-none transition-colors';
            expandFooterTr.onclick = window.toggleTradeHistory;
            expandFooterTr.innerHTML = `
                <td colspan="7" class="px-4 py-2.5 text-xs font-semibold text-blue-400 hover:text-blue-300">
                    ▼ Ver ${previousSessionTrades.length} ${previousSessionTrades.length === 1 ? 'operación previa' : 'operaciones previas'}
                </td>
            `;
            tbody.appendChild(expandFooterTr);
        }
        return;
    }

    // Lista a renderizar: si expandido -> todas; si colapsado -> solo las de la sesión actual
    const tradesToShow = isTradeHistoryExpanded ? todaysTrades : currentSessionTrades;

    // Encabezado si el agente está activo y en vista expandida la sesión actual no tiene operaciones
    if (isAgentActive && currentSessionTrades.length === 0) {
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

    tradesToShow.forEach((trade, index) => {
        const tradeSession = trade.sessionId || 1;
        const isCurrentSession = (tradeSession === currentSessionId);

        // Separadores de sesión en vista expandida
        if (isTradeHistoryExpanded) {
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

    if (previousSessionTrades.length > 0) {
        const expandFooterTr = document.createElement('tr');
        expandFooterTr.className = 'bg-gray-900/90 hover:bg-gray-800 cursor-pointer border-t border-gray-700 text-center select-none transition-colors';
        const hiddenCount = previousSessionTrades.length;
        expandFooterTr.onclick = window.toggleTradeHistory;
        expandFooterTr.innerHTML = `
            <td colspan="7" class="px-4 py-2.5 text-xs font-semibold ${isTradeHistoryExpanded ? 'text-gray-400 hover:text-white' : 'text-blue-400 hover:text-blue-300'}">
                ${isTradeHistoryExpanded ? '▲ Ocultar operaciones previas (ver solo sesión actual)' : `▼ Ver ${hiddenCount} ${hiddenCount === 1 ? 'operación previa' : 'operaciones previas'}`}
            </td>
        `;
        tbody.appendChild(expandFooterTr);
    }
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
        if (signal === 'VENDER' && hasOpenPosition()) {
            const fallbackPos = getOpenPosition();
            price = (fallbackPos && fallbackPos.entryPrice > 0) ? fallbackPos.entryPrice : 1;
            logToTerminal(`⚠️ Precio no disponible en tiempo real; ejecutando venta al precio de referencia ($${price}).`, 'warn');
        } else {
            logToTerminal(`⚠️ Ejecución abortada: precio inválido o no numérico ($${price}).`, 'error');
            return;
        }
    }

    const effectiveSymbol = symbol || currentSymbol;
    const currency = getCurrency(effectiveSymbol);
    if (!Number.isFinite(portfolio.balances[currency])) {
        logToTerminal(`⚠️ Ejecución abortada: balance no numérico en moneda ${currency}.`, 'error');
        return;
    }

    // R10: Validación de consistencia de precio en órdenes de COMPRA
    if (signal === 'COMPRAR') {
        if (currentPriceSymbol === effectiveSymbol && currentPrice > 0) {
            const ratio = price / currentPrice;
            if (ratio < 0.5 || ratio > 2.0) {
                logToTerminal(`🛑 [SEGURIDAD] Compra abortada: discrepancia severa de precio para ${effectiveSymbol} (orden: $${price} vs mercado: $${currentPrice}). Desincronización prevenida.`, 'error');
                return;
            }
        }
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
            // R4: Bloqueo de compra por Circuit Breaker
            if (isCircuitBreakerActive()) {
                const rState = getRiskState();
                logToTerminal(`🛑 [CIRCUIT BREAKER] Compra abortada en ${effectiveSymbol}. Motivo: ${rState.haltReason || 'Pausado'}`, 'error');
                return;
            }

            // R8: Bloqueo de compra por Cooldown post-cierre
            const savedCooldown = Number(localStorage.getItem('ai_cooldown_v1')) || 0;
            if (Date.now() < savedCooldown) {
                const minLeft = ((savedCooldown - Date.now()) / 60000).toFixed(1);
                logToTerminal(`⏳ [COOLDOWN ACTIVO] Compra abortada en ${effectiveSymbol}. Restan ${minLeft} min tras el último cierre.`, 'warn');
                return;
            }

            const riskFactor = parseFloat(document.getElementById('riskSelect')?.value || "0.25");
            
            // JIT Funding (Cuentas Ómnibus / Bóveda central): Si la billetera operativa tiene saldo insuficiente pero hay fondos en la Bóveda
            let isJitAllocated = false;
            if (portfolio.balances[currency] < 5 && portfolio.VAULT >= 5) {
                const vaultAlloc = Math.max(5.0, portfolio.VAULT * riskFactor);
                const safeAlloc = Math.min(portfolio.VAULT, vaultAlloc);
                if (safeAlloc >= 5.0) {
                    portfolio.VAULT -= safeAlloc;
                    const destAmount = (currency === 'ARS') ? (safeAlloc * 1000.0) : safeAlloc;
                    portfolio.balances[currency] += destAmount;
                    portfolio.deposits[currency] = (portfolio.deposits[currency] || 0) + destAmount;
                    isJitAllocated = true;
                    logToTerminal(`🏦 [JIT FUNDING] Asignados $${safeAlloc.toFixed(2)} USD desde la Bóveda a ${currency} para ejecutar la oportunidad.`, 'action');
                }
            }

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
                feeRate: feeRate, // Guardar pos.feeRate al abrir la posición
                tp: tpLimit,
                sl: slLimit,
                stopNetPct: -slLimit, // R1: stop neto firmado (ej. -1.0)
                peakPrice: price,
                beArmed: false,
                trailActive: false,
                trailPct: 0.5,
                openedAt: new Date().toISOString(),
                jitAllocated: isJitAllocated
            };
            
            // Espejo retrocompatible
            portfolio.ASSET = cantidadAComprar;
            portfolio.entryPrice = price;
            portfolio.balances[currency] -= tradeAmount;
            portfolio.totalFeesPaid = (portfolio.totalFeesPaid || 0) + feeAmount;
            
            // R2 item 5: Limpiar variables de precio de fondo al abrir nueva posición
            window.positionAssetPrice = null;
            window.positionAssetPriceTs = 0;
            
            logToTerminal(`💰 SIMULACIÓN: COMPRADO ${cantidadAComprar.toFixed(4)} ${baseCoin} (${effectiveSymbol}) a $${price.toLocaleString()} (Inversión: $${tradeAmount.toFixed(2)} | Fee Broker: $${feeAmount.toFixed(2)} [${feeRate}%] | TP: +${tpLimit}% | SL: -${slLimit}%)`, 'action');
            addTradeToHistory(signal, effectiveSymbol, baseCoin, price, 'Ejecutada', mode, feeAmount, cantidadAComprar);
        } else if (signal === 'VENDER') {
            // VENDER siempre usa los datos reales de la posición (Bloque 1 item 5)
            const pos = openPos;
            const sellSymbol = pos.symbol;
            const sellCoin = pos.baseCoin;
            const sellCurrency = pos.currency || getCurrency(sellSymbol);
            const posQty = pos.qty;
            const feeRate = (pos && typeof pos.feeRate === 'number') ? pos.feeRate : getBrokerFeeRate();

            // Validación de frescura en milisegundos para ventas si no está en pantalla (Bloque 1 y 2)
            let execSellPrice = price;
            const isExemptFromStaleCheck = ['Manual', 'Stop Loss', 'Breakeven', 'Breakeven Stop', 'Trailing', 'Trailing Stop', 'Take Profit'].includes(mode);
            if (sellSymbol !== currentSymbol && !isExemptFromStaleCheck) {
                const nowMs = Date.now();
                const ageMs = nowMs - (window.positionAssetPriceTs || 0);
                const thresholdMs = sellSymbol.includes('/') ? 20000 : 150000;
                if (!window.positionAssetPrice || ageMs > thresholdMs) {
                    logToTerminal(`⚠️ [VENTA ABORTADA] No hay precio fresco (< ${thresholdMs / 1000}s) de segundo plano para ${sellSymbol}. Cambia al activo en pantalla o espera respuesta del feed.`, 'error');
                    return;
                }
                execSellPrice = window.positionAssetPrice;
            } else if (sellSymbol !== currentSymbol && isExemptFromStaleCheck) {
                if (typeof window.positionAssetPrice === 'number' && window.positionAssetPrice > 0) {
                    execSellPrice = window.positionAssetPrice;
                } else if (price > 0) {
                    execSellPrice = price;
                } else {
                    execSellPrice = pos.entryPrice || 1;
                }
            }

            const dolaresObtenidosBruto = posQty * execSellPrice;
            const feeAmount = dolaresObtenidosBruto * (feeRate / 100);
            const dolaresNetos = dolaresObtenidosBruto - feeAmount;
            const costBasis = pos.costBasis || (posQty * pos.entryPrice);
            const pnlNeto = dolaresNetos - costBasis;
            
            portfolio.balances[sellCurrency] += dolaresNetos;
            if (pos && pos.jitAllocated) {
                // Sweep-Back: Retornar capital base + resultado neto directamente a la Bóveda del Broker
                const sweepAmount = dolaresNetos;
                portfolio.balances[sellCurrency] = Math.max(0, portfolio.balances[sellCurrency] - sweepAmount);
                if (sellCurrency === 'ARS') {
                    portfolio.VAULT += (sweepAmount / 1000.00);
                } else {
                    portfolio.VAULT += sweepAmount;
                }
                logToTerminal(`🧹 [SWEEP-BACK] Trade JIT cerrado. $${sweepAmount.toFixed(2)} ${sellCurrency} devueltos íntegramente a la Bóveda (Saldo Bóveda: $${portfolio.VAULT.toFixed(2)} USD).`, 'action');
            }
            portfolio.position = null;
            portfolio.ASSET = 0;
            portfolio.entryPrice = 0;
            // R2 item 5: Limpiar positionAssetPrice y timestamp al cerrar posición
            window.positionAssetPrice = null;
            window.positionAssetPriceTs = 0;
            portfolio.totalFeesPaid = (portfolio.totalFeesPaid || 0) + feeAmount;
            
            // Actualizar Circuit Breaker diario por libro (Bloque 3 - R4)
            recordTradeInCircuitBreaker(pnlNeto, sellCurrency);

            // R8: Cooldown post-cierre al cerrar posición (manual, SL o TP)
            const tfSecMap = { '1m': 60, '5m': 300, '15m': 900 };
            const tfVal = document.getElementById('timeframeSelect')?.value || '1m';
            const tfSec = tfSecMap[tfVal] || 60;
            const cooldownMs = Math.max(300000, 3 * tfSec * 1000);
            const cooldownUntil = Date.now() + cooldownMs;
            localStorage.setItem('ai_cooldown_v1', String(cooldownUntil));
            logToTerminal(`⏳ [COOLDOWN INICIADO] Pausa de ${(cooldownMs / 60000).toFixed(1)} min para nuevas compras tras cierre de posición.`, 'info');

            logToTerminal(`💵 SIMULACIÓN: VENDIDO ${sellCoin} (${sellSymbol}) a $${execSellPrice.toLocaleString()} (Bruto: $${dolaresObtenidosBruto.toFixed(2)} | Fee Broker: $${feeAmount.toFixed(2)} [${feeRate}%] | Neto: $${dolaresNetos.toFixed(2)} | PnL: ${pnlNeto >= 0 ? '+' : ''}$${pnlNeto.toFixed(2)}). Saldo ${sellCurrency}: $${portfolio.balances[sellCurrency].toFixed(2)}`, 'error');
            
            // Graceful Shutdown: Apagado programado post-cierre
            if (isStopAfterCloseArmed) {
                isStopAfterCloseArmed = false;
                localStorage.removeItem('ai_stop_after_close');
                if (isAgentActive) {
                    stopAgent('post_trade_closure');
                    logToTerminal(`🛡️ [APAGADO PROGRAMADO] Posición en ${sellSymbol} cerrada con éxito. Agente detenido automáticamente como ordenaste.`, 'action');
                }
            }
            
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

                    // Ajustar startEquity del Circuit Breaker al retirar ganancias a la Bóveda
                    const rState = getRiskState();
                    if (rState.books && rState.books[sellCurrency] && !rState.books[sellCurrency].placeholder) {
                        rState.books[sellCurrency].startEquity = Math.max(0, (rState.books[sellCurrency].startEquity || 0) - profitToSweep);
                        saveRiskState(rState);
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

function showCopilotModal(signal, symbol, reason, baseCoin, price, candleTs = 0) {
    if (copilotExpiryTimer) {
        clearInterval(copilotExpiryTimer);
        copilotExpiryTimer = null;
    }
    document.getElementById('copilotMessage').innerText = `El Agente recomienda ${signal} ${baseCoin} (${symbol}) a $${price.toLocaleString()}`;
    document.getElementById('copilotReason').innerText = `Razonamiento: ${reason}`;
    modal.classList.remove('hidden');
    pendingTrade = { signal, symbol, baseCoin, price, signalPrice: price, candleTs: Number(candleTs) || 0, openedAt: Date.now() };

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
                if (pendingTrade.candleTs > 0) {
                    lastHandledCandle = { symbol: pendingTrade.symbol, candleTs: pendingTrade.candleTs };
                }
                pendingTrade = null;
                copilotState = 'idle';
                startAgent('copilot_expired');
                scheduleNext(15000);
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
        if (pendingTrade.candleTs > 0) {
            lastHandledCandle = { symbol: pendingTrade.symbol, candleTs: pendingTrade.candleTs };
        }
        // Cooldown tras rechazar para no reabrir el modal inmediatamente (Bloque 4)
        const tfSecMap = { '1m': 60, '5m': 300, '15m': 900 };
        const tfVal = document.getElementById('timeframeSelect')?.value || '1m';
        const tfSec = tfSecMap[tfVal] || 60;
        const cooldownMs = Math.max(300000, 3 * tfSec * 1000);
        const cooldownUntil = Date.now() + cooldownMs;
        localStorage.setItem('ai_cooldown_v1', String(cooldownUntil));
        logToTerminal(`⏳ [COOLDOWN INICIADO] Pausa de ${(cooldownMs / 60000).toFixed(1)} min tras rechazar operación.`, 'info');
        pendingTrade = null;
    }
    copilotState = 'idle';
    startAgent('copilot_rejected');
    scheduleNext(15000);
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
        const tradeSymbol = pendingTrade.symbol || currentSymbol;
        const candleTs = pendingTrade.candleTs || 0;

        // R4: Si se bloquea en btnApprove por Circuit Breaker, descarta y registra como 'Rechazada' con motivo 'Circuit Breaker'
        if (pendingTrade.signal === 'COMPRAR' && isCircuitBreakerActive()) {
            const state = getRiskState();
            logToTerminal(`🛑 [CIRCUIT BREAKER] Compra descartada por Circuit Breaker (${state.haltReason}).`, 'error');
            addTradeToHistory('COMPRAR', tradeSymbol, pendingTrade.baseCoin, pendingTrade.signalPrice, 'Rechazada', 'Circuit Breaker');
            if (candleTs > 0) lastHandledCandle = { symbol: tradeSymbol, candleTs };
            pendingTrade = null;
            copilotState = 'idle';
            stopAgent('circuit_breaker');
            return;
        }

        // 1. Revalidar estado antes de ejecutar
        if (pendingTrade.signal === 'COMPRAR') {
            if (hasPos) {
                logToTerminal('⚠️ Orden descartada: ya tienes una posición abierta mientras decidías.', 'warn');
                if (candleTs > 0) lastHandledCandle = { symbol: tradeSymbol, candleTs };
                pendingTrade = null;
                copilotState = 'idle';
                startAgent('copilot_discarded');
                scheduleNext(15000);
                return;
            }
            if (currentSymbol !== pendingTrade.symbol) {
                logToTerminal(`⚠️ Orden de compra descartada: cambiaste de activo en pantalla (${currentSymbol} != ${pendingTrade.symbol}).`, 'warn');
                if (candleTs > 0) lastHandledCandle = { symbol: tradeSymbol, candleTs };
                pendingTrade = null;
                copilotState = 'idle';
                startAgent('copilot_discarded');
                scheduleNext(15000);
                return;
            }
            const savedCooldown = Number(localStorage.getItem('ai_cooldown_v1')) || 0;
            if (Date.now() < savedCooldown) {
                const minLeft = ((savedCooldown - Date.now()) / 60000).toFixed(1);
                logToTerminal(`⏳ [COOLDOWN ACTIVO] Orden de compra descartada. Restan ${minLeft} min tras el último cierre.`, 'warn');
                if (candleTs > 0) lastHandledCandle = { symbol: tradeSymbol, candleTs };
                pendingTrade = null;
                copilotState = 'idle';
                startAgent('copilot_discarded');
                scheduleNext(15000);
                return;
            }
        }
        if (pendingTrade.signal === 'VENDER') {
            if (!hasPos) {
                logToTerminal('⚠️ Orden descartada: la posición ya fue cerrada previamente (ej. Stop Loss).', 'warn');
                if (candleTs > 0) lastHandledCandle = { symbol: tradeSymbol, candleTs };
                pendingTrade = null;
                copilotState = 'idle';
                startAgent('copilot_discarded');
                scheduleNext(15000);
                return;
            }
            if (tradeSymbol !== currentSymbol) {
                const ageMs = Date.now() - (window.positionAssetPriceTs || 0);
                const thresholdMs = tradeSymbol.includes('/') ? 20000 : 150000;
                if (!window.positionAssetPrice || ageMs > thresholdMs) {
                    logToTerminal(`⚠️ [APROBACIÓN ABORTADA] No hay precio fresco (< ${thresholdMs / 1000}s) para vender ${tradeSymbol}. Espera respuesta del feed de fondo.`, 'error');
                    if (candleTs > 0) lastHandledCandle = { symbol: tradeSymbol, candleTs };
                    pendingTrade = null;
                    copilotState = 'idle';
                    startAgent('copilot_discarded');
                    scheduleNext(15000);
                    return;
                }
            }
        }

        // 2. Control de Slippage
        const evalCurrentPrice = (tradeSymbol === currentSymbol) ? currentPrice : (window.positionAssetPrice || pendingTrade.signalPrice);
        if (pendingTrade.signalPrice > 0) {
            const priceDiffPct = Math.abs((evalCurrentPrice - pendingTrade.signalPrice) / pendingTrade.signalPrice) * 100;
            if (priceDiffPct > 1.0) {
                logToTerminal(`⚠️ Deslizamiento detectado (${priceDiffPct.toFixed(2)}%). Ejecutando a precio actual: $${evalCurrentPrice.toLocaleString()}`, 'warn');
            }
        }

        if (candleTs > 0) {
            lastHandledCandle = { symbol: tradeSymbol, candleTs };
        }

        logToTerminal('✅ Operación aprobada por el usuario.', 'action');
        executeTrade(pendingTrade.signal, tradeSymbol, pendingTrade.baseCoin, evalCurrentPrice, 'Copiloto');
        pendingTrade = null;
    }
    copilotState = 'idle';
    startAgent('copilot_approved');
    scheduleNext(15000);
});

// Cierre Manual de Emergencia (Bloque 1 item 6, Bloque 4 item 3)
window.forceClosePosition = function(event) {
    if (event) {
        event.stopPropagation?.();
        event.preventDefault?.();
    }
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
        copilotState = 'idle';
        isCopilotApprovalPause = false;

        let activePrice = 0;
        if (pos.symbol === currentSymbol && typeof currentPrice === 'number' && currentPrice > 0) {
            activePrice = currentPrice;
        } else if (typeof window.positionAssetPrice === 'number' && window.positionAssetPrice > 0) {
            activePrice = window.positionAssetPrice;
        } else if (typeof pos.entryPrice === 'number' && pos.entryPrice > 0) {
            activePrice = pos.entryPrice;
        } else {
            activePrice = 1;
        }

        // Liberar mutex para asegurar que la orden manual no sea bloqueada por una verificación concurrente
        isExecutingTrade = false;
        executeTrade('VENDER', pos.symbol, pos.baseCoin, activePrice, 'Manual');
        
        if (isAgentActive) {
            stopAgent('force_close');
            logToTerminal(`Agente detenido automáticamente por cierre manual. Vuelve a activarlo cuando desees.`, 'warn');
        }
    } else {
        logToTerminal(`ℹ️ No hay posición abierta que cerrar.`, 'info');
    }
};
window.cerrarPosicion = window.forceClosePosition;

// Control de Apagado Programado (Graceful Shutdown)
window.toggleStopAfterClose = function() {
    const pos = getOpenPosition();
    if (!pos) {
        logToTerminal('ℹ️ No hay posición abierta sobre la cual programar el apagado.', 'info');
        return;
    }
    isStopAfterCloseArmed = !isStopAfterCloseArmed;
    if (isStopAfterCloseArmed) {
        localStorage.setItem('ai_stop_after_close', 'true');
        logToTerminal(`🛑 [APAGADO PROGRAMADO] Activado: El agente gestionará la salida óptima de ${pos.symbol} (TP/Breakeven/Trailing/SL) y se detendrá automáticamente al cerrar el trade.`, 'action');
    } else {
        localStorage.removeItem('ai_stop_after_close');
        logToTerminal(`ℹ️ [APAGADO PROGRAMADO] Cancelado: El agente continuará operando normalmente tras el cierre de ${pos.symbol}.`, 'info');
    }
    updateCapitalDisplay();
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
    
    // Al primer fondeo con placeholder, recalcular startEquity; si no-placeholder, ajustar startEquity en el mismo monto
    const rState = getRiskState();
    if (rState.books && rState.books[cur]) {
        if (rState.books[cur].placeholder) {
            let actualEquity = portfolio.balances[cur] || 0;
            const openPos = getOpenPosition();
            if (openPos && (openPos.currency === cur || getCurrency(openPos.symbol) === cur)) {
                actualEquity += (openPos.costBasis || (openPos.qty * openPos.entryPrice));
            }
            rState.books[cur].startEquity = actualEquity;
            rState.books[cur].placeholder = false;
        } else {
            rState.books[cur].startEquity = (rState.books[cur].startEquity || 0) + amount;
        }
        saveRiskState(rState);
    }

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
    } else if (value === 'qwen') {
        if(statusBadge) statusBadge.className += "bg-emerald-900 text-emerald-300 border-emerald-500";
        if(orquestadorBox) orquestadorBox.className += "bg-gray-800 border-emerald-500 shadow-emerald-500/20";
        if(brainIcon) brainIcon.style.filter = "drop-shadow(0 0 5px #10b981)";
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
    if (typeof window.purgarMemoriaIA === 'function') {
        window.purgarMemoriaIA(true);
    }
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
            tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-4 text-center text-yellow-400 font-medium bg-yellow-900/10">⏳ Posición activa en curso (${openPos.qty.toFixed(6)} ${escapeHtml(formatAssetLabel(openPos.symbol || openPos.baseCoin))} comprados a $${openPos.entryPrice.toLocaleString()}). Las estadísticas de acierto (Win Rate) y curva se completarán al cerrar la venta.</td></tr>`;
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
                <td class="px-4 py-2 font-bold text-white">${escapeHtml(formatAssetLabel(t.activo))}</td>
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

// --- PROTOCOLO DE PURGA Y CONTROL DE MEMORIA RAM DE OLLAMA ---
window.purgarMemoriaIA = async function(silent = false) {
    if (!silent) logToTerminal("🧹 [PURGA RAM] Desalojando modelos y cancelando tareas en Ollama...", "warn");
    const lobby = document.getElementById("lobbyView");
    const isLobbyVisible = lobby && !lobby.classList.contains("hidden");
    const lobbyReportBox = document.getElementById("lobbyReportBox");
    if (!silent && isLobbyVisible && lobbyReportBox) {
        lobbyReportBox.classList.remove("hidden");
        lobbyReportBox.innerHTML = '<span class="text-yellow-400 font-bold animate-pulse">🧹 Purgando procesos colgados y desalojando modelos de la memoria RAM...</span>';
    }
    try {
        const res = await fetch(`${API_BASE_URL}/api/ollama/purge`, { method: "POST" });
        const data = await res.json();
        const modelsList = (data.unloaded_models && data.unloaded_models.length > 0)
            ? data.unloaded_models.join(", ")
            : "Ninguno en ejecución";
        if (!silent) {
            logToTerminal(`✅ [PURGA RAM] Memoria liberada. Modelos purgados de RAM: ${modelsList}`, "success");
            if (isLobbyVisible && lobbyReportBox) {
                lobbyReportBox.innerHTML = `<span class="text-green-400 font-bold">✅ Memoria RAM liberada con éxito. Modelos desalojados de Ollama: <strong>${escapeHtml(modelsList)}</strong></span>`;
            }
        } else {
            logToTerminal(`🔄 [AUTO-PURGA] Memoria de Ollama liberada para el nuevo motor (${modelsList}).`, "info");
        }
    } catch (err) {
        if (!silent) {
            logToTerminal(`⚠️ [PURGA RAM] Error de conexión al purgar Ollama: ${err.message}`, "error");
            if (isLobbyVisible && lobbyReportBox) {
                lobbyReportBox.innerHTML = `<span class="text-red-400 font-bold">⚠️ Error al purgar memoria: ${escapeHtml(err.message)}</span>`;
            }
        }
    }
};

// --- PRE-MARKET DIGEST LOGIC ---
let premarketAbortController = null;

async function abortPremarketProcess(source = 'lobby') {
    if (premarketAbortController) {
        try {
            premarketAbortController.abort();
        } catch (_) {}
        premarketAbortController = null;
    }
    logToTerminal("🛑 Abortando consulta Pre-Market y liberando memoria RAM...", "warn");
    
    document.getElementById("btnCancelLobbyPremarket")?.classList.add("hidden");
    document.getElementById("btnCancelPremarket")?.classList.add("hidden");

    const btnLobby = document.getElementById("btnLobbyPremarket");
    if (btnLobby) {
        btnLobby.innerHTML = '<span class="animate-pulse">🧠</span> Generar Consenso del Cerebro';
        btnLobby.disabled = false;
    }
    const btnPremkt = document.getElementById("btnPremarket");
    if (btnPremkt) {
        btnPremkt.innerText = "Despertar Cerebro (Pre-Market)";
        btnPremkt.disabled = false;
    }

    const lobbyReportBox = document.getElementById("lobbyReportBox");
    if (lobbyReportBox && source === 'lobby') {
        lobbyReportBox.innerHTML = '<span class="text-red-400 font-bold">🛑 Cancelando proceso y liberando memoria RAM...</span>';
    }

    try {
        const res = await fetch(`${API_BASE_URL}/api/macro/premarket/cancel`, { method: "POST" });
        const data = await res.json();
        logToTerminal(`✅ Pre-Market: ${data.message || 'Memoria RAM liberada'}`, "success");
        if (lobbyReportBox && source === 'lobby') {
            lobbyReportBox.innerHTML = '<span class="text-yellow-400 font-bold">✅ Proceso cancelado. Memoria RAM liberada y modelos descargados con éxito.</span>';
        }
    } catch (e) {
        logToTerminal(`Aviso al cancelar Pre-Market: ${e.message}`, "warn");
    }
}

const btnCancelPremarket = document.getElementById("btnCancelPremarket");
if (btnCancelPremarket) {
    btnCancelPremarket.addEventListener("click", () => abortPremarketProcess('trench'));
}

const btnPremarket = document.getElementById("btnPremarket");
if (btnPremarket) {
    btnPremarket.addEventListener("click", async () => {
        btnPremarket.innerText = "Analizando buzón...";
        btnPremarket.disabled = true;
        
        const btnCancel = document.getElementById("btnCancelPremarket");
        if (btnCancel) btnCancel.classList.remove("hidden");
        
        premarketAbortController = new AbortController();
        const engine = document.getElementById("aiEngineSelect")?.value || document.getElementById("engineSelect")?.value || "ollama";
        
        logToTerminal("Iniciando secuencia de Despertar Pre-Market...", "info");
        
        try {
            const res = await fetch(`${API_BASE_URL}/api/macro/premarket?engine=${engine}`, {
                signal: premarketAbortController.signal
            });
            const data = await res.json();
            
            if (data.status === "cancelled") {
                logToTerminal("Pre-Market: Operación cancelada por el usuario.", "warn");
                btnPremarket.innerText = "Cancelado";
                setTimeout(() => { btnPremarket.innerText = "Despertar Cerebro (Pre-Market)"; btnPremarket.disabled = false; }, 3000);
                return;
            }

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
                    const assetTxt = formatAssetLabel(a.simbolo || 'N/A');
                    const msg = `Consenso [${assetTxt}]: ${a.consenso_direccional || 'NEUTRAL'}. Razón: ${a.razonamiento || '-'}. Autorizado: ${a.autorizar_operacion || false}`;
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
            if (e.name === 'AbortError') {
                logToTerminal("Consulta Pre-Market cancelada.", "warn");
                return;
            }
            logToTerminal(`Error de red al consultar Pre-Market: ${e.message}`, "error");
            btnPremarket.innerText = "Despertar Cerebro (Pre-Market)";
            btnPremarket.disabled = false;
        } finally {
            if (btnCancel) btnCancel.classList.add("hidden");
            premarketAbortController = null;
        }
    });
}
// Mostrar el botón si el toggle de inversiones está activado
if (investmentToggle && btnPremarket) {
    if (investmentToggle.checked) {
        btnPremarket.classList.remove("hidden");
    } else {
        btnPremarket.classList.add("hidden");
    }
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

    
    const btnCancelLobby = document.getElementById("btnCancelLobbyPremarket");
    if (btnCancelLobby) {
        btnCancelLobby.addEventListener("click", () => abortPremarketProcess('lobby'));
    }

    document.getElementById("lobbyEngineSelect")?.addEventListener("change", () => {
        if (typeof window.purgarMemoriaIA === 'function') {
            window.purgarMemoriaIA(true);
        }
    });

    if (btnLobbyPremarket) {
        btnLobbyPremarket.addEventListener("click", async () => {
            btnLobbyPremarket.innerHTML = '<span class="animate-spin">🔄</span> Consultando al Cerebro...';
            btnLobbyPremarket.disabled = true;
            if (btnCancelLobby) btnCancelLobby.classList.remove("hidden");
            
            premarketAbortController = new AbortController();
            const lobbyEngineEl = document.getElementById("lobbyEngineSelect");
            const engine = lobbyEngineEl?.value || "deepseek";
            const engineName = lobbyEngineEl?.options[lobbyEngineEl.selectedIndex]?.text || engine;
            lobbyReportBox.classList.remove("hidden");
            lobbyReportBox.innerHTML = `<span class="text-yellow-400">Consultando a <strong>${escapeHtml(engineName)}</strong> (sin límite de tiempo; puedes pulsar 'Cancelar' en cualquier momento)...</span>`;
            
            try {
                const res = await fetch(`${API_BASE_URL}/api/macro/premarket?engine=${engine}`, {
                    signal: premarketAbortController.signal
                });
                const data = await res.json();
                
                if (data.status === "cancelled") {
                    lobbyReportBox.innerHTML = `<span class="text-yellow-400 font-bold">Proceso cancelado. Memoria RAM liberada y modelos descargados.</span>`;
                } else if (data.status === "error") {
                    lobbyReportBox.innerHTML = `<span class="text-red-400">Error: ${escapeHtml(data.message)}</span>`;
                } else if (data.status === "idle") {
                    lobbyReportBox.innerHTML = `<span class="text-gray-400">${escapeHtml(data.message)}</span>`;
                } else {
                    window.premarketData = data;
                    let html = `<p class="font-bold text-white text-base mb-2">Resumen General:</p>
                                <p class="mb-4 text-green-300">${escapeHtml(data.resumen_general)}</p>
                                <p class="font-bold text-white text-base mb-2">Análisis por Activo:</p><ul class="space-y-2">`;
                        data.activos.forEach(a => {
                            const dir = escapeHtml(a.consenso_direccional);
                            const color = a.consenso_direccional === "ALCISTA" ? "text-green-400 border-green-700/50 bg-green-950/40" : (a.consenso_direccional === "BAJISTA" || a.consenso_direccional === "PELIGRO" ? "text-red-400 border-red-700/50 bg-red-950/40" : "text-yellow-400 border-yellow-700/50 bg-yellow-950/40");
                            const assetFormatted = formatAssetLabel(a.simbolo);
                            html += `<li class="bg-gray-800 p-3 rounded-lg border border-gray-700 shadow-sm">
                                <div class="flex items-center justify-between mb-1.5">
                                    <span class="font-bold text-white text-sm flex items-center gap-1.5">${escapeHtml(assetFormatted)}</span>
                                    <span class="${color} font-bold text-xs uppercase px-2 py-0.5 rounded border">${dir}</span>
                                </div>
                                <span class="text-gray-300 text-xs block leading-relaxed">${escapeHtml((a.razonamiento || '').slice(0, 300))}</span>
                            </li>`;
                        });
                    html += `</ul>`;
                    lobbyReportBox.innerHTML = html;
                }
            } catch (e) {
                if (e.name === 'AbortError') {
                    return; // Ya manejado por abortPremarketProcess
                }
                lobbyReportBox.innerHTML = `<span class="text-red-400">Fallo de red: ${escapeHtml(e.message)}</span>`;
            } finally {
                if (btnCancelLobby) btnCancelLobby.classList.add("hidden");
                premarketAbortController = null;
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

            // Sincronizar el motor IA seleccionado en el lobby con el selector principal
            const chosenEngine = document.getElementById("lobbyEngineSelect")?.value;
            const mainEngineSelect = document.getElementById("engineSelect");
            if (chosenEngine && mainEngineSelect && mainEngineSelect.querySelector(`option[value="${chosenEngine}"]`)) {
                mainEngineSelect.value = chosenEngine;
                mainEngineSelect.dispatchEvent(new Event('change'));
            }
            
            // Inyectar el consenso pre-market en la Caja de Mando para el Orquestador (recortado a 300 caracteres, Bloque 6 item 7)
            const macroInput = document.getElementById('macroContext');
            if (macroInput && window.premarketData && window.premarketData.activos) {
                const assetData = window.premarketData.activos.find(a => a.simbolo === chosenSymbol || chosenSymbol.includes(a.simbolo));
                if (assetData) {
                    const razonamientoTrim = (assetData.razonamiento || '').slice(0, 300);
                    macroInput.value = `Sesgo Pre-Market [${assetData.consenso_direccional}]: ${razonamientoTrim}`;
                } else {
                    const resumenTrim = (window.premarketData.resumen_general || '').slice(0, 300);
                    macroInput.value = `Sesgo Pre-Market General: ${resumenTrim}`;
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

// Prevenir cambio accidental de selectores (ej. Motor IA) al hacer scroll con la rueda del ratón
document.addEventListener('wheel', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'SELECT') {
        document.activeElement.blur();
    }
}, { passive: true });

// ==============================================================================
// // TODO(FASE5):
// - Slippage dinámico y spread en Paper Trading: simular peor ejecución en órdenes de mercado (0.05% de slippage mínimo + spread del orderbook).
// - Soporte multi-posición: transicionar portfolio.position a portfolio.positions (array indexado por symbol) con límites de exposición por activo y global.
// - Event ledger inmutable: migrar historial_trades.csv a SQLite con checksum sha256 encadenado por fila para auditoría de live trading.
// ==============================================================================

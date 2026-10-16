(function (root) {
    function isEligibleMacroDirective(directive, now = Date.now(), maxAgeMs = 24 * 60 * 60 * 1000) {
        if (!directive || typeof directive !== 'object') return false;
        if (typeof directive.asset !== 'string' || !directive.asset.trim()) return false;
        if (typeof directive.text !== 'string' || !directive.text.trim()) return false;
        if (!Number.isFinite(Number(directive.confidence)) || Number(directive.confidence) < 80) return false;
        if (!['oportunidad', 'positivo'].includes(String(directive.type || '').trim().toLowerCase())) return false;

        const timestamp = Date.parse(directive.timestamp);
        const ageMs = now - timestamp;
        return Number.isFinite(timestamp) && ageMs >= 0 && ageMs <= maxAgeMs;
    }

    function matchDirectiveSymbol(asset, symbols) {
        if (typeof asset !== 'string' || !asset.trim() || !Array.isArray(symbols)) return null;
        const canonical = value => String(value).toUpperCase().replace(/[^A-Z0-9=]/g, '');
        const key = canonical(asset);
        const exactMatches = symbols.filter(symbol => canonical(symbol) === key);
        if (exactMatches.length === 1) return exactMatches[0];
        if (exactMatches.length > 1) return null;

        const baseMatches = symbols.filter(symbol => canonical(String(symbol).split(/[/-]/, 1)[0]) === key);
        return baseMatches.length === 1 ? baseMatches[0] : null;
    }

    function isFreshQuote(quote) {
        if (!quote || quote.market_open !== true) return false;
        if (!Number.isFinite(Number(quote.price)) || Number(quote.price) <= 0) return false;
        if (!Number.isFinite(Number(quote.quote_age_s)) || Number(quote.quote_age_s) < 0) return false;
        if (!Number.isFinite(Number(quote.stale_threshold_s)) || Number(quote.stale_threshold_s) <= 0) return false;
        return Number(quote.quote_age_s) <= Number(quote.stale_threshold_s);
    }

    function isWithinSlippage(referencePrice, executionPrice, maxSlippagePct = 1) {
        if (![referencePrice, executionPrice, maxSlippagePct].every(Number.isFinite)) return false;
        if (referencePrice <= 0 || executionPrice <= 0 || maxSlippagePct < 0) return false;
        return Math.abs((executionPrice - referencePrice) / referencePrice) * 100 <= maxSlippagePct;
    }

    function netReturnAfterCosts(grossMovePct, feePct, spreadPct) {
        if (![grossMovePct, feePct, spreadPct].every(Number.isFinite)) return NaN;
        if (grossMovePct <= -100 || feePct < 0 || spreadPct < 0 || feePct >= 100 || spreadPct >= 100) return NaN;
        const entryFactor = (1 + feePct / 100) * (1 + spreadPct / 100);
        const exitFactor = (1 - feePct / 100) * (1 - spreadPct / 100);
        return ((1 + grossMovePct / 100) * exitFactor / entryFactor - 1) * 100;
    }

    function meetsMinimumNetProfit(actualNetPct, minimumNetPct) {
        return Number.isFinite(actualNetPct)
            && Number.isFinite(minimumNetPct)
            && minimumNetPct >= 0
            && actualNetPct >= minimumNetPct;
    }

    function shouldBlockProfitTakingExit(actualNetPct, minimumNetPct) {
        if (!Number.isFinite(actualNetPct) || !Number.isFinite(minimumNetPct) || minimumNetPct < 0) return true;
        return actualNetPct > 0 && !meetsMinimumNetProfit(actualNetPct, minimumNetPct);
    }

    function positionSizeForRiskBudget(accountEquity, stopLossNetPct, riskBudgetPct, maxAllocationPct, availableCapital) {
        if (
            ![accountEquity, stopLossNetPct, riskBudgetPct, maxAllocationPct, availableCapital].every(Number.isFinite)
            || accountEquity <= 0
            || stopLossNetPct >= 0
            || riskBudgetPct <= 0
            || riskBudgetPct > 1
            || maxAllocationPct <= 0
            || maxAllocationPct > 1
            || availableCapital < 0
        ) {
            return NaN;
        }
        const riskSizedAmount = accountEquity * riskBudgetPct / (Math.abs(stopLossNetPct) / 100);
        const allocationCap = accountEquity * maxAllocationPct;
        return Math.min(riskSizedAmount, allocationCap, availableCapital);
    }

    function getCurrency(symbol) {
        if (!symbol) return 'USD';
        const sym = String(symbol);
        if (sym.includes('USDT')) return 'USDT';
        if (sym.includes('.BA')) return 'ARS';
        return 'USD';
    }

    function netPctAtPrice(pos, price, feeRate = 0.1) {
        if (!pos || !Number.isFinite(price) || price <= 0) return 0;
        const effectiveFeeRate = (pos && typeof pos.feeRate === 'number') ? pos.feeRate : feeRate;
        const spreadRate = Number.isFinite(pos.spreadRate) ? pos.spreadRate : 0;
        const costBasis = pos.costBasis || (pos.qty * pos.entryPrice);
        if (!costBasis || costBasis <= 0) return 0;
        const sellFillPrice = price * (1 - (spreadRate / 100));
        const netExitValue = pos.qty * sellFillPrice * (1 - (effectiveFeeRate / 100));
        return ((netExitValue - costBasis) / costBasis) * 100;
    }

    function isAssetMarketOpenAt(symbol, nowDate = new Date()) {
        if (!symbol) return true;
        const sym = String(symbol);
        if (sym.includes('/')) return true;

        const utcDay = nowDate.getUTCDay();
        const utcMinutes = nowDate.getUTCHours() * 60 + nowDate.getUTCMinutes();

        if (utcDay === 0 || utcDay === 6) {
            if (sym.includes('=F') && utcDay === 0 && utcMinutes >= 22 * 60) return true;
            return false;
        }
        if (sym.includes('.BA')) {
            return utcMinutes >= 14 * 60 && utcMinutes < 20 * 60;
        }
        if (!sym.includes('=F')) {
            return utcMinutes >= 13 * 60 + 30 && utcMinutes < 20 * 60;
        }
        return !(utcMinutes >= 21 * 60 && utcMinutes < 22 * 60);
    }

    // Parámetros Centralizados de Estrategia ATR (Argon)
    // Discrepancia documentada: texto narrativo señala Z <= -2.2, tablas/código señalan Z <= -2.0.
    // Se mantiene activamente -2.0 en toda la arquitectura.
    const ATR_STRATEGY_TIMEFRAMES = Object.freeze(["15m", "1h"]);
    const ATR_Z_SCORE_THRESHOLD = -2.0;

    function isAllowedAtrTimeframe(timeframe) {
        if (typeof timeframe !== 'string') return false;
        return ATR_STRATEGY_TIMEFRAMES.includes(timeframe.trim());
    }

    const api = {
        ATR_STRATEGY_TIMEFRAMES,
        ATR_Z_SCORE_THRESHOLD,
        isAllowedAtrTimeframe,
        isEligibleMacroDirective,
        matchDirectiveSymbol,
        isFreshQuote,
        isWithinSlippage,
        netReturnAfterCosts,
        meetsMinimumNetProfit,
        shouldBlockProfitTakingExit,
        positionSizeForRiskBudget,
        getCurrency,
        netPctAtPrice,
        isAssetMarketOpenAt,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.TradingGuards = api;
})(typeof window !== 'undefined' ? window : globalThis);

const test = require('node:test');
const assert = require('node:assert/strict');
const {
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
} = require('../frontend/js/trading_guards.js');

test('ATR strategy constants and timeframe guards enforce 15m and 1h only', () => {
    assert.deepEqual(Array.from(ATR_STRATEGY_TIMEFRAMES), ['15m', '1h']);
    assert.equal(ATR_Z_SCORE_THRESHOLD, -2.0);
    assert.equal(isAllowedAtrTimeframe('15m'), true);
    assert.equal(isAllowedAtrTimeframe('1h'), true);
    assert.equal(isAllowedAtrTimeframe('1m'), false);
    assert.equal(isAllowedAtrTimeframe('5m'), false);
    assert.equal(isAllowedAtrTimeframe(''), false);
    assert.equal(isAllowedAtrTimeframe(null), false);
    assert.equal(isAllowedAtrTimeframe(undefined), false);
});

test('macro directives need positive impact, confidence, and age within 24 hours', () => {
    const now = Date.parse('2026-10-15T12:00:00Z');
    const directive = {
        asset: 'BTC/USDT',
        text: 'Tesis',
        type: 'Oportunidad',
        confidence: 80,
        timestamp: '2026-10-15T11:00:00Z',
    };

    assert.equal(isEligibleMacroDirective(directive, now), true);
    assert.equal(isEligibleMacroDirective({ ...directive, confidence: 79 }, now), false);
    assert.equal(isEligibleMacroDirective({ ...directive, type: 'Peligro' }, now), false);
    assert.equal(isEligibleMacroDirective({ ...directive, timestamp: '2026-10-14T11:59:59Z' }, now), false);
    assert.equal(isEligibleMacroDirective({ ...directive, timestamp: '2026-10-15T12:00:01Z' }, now), false);
});

test('directive symbol resolution uses exact unambiguous matches only', () => {
    assert.equal(matchDirectiveSymbol('BTCUSD', ['BTC/USDT', 'BTC-USD']), 'BTC-USD');
    assert.equal(matchDirectiveSymbol('BTC', ['BTC/USDT', 'BTC-USD']), null);
    assert.equal(matchDirectiveSymbol('BTCUSDT', ['BTC/USDT', 'ETH/USDT']), 'BTC/USDT');
    assert.equal(matchDirectiveSymbol('BTC-USD', ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']), 'BTC/USDT');
    assert.equal(matchDirectiveSymbol('ETH-USD', ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']), 'ETH/USDT');
    assert.equal(matchDirectiveSymbol('NOTBTC', ['BTC/USDT']), null);
});

test('execution quotes must be fresh and the market must be open', () => {
    const quote = { price: 100, quote_age_s: 2, stale_threshold_s: 20, market_open: true };
    assert.equal(isFreshQuote(quote), true);
    assert.equal(isFreshQuote({ ...quote, quote_age_s: 21 }), false);
    assert.equal(isFreshQuote({ ...quote, market_open: false }), false);
    assert.equal(isFreshQuote({ ...quote, quote_age_s: undefined }), false);
});

test('slippage guard rejects excessive or invalid prices', () => {
    assert.equal(isWithinSlippage(100, 100.5), true);
    assert.equal(isWithinSlippage(100, 101.01), false);
    assert.equal(isWithinSlippage(0, 100), false);
});

test('net target accounts for entry and exit fee and estimated spread', () => {
    const net = netReturnAfterCosts(3, 0.1, 0.05);
    assert.ok(net > 2.6 && net < 2.8);
    assert.ok(netReturnAfterCosts(3, 0.5, 0.05) < net);
    assert.ok(netReturnAfterCosts(-2, 0.1, 0.05) < -2);
});

test('minimum net profit gate blocks undersized gains but allows loss exits', () => {
    assert.equal(meetsMinimumNetProfit(0.15, 0.15), true);
    assert.equal(meetsMinimumNetProfit(0.14, 0.15), false);
    assert.equal(meetsMinimumNetProfit(-0.1, 0.15), false);
    assert.equal(meetsMinimumNetProfit(Number.NaN, 0.15), false);
    assert.equal(meetsMinimumNetProfit(0.5, -0.1), false);
    assert.equal(shouldBlockProfitTakingExit(0.14, 0.15), true);
    assert.equal(shouldBlockProfitTakingExit(0.15, 0.15), false);
    assert.equal(shouldBlockProfitTakingExit(0, 0.15), false);
    assert.equal(shouldBlockProfitTakingExit(-0.1, 0.15), false);
    assert.equal(shouldBlockProfitTakingExit(Number.NaN, 0.15), true);
});

test('ATR risk sizing caps planned loss, allocation, and available capital', () => {
    assert.equal(positionSizeForRiskBudget(1000, -2, 0.5, 0.5, 1000), 500);
    assert.equal(positionSizeForRiskBudget(1000, -1, 0.5, 0.25, 1000), 250);
    assert.equal(positionSizeForRiskBudget(1000, -2, 0.5, 1, 100), 100);
    assert.equal(Number.isNaN(positionSizeForRiskBudget(1000, 0, 0.5, 0.5, 1000)), true);
});

test('ATR sizing interprets the configured 0.25% risk budget as a fraction', () => {
    assert.equal(positionSizeForRiskBudget(10000, -2, 0.0025, 1, 10000), 1250);
});

test('getCurrency maps crypto, Argentine equities, and US equities accurately', () => {
    assert.equal(getCurrency('BTC/USDT'), 'USDT');
    assert.equal(getCurrency('GGAL.BA'), 'ARS');
    assert.equal(getCurrency('SPY'), 'USD');
    assert.equal(getCurrency(''), 'USD');
});

test('netPctAtPrice deducts exit fee and spread from position costBasis', () => {
    const posNoSpread = { qty: 0.999, entryPrice: 100, costBasis: 100, feeRate: 0.1, spreadRate: 0 };
    assert.ok(netPctAtPrice(posNoSpread, 100.30, 0.1) > 0.05);
    assert.ok(netPctAtPrice(posNoSpread, 100.05, 0.1) < 0.05);

    const posWithSpread = { qty: 0.999, entryPrice: 100, costBasis: 100, feeRate: 0.1, spreadRate: 0.05 };
    assert.ok(netPctAtPrice(posWithSpread, 100.40, 0.1) > 0.05);
    assert.ok(netPctAtPrice(posWithSpread, 100.30, 0.1) < netPctAtPrice(posNoSpread, 100.30, 0.1));
});

test('isAssetMarketOpenAt enforces trading hours per market class', () => {
    const wednesdayOpenUtc = new Date('2026-10-14T15:00:00Z');
    const saturdayUtc = new Date('2026-10-17T15:00:00Z');
    assert.equal(isAssetMarketOpenAt('BTC/USDT', saturdayUtc), true);
    assert.equal(isAssetMarketOpenAt('SPY', wednesdayOpenUtc), true);
    assert.equal(isAssetMarketOpenAt('SPY', saturdayUtc), false);
    assert.equal(isAssetMarketOpenAt('GGAL.BA', wednesdayOpenUtc), true);
    assert.equal(isAssetMarketOpenAt('GGAL.BA', saturdayUtc), false);
});

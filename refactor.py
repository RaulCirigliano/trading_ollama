import re

with open("app.js", "r") as f:
    js = f.read()

# Replace portfolio initialization
old_portfolio_init = """let portfolio = JSON.parse(localStorage.getItem('ai_portfolio')) || {
    USDT: 100.00,
    ASSET: 0,
    entryPrice: 0,
    VAULT: 0
};"""
new_portfolio_init = """let portfolio = JSON.parse(localStorage.getItem('ai_portfolio_v2')) || {
    balances: {
        USDT: 100.00,
        USD: 1000.00,
        ARS: 500000.00
    },
    ASSET: 0,
    entryPrice: 0,
    VAULT: 0
};

function getCurrency(symbol) {
    if (!symbol) return 'USD';
    if (symbol.includes('USDT')) return 'USDT';
    if (symbol.includes('.BA')) return 'ARS';
    return 'USD';
}"""
js = js.replace(old_portfolio_init, new_portfolio_init)

# Replace sanity checks
old_sanity = """if (typeof portfolio.USDT !== 'number' || isNaN(portfolio.USDT)) portfolio.USDT = 100.00;"""
new_sanity = """if (!portfolio.balances) portfolio.balances = { USDT: 100, USD: 1000, ARS: 500000 };
if (typeof portfolio.balances.USDT !== 'number' || isNaN(portfolio.balances.USDT)) portfolio.balances.USDT = 100.00;
if (typeof portfolio.balances.USD !== 'number' || isNaN(portfolio.balances.USD)) portfolio.balances.USD = 1000.00;
if (typeof portfolio.balances.ARS !== 'number' || isNaN(portfolio.balances.ARS)) portfolio.balances.ARS = 500000.00;"""
js = js.replace(old_sanity, new_sanity)

# Replace updateCapitalDisplay to show correct total and fiat sign
js = js.replace("let total = portfolio.USDT + (portfolio.ASSET * currentPrice);", "let currency = getCurrency(currentSymbol);\n    let total = portfolio.balances[currency] + (portfolio.ASSET * currentPrice);")

js = js.replace("portfolio.USDT -= 100.00;", "portfolio.balances[currency] -= 100.00;")
js = js.replace("document.getElementById('capitalDisplay').innerText = `$${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;", """const currencySymbols = { 'USDT': 'USDT', 'USD': 'USD', 'ARS': 'ARS' };
    const curSym = currencySymbols[currency] || '$';
    document.getElementById('capitalDisplay').innerText = `$${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${curSym}`;""")

# In the paper trading check (line ~289)
js = js.replace("const isBuyable = data.signal === 'COMPRAR' && portfolio.USDT > 10;", "const isBuyable = data.signal === 'COMPRAR' && portfolio.balances[getCurrency(currentSymbol)] > 10;")

# In executeTrade function
js = js.replace("const maxRiesgo = portfolio.USDT * riskFactor;", "const currency = getCurrency(currentSymbol);\n        const maxRiesgo = portfolio.balances[currency] * riskFactor;")
js = js.replace("portfolio.USDT -= tradeAmount;", "portfolio.balances[currency] -= tradeAmount;")
js = js.replace("portfolio.USDT += dolaresObtenidos;", "const currency = getCurrency(currentSymbol);\n        portfolio.balances[currency] += dolaresObtenidos;")
js = js.replace("Nuevo Saldo USDT: $${portfolio.USDT.toFixed(2)}", "Nuevo Saldo ${currency}: $${portfolio.balances[currency].toFixed(2)}")

# Save portfolio
js = js.replace("localStorage.setItem('ai_portfolio', JSON.stringify(portfolio));", "localStorage.setItem('ai_portfolio_v2', JSON.stringify(portfolio));")
js = js.replace("localStorage.removeItem('ai_portfolio');", "localStorage.removeItem('ai_portfolio_v2');")

# Inyectar capital
js = js.replace("portfolio.USDT += amount;", "portfolio.balances[getCurrency(currentSymbol)] += amount;")

with open("app.js", "w") as f:
    f.write(js)

print("Done refactoring app.js")

import re

with open("app.js", "r") as f:
    js = f.read()

# Replace the vault display updating logic in updateCapitalDisplay
old_vault_update = """    // Actualizar Bóveda en UI
    const vaultDisplay = document.getElementById('vaultDisplay');
    if (vaultDisplay) vaultDisplay.innerText = `$${portfolio.VAULT.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    const botCapDisplay = document.getElementById('botCapitalDisplay');
    if (botCapDisplay) botCapDisplay.innerText = `$${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;"""

new_vault_update = """    // Actualizar Billeteras en UI
    const vaultDisplay = document.getElementById('vaultDisplay');
    if (vaultDisplay) vaultDisplay.innerText = `$${portfolio.VAULT.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    const usdtDisp = document.getElementById('walletUsdtDisplay');
    if (usdtDisp) usdtDisp.innerText = `$${portfolio.balances.USDT.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    const usdDisp = document.getElementById('walletUsdDisplay');
    if (usdDisp) usdDisp.innerText = `$${portfolio.balances.USD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    const arsDisp = document.getElementById('walletArsDisplay');
    if (arsDisp) arsDisp.innerText = `$${portfolio.balances.ARS.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;"""

js = js.replace(old_vault_update, new_vault_update)

with open("app.js", "w") as f:
    f.write(js)

print("Done updating displays in app.js")

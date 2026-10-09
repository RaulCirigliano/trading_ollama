import re

with open("index.html", "r") as f:
    html = f.read()

# Replace top nav capital display
old_nav_capital = """<span class="text-gray-400 text-sm hidden md:inline">Patrimonio (Simulación):</span>
            <span id="capitalDisplay" class="font-mono text-green-400 hidden md:inline">$100.00</span>"""
new_nav_capital = """<span class="text-gray-400 text-sm hidden md:inline">Billetera Activa:</span>
            <span id="capitalDisplay" class="font-mono text-green-400 hidden md:inline font-bold px-2 py-1 bg-gray-900 rounded border border-gray-700">$100.00</span>"""
html = html.replace(old_nav_capital, new_nav_capital)

# Replace Bóveda Section with Multi-Wallet Section
old_vault_section = """<!-- Gestión de Bóveda y Aislamiento -->
            <div class="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700">
                <h2 class="text-lg font-semibold mb-4 border-b border-gray-700 pb-2 flex items-center">
                    <span class="mr-2">🏦</span> Bóveda de Seguridad
                </h2>
                <div class="space-y-3 text-sm">
                    <div class="flex justify-between items-center">
                        <span class="text-gray-400">Capital Asignado al Bot:</span>
                        <span id="botCapitalDisplay" class="font-mono text-white font-bold">$100.00</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-gray-400">Ganancias Aseguradas:</span>
                        <span id="vaultDisplay" class="font-mono text-green-400 font-bold">$0.00</span>
                    </div>
                    <div class="mt-3 pt-3 border-t border-gray-700 flex flex-col space-y-2">
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="autoVaultToggle" checked class="sr-only peer">
                            <div class="w-7 h-4 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-green-500"></div>
                            <span class="ml-2 text-xs text-gray-400">Auto-Transferir ganancias al duplicar ($200)</span>
                        </label>
                        <button onclick="window.inyectarCapital(50)" class="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded border border-gray-600 transition w-full text-center">
                            💸 Inyectar +$50 al Bot (Interés Compuesto)
                        </button>
                    </div>
                </div>
            </div>"""

new_vault_section = """<!-- Sistema Multi-Divisa (Billeteras) -->
            <div class="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700">
                <h2 class="text-lg font-semibold mb-4 border-b border-gray-700 pb-2 flex items-center">
                    <span class="mr-2">💼</span> Mis Billeteras (Simulación)
                </h2>
                <div class="space-y-3 text-sm">
                    <div class="flex justify-between items-center bg-gray-900 p-2 rounded">
                        <span class="text-gray-400">🏦 Cripto (USDT):</span>
                        <span id="walletUsdtDisplay" class="font-mono text-white font-bold">$100.00</span>
                    </div>
                    <div class="flex justify-between items-center bg-gray-900 p-2 rounded">
                        <span class="text-gray-400">🏛️ Wall Street (USD):</span>
                        <span id="walletUsdDisplay" class="font-mono text-white font-bold">$1,000.00</span>
                    </div>
                    <div class="flex justify-between items-center bg-gray-900 p-2 rounded">
                        <span class="text-gray-400">🇦🇷 Local (ARS):</span>
                        <span id="walletArsDisplay" class="font-mono text-white font-bold">$500,000.00</span>
                    </div>
                    <div class="flex justify-between items-center mt-2 border-t border-gray-700 pt-2">
                        <span class="text-gray-400">Bóveda Asegurada:</span>
                        <span id="vaultDisplay" class="font-mono text-green-400 font-bold">$0.00</span>
                    </div>
                    <div class="mt-3 pt-3 border-t border-gray-700 flex flex-col space-y-2">
                        <button onclick="window.inyectarCapital(50)" class="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded border border-gray-600 transition w-full text-center">
                            💸 Inyectar liquidez a la Billetera Activa
                        </button>
                    </div>
                </div>
            </div>"""
html = html.replace(old_vault_section, new_vault_section)

with open("index.html", "w") as f:
    f.write(html)

print("Done refactoring index.html")

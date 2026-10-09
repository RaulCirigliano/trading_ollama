import re

with open("index.html", "r") as f:
    html = f.read()

old_arg = """                    <option class="bg-gray-800 text-yellow-400 font-bold" disabled>-- Mercado Argentino --</option>
                    <option class="bg-gray-800" value="GGAL.BA">Grupo Financiero Galicia (ARS)</option>"""

new_arg = """                    <option class="bg-gray-800 text-yellow-400 font-bold" disabled>-- Mercado Argentino --</option>
                    <option class="bg-gray-800" value="GGAL.BA">Grupo Financiero Galicia (GGAL)</option>
                    <option class="bg-gray-800" value="YPFD.BA">YPF / Vaca Muerta (YPFD)</option>
                    <option class="bg-gray-800" value="PAMP.BA">Pampa Energía (PAMP)</option>
                    <option class="bg-gray-800" value="BMA.BA">Banco Macro (BMA)</option>
                    <option class="bg-gray-800" value="ALUA.BA">Aluar Aluminio (ALUA)</option>
                    <option class="bg-gray-800" value="TXAR.BA">Ternium Argentina (TXAR)</option>"""

html = html.replace(old_arg, new_arg)

with open("index.html", "w") as f:
    f.write(html)

print("Added Argentine stocks to index.html")

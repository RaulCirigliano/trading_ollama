import re
import os

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML_FILE = os.path.join(PROJECT_ROOT, "frontend", "index.html")
JS_FILE = os.path.join(PROJECT_ROOT, "frontend", "js", "app.js")

with open(HTML_FILE, "r", encoding="utf-8") as f:
    html_content = f.read()

with open(JS_FILE, "r", encoding="utf-8") as f:
    js_content = f.read()

# Extraer IDs del HTML
html_ids = set(re.findall(r'id=["\']([^"\']+)["\']', html_content))

# Extraer getElementById del JS
js_ids = set(re.findall(r'getElementById\(["\']([^"\']+)["\']\)', js_content))

# IDs buscados por JS que no existen en el HTML
missing_in_html = sorted(list(js_ids - html_ids))

print(f"Total IDs definidos en index.html: {len(html_ids)}")
print(f"Total getElementById referenciados en app.js: {len(js_ids)}")
print("\n--- IDs buscados en JS pero ausentes en HTML ---")
if missing_in_html:
    for mid in missing_in_html:
        print(f" - {mid}")
else:
    print("✅ 100% de coincidencia: todos los IDs referenciados en app.js existen en index.html.")

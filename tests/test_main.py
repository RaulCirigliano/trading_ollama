import sys, os, json
sys.path.append(os.path.join(os.getcwd(), 'backend'))
from main import get_history
import math

try:
    data = get_history(symbol="BTC/USDT", timeframe="1m", limit=20)
    if isinstance(data, dict):
        print(data)
    else:
        for row in data:
            for k,v in row.items():
                if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                    print(f"BAD VALUE IN {k}: {v}")
        print("Data OK. First row:", data[0])
        print("Last row:", data[-1])
except Exception as e:
    print("Exception", e)

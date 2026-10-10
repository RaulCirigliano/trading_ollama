import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))
from main import get_history

try:
    data = get_history(symbol="BTC/USDT", timeframe="1h", limit=30)
    if isinstance(data, dict) and "error" in data:
        print("Error in API:", data)
    else:
        print("Data length:", len(data))
        print("Last item:", data[-1])
        # Check if vwap_upper is in any item
        has_upper = any("vwap_upper" in d for d in data)
        print("Has vwap_upper:", has_upper)
except Exception as e:
    print("Exception:", e)

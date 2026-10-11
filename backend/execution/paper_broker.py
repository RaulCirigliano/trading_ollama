from typing import Dict, Any, List, Optional
from backend.execution.broker_base import BrokerAdapter

class PaperBrokerAdapter(BrokerAdapter):
    """
    Implementación simulada (Paper Trading) de la interfaz BrokerAdapter.
    Diseñada como andamiaje estructural para Fase 5.
    No conectada a los endpoints activos del sistema.
    """

    def __init__(self, initial_vault_usd: float = 500.0):
        self.vault_usd = initial_vault_usd
        self.balances = {"USDT": 0.0, "USD": 0.0, "ARS": 0.0}
        self.positions: Dict[str, Dict[str, Any]] = {}
        self.orders: Dict[str, Dict[str, Any]] = {}

    def place_entry(self, symbol: str, side: str, qty: float, order_type: str = "MARKET", price: Optional[float] = None) -> Dict[str, Any]:
        """Simula la colocación de una orden de entrada en memoria."""
        return {
            "status": "simulated",
            "symbol": symbol,
            "side": side,
            "qty": qty,
            "price": price or 0.0,
            "order_type": order_type
        }

    def place_protection(self, symbol: str, qty: float, stop_loss_price: float, take_profit_price: float) -> Dict[str, Any]:
        """Simula el armado de una orden bracket / OCO de protección."""
        return {
            "status": "simulated",
            "symbol": symbol,
            "qty": qty,
            "stop_loss": stop_loss_price,
            "take_profit": take_profit_price
        }

    def amend_protection(self, protection_order_id: str, new_stop_price: float, new_tp_price: Optional[float] = None) -> Dict[str, Any]:
        """Simula la actualización de stop price por breakeven o trailing."""
        return {
            "status": "simulated",
            "order_id": protection_order_id,
            "new_stop": new_stop_price,
            "new_tp": new_tp_price
        }

    def cancel_protection(self, protection_order_id: str) -> bool:
        """Simula la cancelación de una orden de protección."""
        return True

    def flatten(self, symbol: str) -> Dict[str, Any]:
        """Simula el cierre de emergencia a mercado."""
        return {
            "status": "simulated_flattened",
            "symbol": symbol
        }

    def fetch_open_orders(self, symbol: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retorna órdenes abiertas simuladas."""
        return []

    def fetch_positions(self) -> List[Dict[str, Any]]:
        """Retorna posiciones abiertas simuladas."""
        return list(self.positions.values())

    def fetch_balances(self) -> Dict[str, float]:
        """Retorna saldos simulados."""
        return dict(self.balances)

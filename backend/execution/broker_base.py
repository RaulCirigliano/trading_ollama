from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional

class BrokerAdapter(ABC):
    """
    Interfaz abstracta estandarizada para adaptadores de brokers (Fase 5).
    Define los métodos obligatorios para ejecutar órdenes de entrada,
    mecanismos de protección (OCO/Bracket), cierres de emergencia y consulta de saldos.
    """

    @abstractmethod
    def place_entry(self, symbol: str, side: str, qty: float, order_type: str = "MARKET", price: Optional[float] = None) -> Dict[str, Any]:
        """
        Envía una orden de entrada al mercado.
        Retorna los metadatos de la orden generada por el broker.
        """
        pass

    @abstractmethod
    def place_protection(self, symbol: str, qty: float, stop_loss_price: float, take_profit_price: float) -> Dict[str, Any]:
        """
        Coloca una orden OCO o bracket de protección vinculada a una posición abierta.
        Debe ejecutarse en un plazo estricto de N segundos tras el fill de entrada.
        """
        pass

    @abstractmethod
    def amend_protection(self, protection_order_id: str, new_stop_price: float, new_tp_price: Optional[float] = None) -> Dict[str, Any]:
        """
        Modifica dinámicamente el precio de stop loss para Breakeven o Trailing Stop.
        """
        pass

    @abstractmethod
    def cancel_protection(self, protection_order_id: str) -> bool:
        """
        Cancela una orden de protección activa.
        """
        pass

    @abstractmethod
    def flatten(self, symbol: str) -> Dict[str, Any]:
        """
        Cierre de emergencia a mercado para liquidar toda posición activa en el símbolo.
        """
        pass

    @abstractmethod
    def fetch_open_orders(self, symbol: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Consulta las órdenes actualmente abiertas y no ejecutadas.
        """
        pass

    @abstractmethod
    def fetch_positions(self) -> List[Dict[str, Any]]:
        """
        Consulta las posiciones actualmente abiertas reportadas por el broker.
        """
        pass

    @abstractmethod
    def fetch_balances(self) -> Dict[str, float]:
        """
        Consulta los saldos disponibles por divisa (USDT, USD, ARS).
        """
        pass

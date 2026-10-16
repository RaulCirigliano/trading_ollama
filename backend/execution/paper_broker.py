from typing import Dict, Any, List, Optional
import uuid
from backend.execution.broker_base import BrokerAdapter
from backend.db.ledger import LedgerStore, symbol_to_currency


class PaperBrokerAdapter(BrokerAdapter):
    """
    Implementación transaccional de Paper Trading sobre BrokerAdapter (Fase 5).
    Respaldada por LedgerStore (SQLite de doble partida):
    - Aislamiento por defecto: Billeteras operativas en $0.00.
    - Just-In-Time Funding (ALLOCATE) al abrir entrada.
    - Sweep-Back Automático (SWEEP_BACK) al cerrar o liquidar por flatten().
    """

    def __init__(
        self,
        initial_vault_usd: float = 500.0,
        db_path: str = ":memory:",
        fee_pct: float = 0.10,
    ):
        self.vault_usd = initial_vault_usd
        self.fee_pct = fee_pct
        self.ledger = LedgerStore(
            db_path=db_path,
            initial_vault={
                "USDT": initial_vault_usd,
                "USD": initial_vault_usd,
                "ARS": initial_vault_usd * 1000.0,
            },
        )
        self.protection_orders: Dict[str, Dict[str, Any]] = {}

    @property
    def balances(self) -> Dict[str, float]:
        """Retorna los saldos actuales de las billeteras operativas (en reposo siempre $0.0)."""
        return self.ledger.get_omnibus_balances()["operational"]

    @property
    def vault_balances(self) -> Dict[str, float]:
        """Retorna los saldos actuales de la Bóveda Central por divisa."""
        return self.ledger.get_omnibus_balances()["vault"]

    def place_entry(
        self,
        symbol: str,
        side: str,
        qty: float,
        order_type: str = "MARKET",
        price: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Ejecuta una orden de entrada simulada con fondeo Just-In-Time desde la Bóveda.
        """
        exec_price = float(price or 0.0)
        if exec_price <= 0:
            return {
                "status": "simulated",
                "symbol": symbol,
                "side": side,
                "qty": qty,
                "price": 0.0,
                "order_type": order_type,
            }

        fee_amount = round(qty * exec_price * (self.fee_pct / 100.0), 8)
        trade_info = self.ledger.open_trade_with_jit(
            symbol=symbol,
            qty=qty,
            entry_price=exec_price,
            fee_amount=fee_amount,
            side="LONG" if side.upper() in ("BUY", "LONG") else "SHORT",
        )
        return {
            "status": "FILLED",
            "trade_id": trade_info["trade_id"],
            "order_id": trade_info["order_id"],
            "symbol": symbol,
            "side": side.upper(),
            "qty": qty,
            "price": exec_price,
            "fee_amount": fee_amount,
            "allocated_jit": trade_info["allocated_jit"],
            "order_type": order_type,
        }

    def place_protection(
        self,
        symbol: str,
        qty: float,
        stop_loss_price: float,
        take_profit_price: float,
    ) -> Dict[str, Any]:
        """Coloca una orden bracket / OCO de protección vinculada a la posición abierta."""
        if stop_loss_price <= 0 or take_profit_price <= 0 or stop_loss_price >= take_profit_price:
            # Si la protección es inválida o rechazada, protocolo obligatorio: flatten inmediato
            self.flatten(symbol, current_price=max(stop_loss_price, 1.0))
            raise ValueError("Orden de protección inválida; posición cerrada por seguridad (flatten).")

        order_id = f"oco-{uuid.uuid4().hex[:12]}"
        order_data = {
            "order_id": order_id,
            "status": "NEW",
            "symbol": symbol,
            "qty": qty,
            "stop_loss": stop_loss_price,
            "take_profit": take_profit_price,
        }
        self.protection_orders[order_id] = order_data
        return order_data

    def amend_protection(
        self,
        protection_order_id: str,
        new_stop_price: float,
        new_tp_price: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Actualiza dinámicamente el stop price por Breakeven o Trailing Stop."""
        order = self.protection_orders.get(protection_order_id)
        if order:
            order["stop_loss"] = new_stop_price
            if new_tp_price is not None:
                order["take_profit"] = new_tp_price
        return {
            "status": "AMENDED" if order else "simulated",
            "order_id": protection_order_id,
            "new_stop": new_stop_price,
            "new_tp": new_tp_price,
        }

    def cancel_protection(self, protection_order_id: str) -> bool:
        """Cancela una orden de protección activa."""
        order = self.protection_orders.pop(protection_order_id, None)
        if order:
            order["status"] = "CANCELLED"
        return True

    def flatten(self, symbol: str, current_price: Optional[float] = None) -> Dict[str, Any]:
        """
        Cierre de emergencia a mercado: liquida la posición abierta en `symbol`
        y ejecuta el Sweep-Back inmediato a la Bóveda.
        """
        open_positions = [p for p in self.ledger.get_open_positions() if p["symbol"] == symbol]
        # Cancelar cualquier protección activa del símbolo
        for oid, odata in list(self.protection_orders.items()):
            if odata.get("symbol") == symbol:
                self.protection_orders.pop(oid, None)

        if not open_positions:
            return {"status": "simulated_flattened", "symbol": symbol, "closed": False}

        pos = open_positions[0]
        exit_px = float(current_price if current_price and current_price > 0 else pos["entry_price"])
        qty = float(pos["qty"])
        exit_fee = round(qty * exit_px * (self.fee_pct / 100.0), 8)
        sweep_res = self.ledger.close_trade_with_sweep(
            symbol=symbol,
            exit_price=exit_px,
            exit_fee_amount=exit_fee,
            exit_reason="EMERGENCY_FLATTEN",
        )
        return {
            "status": "simulated_flattened",
            "symbol": symbol,
            "closed": True,
            "exit_price": exit_px,
            "net_pnl": sweep_res["net_pnl"],
            "swept_to_vault": sweep_res["swept_to_vault"],
            "operational_balance": sweep_res["operational_balance"],
            "vault_balance": sweep_res["vault_balance"],
        }

    def fetch_open_orders(self, symbol: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retorna las órdenes de protección actualmente activas."""
        if symbol:
            return [o for o in self.protection_orders.values() if o.get("symbol") == symbol]
        return list(self.protection_orders.values())

    def fetch_positions(self) -> List[Dict[str, Any]]:
        """Retorna las posiciones actualmente abiertas en el Ledger."""
        return self.ledger.get_open_positions()

    def fetch_balances(self) -> Dict[str, float]:
        """Retorna saldos operativos actuales."""
        return dict(self.balances)

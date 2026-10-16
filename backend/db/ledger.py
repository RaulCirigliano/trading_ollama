"""
Motor Contable Transaccional de Doble Partida (SQLite) - Arquitectura Cuentas Ómnibus.
Implementa las directivas estrictas de GEMINI.md y CONTEXTO.md (Sección 6.1 y 6.5):
1. Aislamiento por defecto: Billeteras operativas (USDT, USD, ARS) inician siempre en $0.00.
2. Just-In-Time Funding (ALLOCATE): Transferencia exacta de Bóveda a Billetera Operativa al abrir un trade.
3. Sweep-Back Automático (SWEEP_BACK): Al cerrar posición, capital base + PnL neto regresan inmediatamente a la Bóveda,
   restaurando la Billetera Operativa a $0.00.
4. Invariante de Doble Partida: Toda transacción en ledger_txns exige SUM(amount) == 0.0 en ledger_entries.
5. Circuit Breaker Transaccional: Pérdidas consecutivas (>= 3) o Drawdown diario (>= 3%) en SQLite.
"""

from __future__ import annotations

import math
import os
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCHEMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")
DEFAULT_DB_PATH = os.path.join(PROJECT_ROOT, "trading_ledger.sqlite3")

SUPPORTED_CURRENCIES = ("USDT", "USD", "ARS")


def symbol_to_currency(symbol: str) -> str:
    """Determina la divisa contable asociada a un símbolo soportado."""
    sym = str(symbol or "").strip().upper()
    if sym.endswith(".BA"):
        return "ARS"
    if "/USDT" in sym or sym.endswith("USDT"):
        return "USDT"
    return "USD"


class LedgerStore:
    """
    Almacén transaccional en SQLite para Cuentas Ómnibus, Trades, Órdenes, Fills y Circuit Breaker.
    """

    def __init__(
        self,
        db_path: Optional[str] = None,
        initial_vault: Optional[Dict[str, float]] = None,
    ):
        self.db_path = db_path or os.getenv("TRADING_LEDGER_DB_PATH") or DEFAULT_DB_PATH
        self._lock = threading.RLock()
        self._memory_conn: Optional[sqlite3.Connection] = None
        if self.db_path == ":memory:":
            self._memory_conn = sqlite3.connect(":memory:", check_same_thread=False)
            self._memory_conn.row_factory = sqlite3.Row
            self._memory_conn.execute("PRAGMA foreign_keys = ON;")

        default_vault = {"USDT": 500.0, "USD": 500.0, "ARS": 500_000.0}
        if initial_vault:
            for k, v in initial_vault.items():
                if k in SUPPORTED_CURRENCIES and math.isfinite(float(v)) and float(v) >= 0:
                    default_vault[k] = float(v)
        self._initial_vault = default_vault
        self._initialize_database()

    def _connect(self) -> sqlite3.Connection:
        if self._memory_conn is not None:
            return self._memory_conn
        conn = sqlite3.connect(self.db_path, timeout=15.0, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        return conn

    def _initialize_database(self) -> None:
        with self._lock:
            with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
                schema_sql = f.read()

            conn = self._connect()
            try:
                with conn:
                    conn.executescript(schema_sql)
                    self._seed_accounts_and_vault(conn)
            finally:
                if self._memory_conn is None:
                    conn.close()

    def _seed_accounts_and_vault(self, conn: sqlite3.Connection) -> None:
        """
        Crea las cuentas contables estándar para cada divisa y deposita el capital inicial
        exclusivamente en las cuentas VAULT (Billeteras Operativas siempre en $0.00).
        """
        today_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        for currency in SUPPORTED_CURRENCIES:
            accounts = [
                (f"EXTERNAL_TREASURY_{currency}", f"Tesorería Externa {currency}", "VAULT", currency),
                (f"VAULT_{currency}", f"Bóveda Central {currency}", "VAULT", currency),
                (f"OP_{currency}", f"Billetera Operativa {currency}", "OPERATIONAL", currency),
                (f"FEES_{currency}", f"Comisiones Pagadas {currency}", "EXPENSE_FEES", currency),
                (f"PNL_{currency}", f"Resultados Realizados {currency}", "PNL", currency),
            ]
            for acc_id, name, acc_type, curr in accounts:
                conn.execute(
                    "INSERT OR IGNORE INTO accounts (id, name, type, currency) VALUES (?, ?, ?, ?)",
                    (acc_id, name, acc_type, curr),
                )

            # Si la bóveda no tiene ningún asiento previo, realizar depósito fundacional en doble partida
            row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM ledger_entries WHERE account_id = ?",
                (f"VAULT_{currency}",),
            ).fetchone()
            initial_amount = self._initial_vault.get(currency, 0.0)
            if row["cnt"] == 0 and initial_amount > 0:
                self._record_double_entry_tx(
                    conn=conn,
                    description=f"Fondeo inicial de Bóveda ({currency})",
                    ref_type="DEPOSIT",
                    ref_id="INITIAL_SEED",
                    currency=currency,
                    entries=[
                        (f"EXTERNAL_TREASURY_{currency}", -initial_amount),
                        (f"VAULT_{currency}", +initial_amount),
                    ],
                )

            conn.execute(
                """
                INSERT OR IGNORE INTO risk_state (
                    book_currency, day_key, start_equity, realized_pnl, consecutive_losses, halted_until, halt_reason
                ) VALUES (?, ?, ?, 0.0, 0, NULL, NULL)
                """,
                (currency, today_key, max(initial_amount, 1.0)),
            )

    def _record_double_entry_tx(
        self,
        conn: sqlite3.Connection,
        description: str,
        ref_type: str,
        ref_id: Optional[str],
        currency: str,
        entries: List[tuple[str, float]],
    ) -> str:
        """
        Inserta una transacción contable de doble partida verificando que la suma algebraica sea 0.0.
        """
        if not entries or len(entries) < 2:
            raise ValueError("Una transacción de doble partida requiere al menos 2 asientos.")

        total_sum = sum(float(amount) for _, amount in entries)
        if abs(total_sum) > 1e-6:
            raise ValueError(
                f"Violación de invariante de doble partida ({ref_type}): suma={total_sum:.8f} != 0"
            )

        txn_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO ledger_txns (id, description, ref_type, ref_id) VALUES (?, ?, ?, ?)",
            (txn_id, description, ref_type, ref_id),
        )
        for account_id, amount in entries:
            if not math.isfinite(float(amount)):
                raise ValueError(f"Monto no finito para cuenta {account_id}")
            conn.execute(
                """
                INSERT INTO ledger_entries (id, txn_id, account_id, amount, currency)
                VALUES (?, ?, ?, ?, ?)
                """,
                (str(uuid.uuid4()), txn_id, account_id, round(float(amount), 8), currency),
            )
        return txn_id

    def _get_account_balance_conn(self, conn: sqlite3.Connection, account_id: str) -> float:
        row = conn.execute(
            "SELECT COALESCE(SUM(amount), 0.0) AS bal FROM ledger_entries WHERE account_id = ?",
            (account_id,),
        ).fetchone()
        return round(float(row["bal"]), 8) if row else 0.0

    def get_account_balance(self, account_id: str) -> float:
        with self._lock:
            conn = self._connect()
            try:
                return self._get_account_balance_conn(conn, account_id)
            finally:
                if self._memory_conn is None:
                    conn.close()

    def get_omnibus_balances(self) -> Dict[str, Dict[str, float]]:
        """
        Retorna los saldos actuales de la Bóveda (VAULT), Billeteras Operativas (OPERATIONAL),
        Comisiones acumuladas (FEES) y PnL realizado (PNL) por cada divisa.
        """
        with self._lock:
            conn = self._connect()
            try:
                result: Dict[str, Dict[str, float]] = {
                    "vault": {},
                    "operational": {},
                    "fees_paid": {},
                    "realized_pnl": {},
                }
                for curr in SUPPORTED_CURRENCIES:
                    result["vault"][curr] = self._get_account_balance_conn(conn, f"VAULT_{curr}")
                    result["operational"][curr] = self._get_account_balance_conn(conn, f"OP_{curr}")
                    result["fees_paid"][curr] = self._get_account_balance_conn(conn, f"FEES_{curr}")
                    # En contabilidad, la cuenta PNL se debita cuando el usuario gana (+ en VAULT, - en PNL)
                    # Invertimos el signo para presentar el PnL neto ganado/perdido de forma intuitiva
                    pnl_acct = self._get_account_balance_conn(conn, f"PNL_{curr}")
                    result["realized_pnl"][curr] = round(-pnl_acct, 8)
                return result
            finally:
                if self._memory_conn is None:
                    conn.close()

    def allocate_jit(self, currency: str, amount: float, ref_id: Optional[str] = None) -> str:
        """
        Just-In-Time Funding: transfiere exactamente `amount` desde VAULT_{currency}
        hacia OP_{currency} verificando disponibilidad de fondos.
        """
        if currency not in SUPPORTED_CURRENCIES:
            raise ValueError(f"Divisa no soportada: {currency}")
        if not math.isfinite(amount) or amount <= 0:
            raise ValueError("El monto de fondeo JIT debe ser finito y positivo.")

        with self._lock:
            conn = self._connect()
            try:
                with conn:
                    vault_bal = self._get_account_balance_conn(conn, f"VAULT_{currency}")
                    if vault_bal + 1e-8 < amount:
                        raise ValueError(
                            f"Fondos insuficientes en Bóveda ({currency}): disponible={vault_bal:.4f}, requerido={amount:.4f}"
                        )
                    return self._record_double_entry_tx(
                        conn=conn,
                        description=f"Fondeo Just-In-Time desde Bóveda ({currency})",
                        ref_type="ALLOCATE",
                        ref_id=ref_id,
                        currency=currency,
                        entries=[
                            (f"VAULT_{currency}", -round(amount, 8)),
                            (f"OP_{currency}", +round(amount, 8)),
                        ],
                    )
            finally:
                if self._memory_conn is None:
                    conn.close()

    def sweep_back(
        self,
        currency: str,
        gross_pnl: float = 0.0,
        total_fees: float = 0.0,
        ref_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Sweep-Back Automático:
        1. Asienta el PnL bruto y las comisiones en la billetera operativa (`OP_{currency}`).
        2. Transfiere inmediatamente la totalidad del saldo resultante de `OP_{currency}`
           de regreso a `VAULT_{currency}`, dejando la billetera operativa en exactamente $0.00.
        """
        if currency not in SUPPORTED_CURRENCIES:
            raise ValueError(f"Divisa no soportada: {currency}")
        if not (math.isfinite(gross_pnl) and math.isfinite(total_fees)) or total_fees < 0:
            raise ValueError("Parámetros de PnL o comisión inválidos en Sweep-Back.")

        with self._lock:
            conn = self._connect()
            try:
                with conn:
                    # 1. Registrar PnL bruto realizado si es distinto de cero
                    if abs(gross_pnl) > 1e-8:
                        self._record_double_entry_tx(
                            conn=conn,
                            description=f"Resultado bruto de operación ({currency})",
                            ref_type="PNL_REALIZED",
                            ref_id=ref_id,
                            currency=currency,
                            entries=[
                                (f"PNL_{currency}", -round(gross_pnl, 8)),
                                (f"OP_{currency}", +round(gross_pnl, 8)),
                            ],
                        )

                    # 2. Registrar comisiones pagadas si son mayores a cero
                    if total_fees > 1e-8:
                        self._record_double_entry_tx(
                            conn=conn,
                            description=f"Comisiones round-trip de broker ({currency})",
                            ref_type="TRADE_FEE",
                            ref_id=ref_id,
                            currency=currency,
                            entries=[
                                (f"OP_{currency}", -round(total_fees, 8)),
                                (f"FEES_{currency}", +round(total_fees, 8)),
                            ],
                        )

                    # 3. Barrer todo el saldo remanente de la billetera operativa a la Bóveda
                    op_balance = self._get_account_balance_conn(conn, f"OP_{currency}")
                    sweep_tx_id = None
                    swept_amount = 0.0
                    if op_balance > 1e-8:
                        swept_amount = op_balance
                        sweep_tx_id = self._record_double_entry_tx(
                            conn=conn,
                            description=f"Sweep-Back automático a Bóveda ({currency})",
                            ref_type="SWEEP_BACK",
                            ref_id=ref_id,
                            currency=currency,
                            entries=[
                                (f"OP_{currency}", -round(op_balance, 8)),
                                (f"VAULT_{currency}", +round(op_balance, 8)),
                            ],
                        )
                    elif op_balance < -1e-8:
                        # Si la pérdida superó el capital asignado, absorber desde la Bóveda para restaurar OP a 0.0
                        deficit = abs(op_balance)
                        sweep_tx_id = self._record_double_entry_tx(
                            conn=conn,
                            description=f"Cobertura de déficit operativo desde Bóveda ({currency})",
                            ref_type="SWEEP_BACK",
                            ref_id=ref_id,
                            currency=currency,
                            entries=[
                                (f"VAULT_{currency}", -round(deficit, 8)),
                                (f"OP_{currency}", +round(deficit, 8)),
                            ],
                        )

                    final_op = self._get_account_balance_conn(conn, f"OP_{currency}")
                    final_vault = self._get_account_balance_conn(conn, f"VAULT_{currency}")
                    return {
                        "sweep_tx_id": sweep_tx_id,
                        "swept_amount": round(swept_amount, 8),
                        "operational_balance": final_op,
                        "vault_balance": final_vault,
                    }
            finally:
                if self._memory_conn is None:
                    conn.close()

    def check_circuit_breaker(self, currency: str, now_ts: Optional[int] = None) -> Dict[str, Any]:
        """Verifica si el libro de una divisa se encuentra detenido por el Circuit Breaker."""
        if currency not in SUPPORTED_CURRENCIES:
            raise ValueError(f"Divisa no soportada: {currency}")
        now_val = int(now_ts if now_ts is not None else time.time())
        today_key = datetime.fromtimestamp(now_val, tz=timezone.utc).strftime("%Y-%m-%d")

        with self._lock:
            conn = self._connect()
            try:
                with conn:
                    row = conn.execute(
                        "SELECT * FROM risk_state WHERE book_currency = ?", (currency,)
                    ).fetchone()
                    if not row:
                        return {"halted": False, "reason": None, "consecutive_losses": 0, "realized_pnl": 0.0}

                    halted_until = row["halted_until"]
                    if halted_until and now_val < int(halted_until):
                        return {
                            "halted": True,
                            "halted_until": int(halted_until),
                            "reason": row["halt_reason"],
                            "consecutive_losses": int(row["consecutive_losses"]),
                            "realized_pnl": float(row["realized_pnl"]),
                        }

                    # Si expiró el halt o cambió el día UTC, reiniciar contadores diarios
                    if (halted_until and now_val >= int(halted_until)) or row["day_key"] != today_key:
                        vault_now = self._get_account_balance_conn(conn, f"VAULT_{currency}")
                        op_now = self._get_account_balance_conn(conn, f"OP_{currency}")
                        equity_now = max(vault_now + op_now, 1.0)
                        conn.execute(
                            """
                            UPDATE risk_state
                            SET day_key = ?, start_equity = ?, realized_pnl = 0.0,
                                consecutive_losses = 0, halted_until = NULL, halt_reason = NULL,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE book_currency = ?
                            """,
                            (today_key, equity_now, currency),
                        )
                        return {"halted": False, "reason": None, "consecutive_losses": 0, "realized_pnl": 0.0}

                    return {
                        "halted": False,
                        "halted_until": None,
                        "reason": None,
                        "consecutive_losses": int(row["consecutive_losses"]),
                        "realized_pnl": float(row["realized_pnl"]),
                    }
            finally:
                if self._memory_conn is None:
                    conn.close()

    def _update_risk_on_close(
        self,
        conn: sqlite3.Connection,
        currency: str,
        net_pnl: float,
        now_ts: Optional[int] = None,
    ) -> Dict[str, Any]:
        now_val = int(now_ts if now_ts is not None else time.time())
        row = conn.execute(
            "SELECT * FROM risk_state WHERE book_currency = ?", (currency,)
        ).fetchone()
        if not row:
            return {"halted": False}

        consecutive_losses = int(row["consecutive_losses"]) + 1 if net_pnl < 0 else 0
        realized_pnl = round(float(row["realized_pnl"]) + float(net_pnl), 8)
        start_equity = max(float(row["start_equity"]), 1.0)
        drawdown_pct = abs(min(0.0, realized_pnl)) / start_equity * 100.0 if realized_pnl < 0 else 0.0

        halted_until = None
        halt_reason = None
        if consecutive_losses >= 3:
            halted_until = now_val + 86_400
            halt_reason = f"3 pérdidas consecutivas alcanzadas ({consecutive_losses})."
        elif drawdown_pct >= 3.0:
            halted_until = now_val + 86_400
            halt_reason = f"Drawdown diario máximo alcanzado ({drawdown_pct:.2f}% >= 3.00%)."

        conn.execute(
            """
            UPDATE risk_state
            SET realized_pnl = ?, consecutive_losses = ?, halted_until = ?, halt_reason = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE book_currency = ?
            """,
            (realized_pnl, consecutive_losses, halted_until, halt_reason, currency),
        )

        if halted_until:
            conn.execute(
                """
                INSERT INTO risk_events (id, book_currency, event_type, reason, details)
                VALUES (?, ?, 'CIRCUIT_BREAKER_TRIGGERED', ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    currency,
                    halt_reason,
                    f"net_pnl={net_pnl:.4f}, realized_pnl={realized_pnl:.4f}, drawdown_pct={drawdown_pct:.2f}%",
                ),
            )

        return {
            "halted": halted_until is not None,
            "halted_until": halted_until,
            "reason": halt_reason,
            "consecutive_losses": consecutive_losses,
            "realized_pnl": realized_pnl,
            "drawdown_pct": round(drawdown_pct, 4),
        }

    def reset_circuit_breaker(self, currency: Optional[str] = None) -> None:
        """Permite al operador reiniciar manualmente el Circuit Breaker."""
        targets = [currency] if currency in SUPPORTED_CURRENCIES else list(SUPPORTED_CURRENCIES)
        today_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        with self._lock:
            conn = self._connect()
            try:
                with conn:
                    for curr in targets:
                        conn.execute(
                            """
                            UPDATE risk_state
                            SET day_key = ?, realized_pnl = 0.0, consecutive_losses = 0,
                                halted_until = NULL, halt_reason = NULL, updated_at = CURRENT_TIMESTAMP
                            WHERE book_currency = ?
                            """,
                            (today_key, curr),
                        )
                        conn.execute(
                            """
                            INSERT INTO risk_events (id, book_currency, event_type, reason, details)
                            VALUES (?, ?, 'RESET', 'Reinicio manual por el operador', NULL)
                            """,
                            (str(uuid.uuid4()), curr),
                        )
            finally:
                if self._memory_conn is None:
                    conn.close()

    def open_trade_with_jit(
        self,
        symbol: str,
        qty: float,
        entry_price: float,
        fee_amount: float = 0.0,
        initial_tp_pct: float = 3.0,
        initial_sl_pct: float = 2.0,
        side: str = "LONG",
        now_ts: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Ejecuta atómicamente:
        1. Verificación del Circuit Breaker.
        2. Fondeo Just-In-Time (VAULT -> OP) por el costo base + comisión de entrada.
        3. Inserción del trade en estado OPEN (protegido por índice único `one_open_trade_per_symbol`).
        4. Registro de la orden ENTRY y su fill inicial.
        """
        if qty <= 0 or entry_price <= 0 or fee_amount < 0:
            raise ValueError("Parámetros de entrada inválidos para abrir trade.")

        currency = symbol_to_currency(symbol)
        cb_status = self.check_circuit_breaker(currency, now_ts=now_ts)
        if cb_status["halted"]:
            raise RuntimeError(f"Circuit Breaker activo en {currency}: {cb_status['reason']}")

        cost_basis = round(qty * entry_price, 8)
        required_jit = round(cost_basis + fee_amount, 8)
        trade_id = str(uuid.uuid4())
        order_id = str(uuid.uuid4())
        fill_id = str(uuid.uuid4())

        with self._lock:
            conn = self._connect()
            try:
                with conn:
                    vault_bal = self._get_account_balance_conn(conn, f"VAULT_{currency}")
                    if vault_bal + 1e-8 < required_jit:
                        raise ValueError(
                            f"Saldo insuficiente en Bóveda {currency} para JIT: disponible={vault_bal:.4f}, requerido={required_jit:.4f}"
                        )

                    # 1. Fondeo Just-In-Time (VAULT -> OP)
                    self._record_double_entry_tx(
                        conn=conn,
                        description=f"JIT Allocation para compra de {symbol}",
                        ref_type="ALLOCATE",
                        ref_id=trade_id,
                        currency=currency,
                        entries=[
                            (f"VAULT_{currency}", -required_jit),
                            (f"OP_{currency}", +required_jit),
                        ],
                    )

                    # 2. Si hay comisión de entrada, devengarla de OP a FEES
                    if fee_amount > 1e-8:
                        self._record_double_entry_tx(
                            conn=conn,
                            description=f"Comisión de entrada en {symbol}",
                            ref_type="TRADE_FEE",
                            ref_id=trade_id,
                            currency=currency,
                            entries=[
                                (f"OP_{currency}", -round(fee_amount, 8)),
                                (f"FEES_{currency}", +round(fee_amount, 8)),
                            ],
                        )

                    # 3. Crear registro en tabla `trades`
                    conn.execute(
                        """
                        INSERT INTO trades (
                            id, symbol, currency, side, status, qty, entry_price,
                            cost_basis, total_fees, initial_tp_pct, initial_sl_pct,
                            current_stop_net_pct, peak_price
                        ) VALUES (?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            trade_id,
                            symbol,
                            currency,
                            side,
                            qty,
                            entry_price,
                            cost_basis,
                            round(fee_amount, 8),
                            initial_tp_pct,
                            initial_sl_pct,
                            -abs(initial_sl_pct),
                            entry_price,
                        ),
                    )

                    # 4. Registrar orden y fill de entrada
                    conn.execute(
                        """
                        INSERT INTO orders (
                            id, trade_id, client_order_id, symbol, side, type, role, qty, price, status
                        ) VALUES (?, ?, ?, ?, 'BUY', 'MARKET', 'ENTRY', ?, ?, 'FILLED')
                        """,
                        (order_id, trade_id, f"entry-{trade_id[:12]}", symbol, qty, entry_price),
                    )
                    conn.execute(
                        """
                        INSERT INTO fills (id, order_id, symbol, qty, price, fee_amount, fee_currency)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (fill_id, order_id, symbol, qty, entry_price, round(fee_amount, 8), currency),
                    )

                    return {
                        "trade_id": trade_id,
                        "order_id": order_id,
                        "symbol": symbol,
                        "currency": currency,
                        "qty": qty,
                        "entry_price": entry_price,
                        "cost_basis": cost_basis,
                        "allocated_jit": required_jit,
                        "status": "OPEN",
                    }
            except sqlite3.IntegrityError as exc:
                raise ValueError(
                    f"Ya existe una posición abierta para {symbol} (invariante one_open_trade_per_symbol)."
                ) from exc
            finally:
                if self._memory_conn is None:
                    conn.close()

    def close_trade_with_sweep(
        self,
        symbol: str,
        exit_price: float,
        exit_fee_amount: float = 0.0,
        exit_reason: str = "TAKE_PROFIT_OR_MANUAL",
        now_ts: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Cierra la posición activa en `symbol`, contabiliza el PnL y comisiones en doble partida,
        ejecuta el Sweep-Back automático a la Bóveda (dejando OP en $0.00) y actualiza el Circuit Breaker.
        """
        if exit_price <= 0 or exit_fee_amount < 0:
            raise ValueError("Precio o comisión de salida inválidos.")

        with self._lock:
            conn = self._connect()
            try:
                with conn:
                    trade = conn.execute(
                        "SELECT * FROM trades WHERE symbol = ? AND status = 'OPEN'",
                        (symbol,),
                    ).fetchone()
                    if not trade:
                        raise ValueError(f"No existe posición abierta para {symbol}.")

                    trade_id = trade["id"]
                    currency = trade["currency"]
                    qty = float(trade["qty"])
                    entry_price = float(trade["entry_price"])
                    entry_fee = float(trade["total_fees"])

                    gross_pnl = round((exit_price - entry_price) * qty, 8)
                    total_fees = round(entry_fee + exit_fee_amount, 8)
                    net_pnl = round(gross_pnl - total_fees, 8)

                    # 1. Registrar PnL bruto realizado en OP
                    if abs(gross_pnl) > 1e-8:
                        self._record_double_entry_tx(
                            conn=conn,
                            description=f"PnL bruto al cerrar {symbol}",
                            ref_type="PNL_REALIZED",
                            ref_id=trade_id,
                            currency=currency,
                            entries=[
                                (f"PNL_{currency}", -gross_pnl),
                                (f"OP_{currency}", +gross_pnl),
                            ],
                        )

                    # 2. Registrar comisión de salida si corresponde
                    if exit_fee_amount > 1e-8:
                        self._record_double_entry_tx(
                            conn=conn,
                            description=f"Comisión de salida en {symbol}",
                            ref_type="TRADE_FEE",
                            ref_id=trade_id,
                            currency=currency,
                            entries=[
                                (f"OP_{currency}", -round(exit_fee_amount, 8)),
                                (f"FEES_{currency}", +round(exit_fee_amount, 8)),
                            ],
                        )

                    # 3. Sweep-Back de la totalidad del saldo operativo de vuelta a la Bóveda
                    op_balance = self._get_account_balance_conn(conn, f"OP_{currency}")
                    swept_amount = 0.0
                    if op_balance > 1e-8:
                        swept_amount = op_balance
                        self._record_double_entry_tx(
                            conn=conn,
                            description=f"Sweep-Back a Bóveda tras cerrar {symbol}",
                            ref_type="SWEEP_BACK",
                            ref_id=trade_id,
                            currency=currency,
                            entries=[
                                (f"OP_{currency}", -round(op_balance, 8)),
                                (f"VAULT_{currency}", +round(op_balance, 8)),
                            ],
                        )
                    elif op_balance < -1e-8:
                        deficit = abs(op_balance)
                        self._record_double_entry_tx(
                            conn=conn,
                            description=f"Cobertura de déficit operativo tras cerrar {symbol}",
                            ref_type="SWEEP_BACK",
                            ref_id=trade_id,
                            currency=currency,
                            entries=[
                                (f"VAULT_{currency}", -round(deficit, 8)),
                                (f"OP_{currency}", +round(deficit, 8)),
                            ],
                        )

                    # 4. Cancelar órdenes de protección abiertas vinculadas al trade
                    conn.execute(
                        """
                        UPDATE orders
                        SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
                        WHERE trade_id = ? AND status IN ('NEW', 'PARTIALLY_FILLED')
                        """,
                        (trade_id,),
                    )

                    # 5. Actualizar estado del trade a CLOSED
                    conn.execute(
                        """
                        UPDATE trades
                        SET status = 'CLOSED', exit_price = ?, realized_pnl = ?,
                            total_fees = ?, exit_reason = ?, closed_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (exit_price, net_pnl, total_fees, exit_reason, trade_id),
                    )

                    # 6. Actualizar Circuit Breaker
                    risk_update = self._update_risk_on_close(
                        conn=conn, currency=currency, net_pnl=net_pnl, now_ts=now_ts
                    )

                    return {
                        "trade_id": trade_id,
                        "symbol": symbol,
                        "currency": currency,
                        "exit_price": exit_price,
                        "gross_pnl": gross_pnl,
                        "total_fees": total_fees,
                        "net_pnl": net_pnl,
                        "swept_to_vault": round(swept_amount, 8),
                        "operational_balance": self._get_account_balance_conn(conn, f"OP_{currency}"),
                        "vault_balance": self._get_account_balance_conn(conn, f"VAULT_{currency}"),
                        "risk_state": risk_update,
                    }
            finally:
                if self._memory_conn is None:
                    conn.close()

    def get_open_positions(self) -> List[Dict[str, Any]]:
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    "SELECT * FROM trades WHERE status = 'OPEN' ORDER BY opened_at ASC"
                ).fetchall()
                return [dict(r) for r in rows]
            finally:
                if self._memory_conn is None:
                    conn.close()

    def verify_double_entry_integrity(self) -> Dict[str, Any]:
        """
        Verifica matemáticamente que todas las transacciones registradas en ledger_txns
        sumen exactamente 0.0 en ledger_entries.
        """
        with self._lock:
            conn = self._connect()
            try:
                imbalanced = conn.execute(
                    """
                    SELECT txn_id, SUM(amount) AS net_sum
                    FROM ledger_entries
                    GROUP BY txn_id
                    HAVING ABS(SUM(amount)) > 1e-6
                    """
                ).fetchall()
                total_txns = conn.execute("SELECT COUNT(*) AS cnt FROM ledger_txns").fetchone()["cnt"]
                return {
                    "valid": len(imbalanced) == 0,
                    "total_transactions": int(total_txns),
                    "imbalanced_transactions": [dict(r) for r in imbalanced],
                }
            finally:
                if self._memory_conn is None:
                    conn.close()


_DEFAULT_LEDGER: Optional[LedgerStore] = None
_DEFAULT_LEDGER_LOCK = threading.Lock()


def get_default_ledger() -> LedgerStore:
    global _DEFAULT_LEDGER
    with _DEFAULT_LEDGER_LOCK:
        if _DEFAULT_LEDGER is None:
            _DEFAULT_LEDGER = LedgerStore()
        return _DEFAULT_LEDGER

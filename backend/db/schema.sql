-- ==============================================================================
-- Schema SQL para Fase 5: Transición de Paper Trading a Cuentas Reales
-- Invariantes contables: Doble partida, auditoría inmutable, estado transaccional
-- ==============================================================================

-- 1. Cuentas Contables (Bóveda Central, Billeteras Operativas, Ganancias, Comisiones)
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('VAULT', 'OPERATIONAL', 'EXPENSE_FEES', 'PNL')),
    currency TEXT NOT NULL CHECK (currency IN ('USDT', 'USD', 'ARS')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Transacciones del Ledger (Cabecera de movimiento atómico JIT y Sweep-Back)
CREATE TABLE IF NOT EXISTS ledger_txns (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    ref_type TEXT NOT NULL CHECK (ref_type IN ('ALLOCATE', 'SWEEP_BACK', 'TRADE_FEE', 'PNL_REALIZED', 'DEPOSIT', 'RESET')),
    ref_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Asientos Contables de Doble Partida (Sum(amount) = 0 por cada txn_id)
CREATE TABLE IF NOT EXISTS ledger_entries (
    id TEXT PRIMARY KEY,
    txn_id TEXT NOT NULL REFERENCES ledger_txns(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    amount REAL NOT NULL, -- Positivo = Crédito, Negativo = Débito
    currency TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Registro de Señales Cuantitativas y de Modelos LLM
CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    engine TEXT NOT NULL, -- local, gemini, deepseek, ollama
    signal TEXT NOT NULL CHECK (signal IN ('COMPRAR', 'VENDER', 'MANTENER', 'ERROR')),
    reason TEXT NOT NULL,
    price REAL NOT NULL,
    timeframe TEXT NOT NULL,
    signal_candle_ts INTEGER NOT NULL,
    data_age_s INTEGER NOT NULL,
    raw_response TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Trades / Posiciones (Un trade agrupa la entrada y sus salidas de protección)
CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    currency TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED', 'CANCELLED')),
    qty REAL NOT NULL,
    entry_price REAL NOT NULL,
    exit_price REAL,
    cost_basis REAL NOT NULL,
    realized_pnl REAL DEFAULT 0.0,
    total_fees REAL DEFAULT 0.0,
    initial_tp_pct REAL NOT NULL,
    initial_sl_pct REAL NOT NULL,
    current_stop_net_pct REAL NOT NULL,
    be_armed INTEGER DEFAULT 0,
    trail_active INTEGER DEFAULT 0,
    peak_price REAL NOT NULL,
    exit_reason TEXT,
    opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP
);

-- Índice único parcial estricto: máximo un trade abierto simultáneo por símbolo
CREATE UNIQUE INDEX IF NOT EXISTS one_open_trade_per_symbol 
ON trades (symbol) 
WHERE status = 'OPEN';

-- 6. Órdenes enviadas al Broker (Mercado, Límite, OCO, Bracket)
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    trade_id TEXT REFERENCES trades(id) ON DELETE SET NULL,
    broker_order_id TEXT,
    client_order_id TEXT UNIQUE NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
    type TEXT NOT NULL CHECK (type IN ('MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT', 'OCO')),
    role TEXT NOT NULL CHECK (role IN ('ENTRY', 'PROTECTION_SL', 'PROTECTION_TP', 'FLATTEN')),
    qty REAL NOT NULL,
    price REAL,
    stop_price REAL,
    status TEXT NOT NULL CHECK (status IN ('NEW', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Ejecuciones / Fills Parciales o Totales
CREATE TABLE IF NOT EXISTS fills (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    broker_fill_id TEXT,
    symbol TEXT NOT NULL,
    qty REAL NOT NULL,
    price REAL NOT NULL,
    fee_amount REAL NOT NULL,
    fee_currency TEXT NOT NULL,
    filled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Estado Persistente de Riesgo y Circuit Breaker
CREATE TABLE IF NOT EXISTS risk_state (
    book_currency TEXT PRIMARY KEY CHECK (book_currency IN ('USDT', 'USD', 'ARS')),
    day_key TEXT NOT NULL,
    start_equity REAL NOT NULL,
    realized_pnl REAL DEFAULT 0.0,
    consecutive_losses INTEGER DEFAULT 0,
    halted_until INTEGER,
    halt_reason TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Historial de Eventos de Riesgo y Paradas de Emergencia
CREATE TABLE IF NOT EXISTS risk_events (
    id TEXT PRIMARY KEY,
    book_currency TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('CIRCUIT_BREAKER_TRIGGERED', 'RESET', 'FEED_STALE', 'KILL_SWITCH')),
    reason TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

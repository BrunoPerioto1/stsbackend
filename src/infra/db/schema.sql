-- Betting Tracker schema
-- Idempotent: safe to re-run against an existing database.

-- === Reference tables ===============================================

CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    permissions JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS results (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO results (id, name) VALUES
    (1, 'WON'),
    (2, 'LOST'),
    (3, 'CANCELED'),
    (4, 'HALF_WON'),
    (5, 'HALF_LOST'),
    (6, 'CASHOUT'),
    (9, 'PENDING')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS transaction_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO transaction_types (id, name) VALUES
    (1, 'DEPOSIT'),
    (2, 'WITHDRAWAL'),
    (3, 'ADJUSTMENT')
ON CONFLICT (id) DO NOTHING;

-- === Users =============================================================

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    role_id INTEGER NOT NULL REFERENCES roles(id),
    telegram_user_id BIGINT,
    stake NUMERIC(12,2),          -- bankroll used to size Telegram-bot bets from a stated %
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- === Bookmakers =========================================================

CREATE TABLE IF NOT EXISTS betting_houses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS house_balances (
    id SERIAL PRIMARY KEY,
    house_id INTEGER NOT NULL REFERENCES betting_houses(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    value NUMERIC(12,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS house_transactions (
    id SERIAL PRIMARY KEY,
    house_id INTEGER NOT NULL REFERENCES betting_houses(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    transaction_type_id INTEGER NOT NULL REFERENCES transaction_types(id) ON DELETE RESTRICT,
    value NUMERIC(12,2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- === Bets ===============================================================

CREATE TABLE IF NOT EXISTS bets (
    id SERIAL PRIMARY KEY,
    game VARCHAR(255) NOT NULL,
    stake DECIMAL(10,2) NOT NULL,
    odd DECIMAL(5,2) NOT NULL,
    house_id INTEGER REFERENCES betting_houses(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    market VARCHAR(255) NOT NULL,
    sport VARCHAR(50) NOT NULL,
    profit NUMERIC(12,2),
    cashout_value NUMERIC(12,2),   -- amount actually received; only set when result = CASHOUT
    bet_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bet_results (
    id SERIAL PRIMARY KEY,
    bet_id INTEGER NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
    result_id INTEGER NOT NULL DEFAULT 9 REFERENCES results(id), -- 9 = PENDING
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- === Indexes ============================================================

CREATE INDEX IF NOT EXISTS idx_bets_bet_time ON bets(bet_time DESC);
CREATE INDEX IF NOT EXISTS idx_bets_house_id ON bets(house_id);
CREATE INDEX IF NOT EXISTS idx_bets_user_id ON bets(user_id);
CREATE INDEX IF NOT EXISTS idx_bet_results_bet_id ON bet_results(bet_id);
CREATE INDEX IF NOT EXISTS idx_bet_results_result_id ON bet_results(result_id);
CREATE INDEX IF NOT EXISTS idx_house_balances_house_id ON house_balances(house_id);
CREATE INDEX IF NOT EXISTS idx_house_balances_user_id ON house_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_house_transactions_house_id ON house_transactions(house_id);
CREATE INDEX IF NOT EXISTS idx_house_transactions_user_id ON house_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_house_transactions_type_id ON house_transactions(transaction_type_id);
CREATE INDEX IF NOT EXISTS idx_house_transactions_created_at ON house_transactions(created_at DESC);

-- === updated_at triggers ===============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_bets_updated_at ON bets;
CREATE TRIGGER update_bets_updated_at
    BEFORE UPDATE ON bets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bet_results_updated_at ON bet_results;
CREATE TRIGGER update_bet_results_updated_at
    BEFORE UPDATE ON bet_results
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_house_transactions_updated_at ON house_transactions;
CREATE TRIGGER update_house_transactions_updated_at
    BEFORE UPDATE ON house_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- === Seed: bookmakers ===================================================
-- A starter list of Brazilian bookmakers. Extend via `POST /house` at runtime.

INSERT INTO betting_houses (name) VALUES
    ('BET365'), ('BETANO'), ('BETFAIR'), ('SUPERBET'), ('PIXBET'),
    ('KTO'), ('ESTRELABET'), ('NOVIBET'), ('SPORTINGBET'), ('RIVALO')
ON CONFLICT (name) DO NOTHING;

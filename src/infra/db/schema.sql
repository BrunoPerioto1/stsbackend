-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS house_transactions CASCADE;
DROP TABLE IF EXISTS transaction_types CASCADE;
DROP TABLE IF EXISTS bet_results CASCADE;
DROP TABLE IF EXISTS bets CASCADE;
DROP TABLE IF EXISTS house_balances CASCADE;
DROP TABLE IF EXISTS house_aliases CASCADE;
DROP TABLE IF EXISTS betting_houses CASCADE;

-- Create a table for transaction types
-- This makes the schema more flexible and scalable
CREATE TABLE IF NOT EXISTS transaction_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

-- Canonical betting houses table
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
    value NUMERIC(12,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create bets table with improved structure
CREATE TABLE IF NOT EXISTS bets (
    id SERIAL PRIMARY KEY,
    game VARCHAR(255) NOT NULL,
    stake DECIMAL(10,2) NOT NULL CHECK (stake > 0),
    odd DECIMAL(5,2) NOT NULL CHECK (odd > 1),
    house_name VARCHAR(100) NOT NULL,
    house_id INTEGER NULL REFERENCES betting_houses(id) ON DELETE SET NULL,
    market VARCHAR(255) NOT NULL,
    sport VARCHAR(50) NOT NULL,
    profit NUMERIC(12,2) NULL,
    bet_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create bet_results table
CREATE TABLE IF NOT EXISTS bet_results (
    id SERIAL PRIMARY KEY,
    bet_id INTEGER NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
    result_id INTEGER NOT NULL DEFAULT 9, -- 9 = PENDING
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create house_transactions table with a foreign key to transaction_types
CREATE TABLE IF NOT EXISTS house_transactions (
    id SERIAL PRIMARY KEY,
    house_id INTEGER NOT NULL REFERENCES betting_houses(id) ON DELETE CASCADE,
    transaction_type_id INTEGER NOT NULL REFERENCES transaction_types(id) ON DELETE RESTRICT,
    value NUMERIC(12,2) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bets_bet_time ON bets(bet_time DESC);
CREATE INDEX IF NOT EXISTS idx_bets_house_name ON bets(house_name);
CREATE INDEX IF NOT EXISTS idx_bets_house_id ON bets(house_id);
CREATE INDEX IF NOT EXISTS idx_bet_results_bet_id ON bet_results(bet_id);
CREATE INDEX IF NOT EXISTS idx_bet_results_result_id ON bet_results(result_id);
CREATE INDEX IF NOT EXISTS idx_house_aliases_house_id ON house_aliases(house_id);
CREATE INDEX IF NOT EXISTS idx_house_balances_house_id ON house_balances(house_id);
CREATE INDEX IF NOT EXISTS idx_house_transactions_house_id ON house_transactions(house_id);
CREATE INDEX IF NOT EXISTS idx_house_transactions_type_id ON house_transactions(transaction_type_id);
CREATE INDEX IF NOT EXISTS idx_house_transactions_created_at ON house_transactions(created_at DESC);

-- Seed some initial transaction types
INSERT INTO transaction_types (name) VALUES
('DEPOSIT'),
('WITHDRAWAL'),
('ADJUSTMENT')
ON CONFLICT DO NOTHING;

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_bets_updated_at 
    BEFORE UPDATE ON bets 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bet_results_updated_at 
    BEFORE UPDATE ON bet_results 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_house_transactions_updated_at 
    BEFORE UPDATE ON house_transactions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust as needed)
-- GRANT ALL PRIVILEGES ON DATABASE betting_tracker TO your_user;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;
-- Database schema for Betting Tracker
-- Run this script in your PostgreSQL database

-- Create database (if not exists)
-- CREATE DATABASE betting_tracker;

-- Connect to the database
-- \c betting_tracker;

-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS aposta_results CASCADE;
DROP TABLE IF EXISTS apostas CASCADE;
DROP TABLE IF EXISTS saldos_casa CASCADE;
DROP TABLE IF EXISTS casas_alias CASCADE;
DROP TABLE IF EXISTS casas_aposta CASCADE;

-- Canonical betting houses table
CREATE TABLE IF NOT EXISTS casas_aposta (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL UNIQUE,
    slug VARCHAR(150) NOT NULL UNIQUE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Aliases for fuzzy/variant matching
CREATE TABLE IF NOT EXISTS casas_alias (
    id SERIAL PRIMARY KEY,
    casa_id INTEGER NOT NULL REFERENCES casas_aposta(id) ON DELETE CASCADE,
    alias VARCHAR(200) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Balances per house
CREATE TABLE IF NOT EXISTS saldos_casa (
    id SERIAL PRIMARY KEY,
    casa_id INTEGER NOT NULL REFERENCES casas_aposta(id) ON DELETE CASCADE,
    valor NUMERIC(12,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create apostas table with improved structure
CREATE TABLE IF NOT EXISTS apostas (
    id SERIAL PRIMARY KEY,
    jogo VARCHAR(255) NOT NULL,
    stake DECIMAL(10,2) NOT NULL CHECK (stake > 0),
    odd DECIMAL(5,2) NOT NULL CHECK (odd > 1),
    casa VARCHAR(100) NOT NULL,
    casa_id INTEGER NULL REFERENCES casas_aposta(id) ON DELETE SET NULL,
    mercado VARCHAR(255) NOT NULL,
    esporte VARCHAR(50) NOT NULL,
    data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create aposta_results table
CREATE TABLE IF NOT EXISTS aposta_results (
    id SERIAL PRIMARY KEY,
    aposta_id INTEGER NOT NULL REFERENCES apostas(id) ON DELETE CASCADE,
    result_id INTEGER NOT NULL DEFAULT 9, -- 9 = PENDENTE
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_apostas_data_hora ON apostas(data_hora DESC);
CREATE INDEX IF NOT EXISTS idx_apostas_casa ON apostas(casa);
CREATE INDEX IF NOT EXISTS idx_apostas_casa_id ON apostas(casa_id);
CREATE INDEX IF NOT EXISTS idx_aposta_results_aposta_id ON aposta_results(aposta_id);
CREATE INDEX IF NOT EXISTS idx_aposta_results_result_id ON aposta_results(result_id);
CREATE INDEX IF NOT EXISTS idx_casas_alias_casa_id ON casas_alias(casa_id);
CREATE INDEX IF NOT EXISTS idx_saldos_casa_casa_id ON saldos_casa(casa_id);

-- Insert sample data (optional)
-- Seed some common houses
INSERT INTO casas_aposta (nome, slug)
VALUES
('Bet365', 'bet365'),
('Betano', 'betano'),
('Betfair', 'betfair')
ON CONFLICT DO NOTHING;

-- Default aliases
INSERT INTO casas_alias (casa_id, alias)
SELECT id, 'bet 365' FROM casas_aposta WHERE slug = 'bet365' ON CONFLICT DO NOTHING;
INSERT INTO casas_alias (casa_id, alias)
SELECT id, 'bet-365' FROM casas_aposta WHERE slug = 'bet365' ON CONFLICT DO NOTHING;
INSERT INTO casas_alias (casa_id, alias)
SELECT id, 'betano brasil' FROM casas_aposta WHERE slug = 'betano' ON CONFLICT DO NOTHING;

-- Sample balances
INSERT INTO saldos_casa (casa_id, valor)
SELECT id, 0 FROM casas_aposta ON CONFLICT DO NOTHING;

INSERT INTO apostas (jogo, stake, odd, casa, mercado, esporte, data_hora) VALUES
('Flamengo x Vasco', 100.00, 2.50, 'Bet365', 'Resultado Final', 'Futebol', NOW()),
('Lakers x Warriors', 50.00, 1.85, 'William Hill', 'Over/Under', 'Basquete', NOW()),
('Nadal x Djokovic', 75.00, 3.20, 'Betfair', 'Vencedor', 'Tênis', NOW())
ON CONFLICT DO NOTHING;

-- Insert corresponding results
INSERT INTO aposta_results (aposta_id, result_id) VALUES
(1, 9), -- PENDENTE
(2, 9), -- PENDENTE
(3, 9)  -- PENDENTE
ON CONFLICT DO NOTHING;

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at for apostas table
CREATE TRIGGER update_apostas_updated_at 
    BEFORE UPDATE ON apostas 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger to automatically update updated_at for aposta_results table
CREATE TRIGGER update_aposta_results_updated_at 
    BEFORE UPDATE ON aposta_results 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust as needed)
-- GRANT ALL PRIVILEGES ON DATABASE betting_tracker TO your_user;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;

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
    min_percent_filter NUMERIC(5,2), -- minimum tip % to forward from the Tips group; NULL = no filter
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Idempotent for pre-existing databases created before this column was added.
ALTER TABLE users ADD COLUMN IF NOT EXISTS min_percent_filter NUMERIC(5,2);

-- Personalização opcional; NULL preserva os padrões de usuários existentes.
ALTER TABLE users ADD COLUMN IF NOT EXISTS dashboard_preferences JSONB;

-- Login lockout. Counted per user in the database, not per IP in memory: the
-- API runs serverless, so an in-process counter resets whenever a request
-- lands on a fresh instance and would never actually lock anyone out.
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;

-- Telegram linking. The code lives in the row, not in the API process: the bot
-- confirms the link on a second request that lands on a different serverless
-- instance, so an in-memory map never had the code by then.
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_link_code VARCHAR(6);
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_link_expires_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMP;

-- Accounts linked before the column existed have no date to show. updated_at is
-- an approximation (any profile change moves it), but it beats leaving the
-- screen with nothing. Guarded by IS NULL so re-running never overwrites a real
-- link date.
UPDATE users
   SET telegram_linked_at = updated_at
 WHERE telegram_user_id IS NOT NULL
   AND telegram_linked_at IS NULL;

-- === Bookmakers =========================================================

CREATE TABLE IF NOT EXISTS betting_houses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Apelidos/variações de nome (ex.: "Superbet Brasil", "Pagol Bet") que o
-- parser de apostas do Telegram deve reconhecer como a mesma casa — usado
-- como candidato extra no fuzzy-match do GrokService além do próprio name.
ALTER TABLE betting_houses ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';

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

-- AI ingestion provenance: NULL means legacy/unknown; do not backfill guesses.
ALTER TABLE bets ADD COLUMN IF NOT EXISTS source VARCHAR(16);
ALTER TABLE bets ADD COLUMN IF NOT EXISTS source_type VARCHAR(16);
ALTER TABLE bets ADD COLUMN IF NOT EXISTS telegram_message_id INTEGER;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
CREATE INDEX IF NOT EXISTS idx_bets_duplicate_candidates ON bets (user_id, house_id, created_at);

-- === Event dates ========================================================
-- `bet_time` is when the bet was placed; it is NOT when the match kicks off.
-- The job in jobs/sofascore fills this cache; the API only reads it. Provider
-- is a column, not a code path: swapping SofaScore out means swapping the job.
CREATE TABLE IF NOT EXISTS sport_events (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(32) NOT NULL,
    external_id VARCHAR(64) NOT NULL,
    sport VARCHAR(32) NOT NULL,
    tournament_name VARCHAR(120),
    -- name/short/code are the provider's own aliases ("Manchester City",
    -- "Man City", "MCI"). The matcher scores against all three.
    home_name VARCHAR(120) NOT NULL,
    home_short VARCHAR(120),
    home_code VARCHAR(16),
    away_name VARCHAR(120) NOT NULL,
    away_short VARCHAR(120),
    away_code VARCHAR(16),
    start_at TIMESTAMP NOT NULL,
    status VARCHAR(24),
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_sport_events_start ON sport_events (start_at);

-- Matched event. NULL everywhere means "no confident match": the bet is still
-- created, it just has no real kickoff time. Never backfilled with a guess.
ALTER TABLE bets ADD COLUMN IF NOT EXISTS event_external_id VARCHAR(64);
ALTER TABLE bets ADD COLUMN IF NOT EXISTS event_provider VARCHAR(32);
ALTER TABLE bets ADD COLUMN IF NOT EXISTS event_start_at TIMESTAMP;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS event_match_confidence NUMERIC(4,3);

-- The job rewrites event_start_at on the bets pointing at a rescheduled event.
CREATE INDEX IF NOT EXISTS idx_bets_event ON bets (event_provider, event_external_id);

-- === Final scores =======================================================
-- Placar de jogo ja' terminado. Tabela separada de sport_events de proposito:
-- aquela e' cache de jogos FUTUROS e se apaga sozinha 2 dias depois do jogo,
-- enquanto o placar precisa sobreviver enquanto houver aposta apontando pra
-- ele. A chave e' a mesma que a aposta ja' guarda (provider + external_id),
-- entao liquidar nao refaz o matching de time — ele ja' foi feito na criacao.
CREATE TABLE IF NOT EXISTS event_results (
    provider VARCHAR(32) NOT NULL,
    external_id VARCHAR(64) NOT NULL,
    -- Tempo normal (90min). O provider tambem expoe o placar com prorrogacao;
    -- mercado de futebol liquida em tempo normal, entao e' este que vale.
    home_score SMALLINT NOT NULL,
    away_score SMALLINT NOT NULL,
    -- Status do provider: so' 'finished' libera liquidacao. 'postponed' e
    -- 'canceled' ficam gravados pra nao rebuscar o mesmo evento toda hora.
    status VARCHAR(24) NOT NULL,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (provider, external_id)
);

-- === Settlement suggestions =============================================
-- Liquidacao NUNCA escreve em bet_results: ela propoe aqui e o usuario
-- confirma na tela de conferencia. Errar um resultado mexe no lucro sem
-- ninguem perceber, entao a decisao continua sendo humana.
CREATE TABLE IF NOT EXISTS bet_settlement_suggestions (
    bet_id INTEGER PRIMARY KEY REFERENCES bets(id) ON DELETE CASCADE,
    -- results(id): 1=WON, 2=LOST, 3=CANCELED (linha inteira empatada numa
    -- aposta simples devolve o stake). NULL = nao deu pra decidir; `reason`
    -- explica.
    suggested_result_id INTEGER REFERENCES results(id),
    -- Codigo curto quando nao ha sugestao (MERCADO_NAO_RECONHECIDO,
    -- FORA_DE_ESCOPO, JOGO_NAO_FINALIZADO, SEM_PLACAR...).
    reason VARCHAR(40),
    -- Frase que a tela mostra: "3 gols no jogo, mais de 2.5". E' o que deixa o
    -- usuario conferir sem abrir a casa de aposta.
    explanation TEXT,
    home_score SMALLINT,
    away_score SMALLINT,
    computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Usuario recusou a sugestao: nao some da lista por acidente na proxima
    -- recomputacao, e nao volta a aparecer.
    dismissed_at TIMESTAMP
);

-- A tela pede sempre o mesmo subconjunto: sugestao decidida e nao recusada.
-- Indexar `suggested_result_id` nao servia pra isso — sao 3 valores possiveis e
-- nenhuma consulta filtra por um deles, so' por IS NOT NULL. Parcial por bet_id
-- deixa o join com bets tocar so' as sugestoes vivas, sem varrer o historico.
DROP INDEX IF EXISTS idx_settlement_pending;
CREATE INDEX IF NOT EXISTS idx_settlement_live
    ON bet_settlement_suggestions (bet_id)
    WHERE dismissed_at IS NULL AND suggested_result_id IS NOT NULL;

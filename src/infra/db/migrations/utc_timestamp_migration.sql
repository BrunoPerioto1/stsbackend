-- Migração para garantir que todas as colunas de timestamp usem UTC

-- Atualiza a coluna bet_time para sempre usar timestamp com time zone (timestamptz)
ALTER TABLE bets ALTER COLUMN bet_time TYPE TIMESTAMPTZ;
ALTER TABLE bets ALTER COLUMN created_at TYPE TIMESTAMPTZ;
ALTER TABLE bets ALTER COLUMN updated_at TYPE TIMESTAMPTZ;

-- Define o valor padrão para usar explicitamente UTC
ALTER TABLE bets ALTER COLUMN bet_time SET DEFAULT NOW() AT TIME ZONE 'UTC';
ALTER TABLE bets ALTER COLUMN created_at SET DEFAULT NOW() AT TIME ZONE 'UTC';
ALTER TABLE bets ALTER COLUMN updated_at SET DEFAULT NOW() AT TIME ZONE 'UTC';

-- Também ajuste as tabelas relacionadas
ALTER TABLE bet_results ALTER COLUMN created_at TYPE TIMESTAMPTZ;
ALTER TABLE bet_results ALTER COLUMN updated_at TYPE TIMESTAMPTZ;
ALTER TABLE bet_results ALTER COLUMN created_at SET DEFAULT NOW() AT TIME ZONE 'UTC';
ALTER TABLE bet_results ALTER COLUMN updated_at SET DEFAULT NOW() AT TIME ZONE 'UTC';

-- Configuração da zona de tempo para a sessão atual e futuras
-- (Opcional, dependendo da configuração do seu servidor PostgreSQL)
SET TIME ZONE 'UTC';

-- Você pode querer adicionar esta configuração ao postgresql.conf:
-- timezone = 'UTC'

-- Converter dados existentes para UTC (se necessário)
-- Isso só é necessário se os dados existentes estiverem em um fuso horário diferente
-- UPDATE bets SET bet_time = bet_time AT TIME ZONE 'UTC';
-- UPDATE bets SET created_at = created_at AT TIME ZONE 'UTC';
-- UPDATE bets SET updated_at = updated_at AT TIME ZONE 'UTC';
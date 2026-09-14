-- Aplicar antes do deploy da API e do job. Não modifica bet_results.
BEGIN;
ALTER TABLE event_results ADD COLUMN IF NOT EXISTS score_scope VARCHAR(24) NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE event_results ADD COLUMN IF NOT EXISTS sport VARCHAR(64);
ALTER TABLE event_results ADD COLUMN IF NOT EXISTS home_name TEXT;
ALTER TABLE event_results ADD COLUMN IF NOT EXISTS away_name TEXT;
ALTER TABLE event_results ALTER COLUMN home_score DROP NOT NULL;
ALTER TABLE event_results ALTER COLUMN away_score DROP NOT NULL;
ALTER TABLE bet_settlement_suggestions ADD COLUMN IF NOT EXISTS engine_version VARCHAR(64);
-- Snapshot por evento: metadados de escopo e completude vivem no payload
-- tipado. Snapshot e placar devem ser gravados na MESMA transação/timestamp.
CREATE TABLE IF NOT EXISTS event_facts (
  provider VARCHAR(32) NOT NULL,
  external_id VARCHAR(64) NOT NULL,
  format_version INTEGER NOT NULL DEFAULT 1,
  data_json JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data_json) = 'object'),
  fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, external_id),
  FOREIGN KEY (provider, external_id) REFERENCES event_results(provider, external_id) ON DELETE CASCADE
);
COMMIT;

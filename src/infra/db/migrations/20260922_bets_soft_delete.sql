-- Aplicar antes do deploy da API e do job de placar (os dois ja' filtram por
-- deleted_at). Coluna nullable sem default: nao reescreve a tabela.
--
-- Apagar aposta passa a so' preencher deleted_at. As filhas (bet_results,
-- bet_events, sugestoes) ficam intactas, entao restaurar e' zerar a coluna:
--   UPDATE bets SET deleted_at = NULL WHERE user_id = <id> AND deleted_at > '<quando>';
BEGIN;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
COMMIT;

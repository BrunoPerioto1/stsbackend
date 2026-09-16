-- Aplicar antes do deploy da API e do job. Não modifica bets nem bet_results.
--
-- Múltipla de vários jogos: um evento por confronto, na ordem em que o
-- confronto aparece no mercado. bets.event_* continua sendo o que era (o jogo
-- que abre a múltipla, ou nada se algum confronto não casou); estas linhas são
-- o que a liquidação e o job de placar precisam pra olhar os OUTROS jogos.
-- Confronto que não casou não tem linha: a posição fica vazia e a perna fica
-- sem placar, nunca com um jogo chutado.
--
-- Gravadas na criação da aposta porque sport_events apaga o jogo 2 dias depois
-- que ele acontece: depois disso não há mais contra o que casar.
BEGIN;
CREATE TABLE IF NOT EXISTS bet_events (
  bet_id INTEGER NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK (position >= 0),
  confronto TEXT NOT NULL,
  provider VARCHAR(32) NOT NULL,
  external_id VARCHAR(64) NOT NULL,
  start_at TIMESTAMP NOT NULL,
  match_confidence NUMERIC(4,3) NOT NULL,
  PRIMARY KEY (bet_id, position)
);
-- O job de placar procura por evento, não por aposta.
CREATE INDEX IF NOT EXISTS idx_bet_events_event ON bet_events (provider, external_id);
COMMIT;

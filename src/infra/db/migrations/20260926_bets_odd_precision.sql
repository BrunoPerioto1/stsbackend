-- Aplicar antes do deploy da API. Reescreve a tabela bets (troca de escala do
-- NUMERIC); com o volume atual e' coisa de segundos.
--
-- DECIMAL(5,2) cortava a odd em 999,99 e arredondava odd de 3 casas (1,855
-- virava 1,86, e o lucro saia com a odd errada). NUMERIC(10,3) cobre odd de
-- multipla longa e as 3 casas que algumas casas mostram. O CHECK (odd > 1)
-- continua valendo.
BEGIN;
ALTER TABLE bets ALTER COLUMN odd TYPE NUMERIC(10,3);
COMMIT;

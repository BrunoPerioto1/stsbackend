-- Aplicar antes do deploy da API: /users/me faz selectAll e a tela de casas
-- le a coluna. Nullable sem default: nao reescreve a tabela.
--
-- Dias sem apostar numa casa (com saldo) ate a lista de casas sugerir saque.
-- NULL = padrao do app (20 dias).
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stale_house_days SMALLINT;
COMMIT;

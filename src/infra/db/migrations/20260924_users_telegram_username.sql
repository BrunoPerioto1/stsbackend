-- Aplicar antes do deploy da API: linkTelegram grava a coluna e /users/me faz
-- selectAll. Nullable sem default: nao reescreve a tabela.
--
-- @usuario do Telegram, so pra exibir no card do app. Nem toda conta tem um
-- (o Telegram deixa sem), entao NULL e normal mesmo com a conta vinculada.
-- O bot atualiza quando o usuario troca o @ ou quando ja era vinculado antes
-- desta coluna existir.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(32);
COMMIT;

-- Aplicar antes do deploy da API: /admin/users e o findById do painel fazem
-- select da coluna. Nullable sem default: nao reescreve a tabela.
--
-- Quando o admin tirou a pessoa do grupo Tips pelo painel (ban no Telegram).
-- NULL = nunca tirado, ou ja convidado de volta. Serve pra tela saber quem esta
-- fora sem perguntar ao Telegram linha a linha.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tips_group_removed_at TIMESTAMP;
COMMIT;

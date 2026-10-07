-- Aplicar antes do deploy da API: /house/all e /house/:id/logo leem as colunas.
-- Nullable sem default: nao reescreve a tabela.
--
-- Avatar da casa guardado no proprio banco (preenchido uma vez com o icone
-- que o Google mostra pro site). A API serve os bytes; o navegador nunca fala com terceiro.
-- logo_updated_at versiona a URL da imagem (cache imutavel no navegador/CDN).
BEGIN;
ALTER TABLE betting_houses ADD COLUMN IF NOT EXISTS logo BYTEA;
ALTER TABLE betting_houses ADD COLUMN IF NOT EXISTS logo_mime TEXT;
ALTER TABLE betting_houses ADD COLUMN IF NOT EXISTS logo_updated_at TIMESTAMP;
COMMIT;

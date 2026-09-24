-- Aplicar antes do deploy da API: a lista de casas e o admin leem a coluna.
-- Nullable sem default: nao reescreve a tabela.
--
-- Site da casa, so' dominio .bet.br (autorizacao federal SPA/MF). A API valida
-- na gravacao; NULL = casa sem link, o botao de abrir o site nao aparece.
BEGIN;
ALTER TABLE betting_houses ADD COLUMN IF NOT EXISTS website_url TEXT;
COMMIT;

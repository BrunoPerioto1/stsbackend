-- Aplicar antes do deploy da API: login, /access e o painel admin passam a ler
-- estas colunas. Nullable (ou com default), nao reescreve a tabela.
--
-- payment_claimed_at: o usuario apertou "Ja paguei" na tela de renovacao. O
--   admin ve no painel quem avisou; liberar o acesso zera a coluna.
-- password_reset_*: codigo de 6 digitos mandado pelo bot pra redefinir a senha.
--   Guarda so' o hash, com validade e contador de erro (5 erros matam o codigo).
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_claimed_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_code_hash VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_attempts SMALLINT NOT NULL DEFAULT 0;
COMMIT;

-- Aplicar antes do deploy da API: login, JWT e fan-out passam a ler a coluna.
-- NULL = acesso sem prazo (admin e contas antigas continuam entrando).
-- Liberar na mao: UPDATE users SET access_until = NOW() + INTERVAL '30 days' WHERE id = <id>;
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_until TIMESTAMP;
COMMIT;

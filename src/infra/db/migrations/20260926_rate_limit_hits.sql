-- Aplicar antes do deploy da API. Tabela nova, nao mexe em nada existente.
--
-- Contador de uso por janela de tempo (parse-image, /vincular). A API roda
-- serverless: contador em memoria zera a cada instancia e nunca chega a
-- barrar ninguem. Sem esta tabela a API deixa passar (fail-open) e loga aviso.
-- Linhas velhas sao apagadas pelo cron diario (/access/cron).
BEGIN;
CREATE TABLE IF NOT EXISTS rate_limit_hits (
  bucket VARCHAR(100) NOT NULL,
  window_start TIMESTAMP NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);
COMMIT;

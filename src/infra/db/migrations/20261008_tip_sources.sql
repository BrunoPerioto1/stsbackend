-- Aplicar antes do deploy da API: o fan-out e as listas de tips leem as colunas.
--
-- Fontes de tips: cada tipster que o repasse copia pro grupo Tips manda num
-- formato. O modelo (template) diz onde está cada campo; a mensagem que um
-- modelo lê vira o card padrão na entrada. Mensagem que nenhum modelo lê segue
-- o caminho de sempre. Formato do JSON: src/tip-sources/tip-template.ts.
--
--   tips.source_id      fonte que leu a tip; NULL = formato padrão. SET NULL
--                       ao apagar a fonte: a tip fica, com o card já traduzido.
--   tips.original_text  a mensagem como o tipster mandou (o text é o card).
--   tip_source_mutes    fonte que o usuário desligou: sem DM, e as pendentes
--                       dela somem das listas. Histórico continua.
BEGIN;

CREATE TABLE IF NOT EXISTS tip_sources (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(60) NOT NULL UNIQUE,
  template    JSONB NOT NULL,
  sample_text TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE tip_sources ENABLE ROW LEVEL SECURITY;

ALTER TABLE tips ADD COLUMN IF NOT EXISTS source_id INT REFERENCES tip_sources(id) ON DELETE SET NULL;
ALTER TABLE tips ADD COLUMN IF NOT EXISTS original_text TEXT;
CREATE INDEX IF NOT EXISTS idx_tips_source_id ON tips (source_id) WHERE source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tip_source_mutes (
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id  INT NOT NULL REFERENCES tip_sources(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, source_id)
);
CREATE INDEX IF NOT EXISTS idx_tip_source_mutes_source ON tip_source_mutes (source_id);
ALTER TABLE tip_source_mutes ENABLE ROW LEVEL SECURITY;

COMMIT;

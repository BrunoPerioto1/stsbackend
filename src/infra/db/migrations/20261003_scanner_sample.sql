-- Amostra do que cada competicao entrega: resumo do ultimo jogo encerrado
-- (estatisticas, lances, escalacao), gravado por jobs/sofascore/amostra.py e
-- mostrado no botao "Dados" da tela /admin/scanner. Resumo, nao o JSON cru:
-- a escalacao crua passa de 100 KB por jogo.
BEGIN;

ALTER TABLE scanner_tournaments ADD COLUMN IF NOT EXISTS sample JSONB;
ALTER TABLE scanner_tournaments ADD COLUMN IF NOT EXISTS sample_at TIMESTAMP;

COMMIT;

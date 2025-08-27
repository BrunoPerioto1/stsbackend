-- Script para adicionar o campo lucro na tabela apostas
-- Execute este script no seu banco PostgreSQL

-- Adicionar campo lucro na tabela apostas
ALTER TABLE apostas ADD COLUMN IF NOT EXISTS lucro DECIMAL(12,2) DEFAULT 0;

-- Criar índice para melhor performance nas consultas de lucro
CREATE INDEX IF NOT EXISTS idx_apostas_lucro ON apostas(lucro);

-- Atualizar apostas existentes com lucro 0 se não tiverem o campo
UPDATE apostas SET lucro = 0 WHERE lucro IS NULL;

-- Comentário sobre o campo
COMMENT ON COLUMN apostas.lucro IS 'Lucro/prejuízo da aposta baseado no resultado (positivo = ganhou, negativo = perdeu, 0 = pendente/empate)';

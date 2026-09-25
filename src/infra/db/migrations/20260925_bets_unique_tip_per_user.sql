-- Aplicar antes do deploy da API. Nao modifica linhas.
--
-- Uma tip vira no maximo uma aposta viva por usuario. O lock do bot era um Set
-- em memoria (nao vale entre instancias da Vercel) e o Planilhar do site
-- consultava e depois inseria: clique duplo gravava duas apostas. O banco
-- passa a recusar a segunda (23505) e a API trata como "ja planilhada".
-- Aposta apagada (deleted_at) sai do indice, entao Desfazer + Planilhar de novo
-- continua funcionando.
--
-- Se o CREATE falhar por duplicata ja existente, esta consulta lista os pares.
-- Decidir qual apagar e' do usuario; nao ha limpeza automatica aqui.
--   SELECT user_id, tip_id, array_agg(id ORDER BY id) AS bet_ids
--   FROM bets
--   WHERE tip_id IS NOT NULL AND deleted_at IS NULL
--   GROUP BY user_id, tip_id
--   HAVING count(*) > 1;
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bets_user_tip
  ON bets (user_id, tip_id)
  WHERE tip_id IS NOT NULL AND deleted_at IS NULL;
COMMIT;

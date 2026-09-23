-- Esporte vira tabela: `bets.sport` era texto livre (IA, bot, formulario) e
-- acumulou 35 grafias ("futebol", "Tenis", "Tênis ", "E-sports", "Esport"...).
--
-- Um trigger normaliza toda escrita em bets.sport: casa o texto contra nome ou
-- apelido de `sports`, grava o nome canonico em `sport` e o id em `sport_id`.
-- Por isso nenhum caminho de insert (app, telegram, tips) precisou mudar.
-- Texto sem correspondencia fica como veio (so' sem espaco sobrando) e
-- sport_id NULL; pra passar a reconhecer, basta um apelido novo:
--   UPDATE sports SET aliases = aliases || 'x1' WHERE name = 'MMA';
--   UPDATE bets SET sport = sport WHERE sport_id IS NULL; -- reprocessa
--
-- Tambem remove house_balances: 0 linhas, saldo e' calculado de
-- house_transactions + lucro das apostas. So' o delete de usuario tocava nela.
BEGIN;

-- Chave de comparacao: sem acento, minusculo, espacos colapsados, sem hifen.
CREATE OR REPLACE FUNCTION sport_key(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(lower(translate(t,
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç-',
    'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc ')), '\s+', ' ', 'g'))
$$;

CREATE TABLE IF NOT EXISTS sports (
  id      SERIAL PRIMARY KEY,
  name    VARCHAR(50) NOT NULL UNIQUE,
  -- ja' na forma de sport_key()
  aliases TEXT[] NOT NULL DEFAULT '{}'
);

INSERT INTO sports (name, aliases) VALUES
  ('Futebol',           '{futebol,soccer,football}'),
  ('Basquete',          '{basquete,basquetebol,basketball,nba}'),
  ('Futebol Americano', '{futebol americano,american football,nfl}'),
  ('Tênis',             '{tenis,tennis}'),
  ('MMA',               '{mma,ufc}'),
  ('Hóquei no Gelo',    '{hoquei no gelo,hoquei,ice hockey,nhl}'),
  ('Beisebol',          '{beisebol,baseball,mlb}'),
  ('eSports',           '{esports,e sports,esport,e sport,cs2,cs,lol,dota,valorant}'),
  ('Fórmula 1',         '{formula 1,f1}'),
  ('Vôlei',             '{volei,voleibol,volleyball}'),
  ('Dardos',            '{dardos,darts}'),
  ('Boxe',              '{boxe,boxing}'),
  ('Sinuca',            '{sinuca,snooker}'),
  -- multipla com esportes diferentes (regra do prompt de extracao)
  ('Vários',            '{varios,futebol e tenis}')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE bets ADD COLUMN IF NOT EXISTS sport_id INT REFERENCES sports(id);

CREATE OR REPLACE FUNCTION bets_normalize_sport() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE s sports%ROWTYPE;
BEGIN
  SELECT * INTO s FROM sports
   WHERE sport_key(name) = sport_key(NEW.sport) OR sport_key(NEW.sport) = ANY(aliases)
   LIMIT 1;
  NEW.sport_id := s.id;
  NEW.sport := COALESCE(s.name, btrim(NEW.sport));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bets_normalize_sport ON bets;
CREATE TRIGGER bets_normalize_sport
  BEFORE INSERT OR UPDATE OF sport ON bets
  FOR EACH ROW EXECUTE FUNCTION bets_normalize_sport();

-- Backfill: dispara o trigger nas linhas existentes. O trigger de updated_at
-- fica desligado pra nao marcar as 11k apostas como editadas agora.
ALTER TABLE bets DISABLE TRIGGER update_bets_updated_at;
UPDATE bets SET sport = sport;
ALTER TABLE bets ENABLE TRIGGER update_bets_updated_at;

DROP TABLE IF EXISTS house_balances;

COMMIT;

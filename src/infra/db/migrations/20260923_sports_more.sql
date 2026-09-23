-- Mais esportes comuns nas casas, e Formula 1 vira Automobilismo.
-- Apelidos ja' na forma de sport_key() (sem acento, minusculo, hifen vira espaco).
-- "Varios" continua: e' o rotulo da multipla com esportes diferentes (regra do
-- prompt de extracao), nao fallback — esporte nao reconhecido fica sport_id NULL.
BEGIN;

INSERT INTO sports (name, aliases) VALUES
  ('Handebol',      '{handebol,handball}'),
  ('Tênis de Mesa', '{tenis de mesa,table tennis,ping pong}'),
  ('Rugby',         '{rugby,rugby union,rugby league}'),
  ('Críquete',      '{criquete,cricket}'),
  ('Badminton',     '{badminton}'),
  ('Golfe',         '{golfe,golf}'),
  ('Futsal',        '{futsal,futebol de salao,indoor soccer}')
ON CONFLICT (name) DO NOTHING;

UPDATE sports
   SET name = 'Automobilismo',
       aliases = '{automobilismo,motorsport,formula 1,formula1,f1,nascar,indycar}'
 WHERE name = 'Fórmula 1';

-- Reaplica o trigger: as 32 de Formula 1 passam a "Automobilismo".
ALTER TABLE bets DISABLE TRIGGER update_bets_updated_at;
UPDATE bets SET sport = sport WHERE sport_id IS NULL OR sport = 'Fórmula 1';
ALTER TABLE bets ENABLE TRIGGER update_bets_updated_at;

COMMIT;

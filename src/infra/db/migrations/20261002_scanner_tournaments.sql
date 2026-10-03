-- Competicoes que o scanner do SofaScore acompanha, e o que ele busca de cada
-- uma. Era o dict LIGAS de jobs/sofascore/collect.py: liga nova pedia commit e
-- deploy. Agora a tela /admin/scanner edita esta tabela e os jobs leem dela a
-- cada execucao. Spec: docs/scanner.md.
--
--   is_active    collect.py busca os proximos jogos (e' o que casa aposta com
--                jogo). Pausar nao afeta aposta ja' casada.
--   statistics   results.py, depois do jogo, alem do placar. 1 GET cada por
--   incidents    evento. So' futebol usa: fora dele o placar nao fecha como
--   lineups      REGULATION e o job nao busca nada extra.
--   last_*       escritos so' pelo collect.py. So' status 'ok' mexe no numero.
--   updated_at   escrito so' pela API, sem trigger: o coletor grava last_* a
--                cada execucao, e um trigger faria updated_at mentir.
BEGIN;

CREATE TABLE IF NOT EXISTS scanner_tournaments (
  id                INT PRIMARY KEY CHECK (id > 0),
  name              VARCHAR(100) NOT NULL,
  sport_id          INT NOT NULL REFERENCES sports(id),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  statistics        BOOLEAN NOT NULL DEFAULT true,
  incidents         BOOLEAN NOT NULL DEFAULT true,
  lineups           BOOLEAN NOT NULL DEFAULT true,
  last_events       INT,
  last_events_at    TIMESTAMP,
  last_check_at     TIMESTAMP,
  last_check_status VARCHAR(16)
    CHECK (last_check_status IN ('ok', 'invalid_id', 'blocked', 'error')),
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- O Supabase expoe o schema public pelo PostgREST. Sem politica nenhuma, anon
-- e authenticated nao leem nem escrevem; API e jobs conectam com o dono da
-- tabela, que nao passa pelo RLS.
ALTER TABLE scanner_tournaments ENABLE ROW LEVEL SECURITY;

-- Carga inicial: o LIGAS de 2026-10-02, ids verificados via /search/all do
-- proprio SofaScore. Esporte pelo nome (sports.name e' UNIQUE), nunca por id
-- fixo: nome sem correspondencia vira NULL, viola o NOT NULL e derruba a
-- migration inteira em vez de deixar a carga pela metade.
INSERT INTO scanner_tournaments (id, name, sport_id)
SELECT v.id, v.name, (SELECT s.id FROM sports s WHERE s.name = v.sport)
  FROM (VALUES
    (17, 'Premier League', 'Futebol'),
    (18, 'Championship', 'Futebol'),
    (24, 'League One', 'Futebol'),
    (8, 'LaLiga', 'Futebol'),
    (54, 'LaLiga 2', 'Futebol'),
    (23, 'Serie A', 'Futebol'),
    (35, 'Bundesliga', 'Futebol'),
    (44, '2. Bundesliga', 'Futebol'),
    (34, 'Ligue 1', 'Futebol'),
    (238, 'Liga Portugal Betclic', 'Futebol'),
    (37, 'Eredivisie', 'Futebol'),
    (52, 'Trendyol Super Lig', 'Futebol'),
    (36, 'Scottish Premiership', 'Futebol'),
    (185, 'Stoiximan Super League', 'Futebol'),
    (39, 'Danish Superliga', 'Futebol'),
    (19, 'FA Cup', 'Futebol'),
    (21, 'EFL Cup', 'Futebol'),
    (329, 'Copa del Rey', 'Futebol'),
    (328, 'Coppa Italia', 'Futebol'),
    (217, 'DFB Pokal', 'Futebol'),
    (7, 'UEFA Champions League', 'Futebol'),
    (679, 'UEFA Europa League', 'Futebol'),
    (17015, 'UEFA Conference League', 'Futebol'),
    (325, 'Brasileirão Betano', 'Futebol'),
    (390, 'Brasileirão Série B', 'Futebol'),
    (1281, 'Brasileirão Série C', 'Futebol'),
    (373, 'Copa Betano do Brasil', 'Futebol'),
    (155, 'Liga Profesional de Fútbol', 'Futebol'),
    -- Aposta em Independiente Rivadavia x Atletico Tucuman (2026-09-15) ficou
    -- sem evento: era jogo da copa, nao da liga.
    (1024, 'Copa Argentina', 'Futebol'),
    -- Ligas que a planilha de apelidos do grupo mostrou com aposta e sem coleta
    -- (2026-09-16).
    (38, 'Pro League (Bélgica)', 'Futebol'),
    (182, 'Ligue 2', 'Futebol'),
    (40, 'Allsvenskan', 'Futebol'),
    (240, 'LigaPro Serie A (Equador)', 'Futebol'),
    (11539, 'Primera A (Colômbia)', 'Futebol'),
    (984, 'Ligue Professionnelle 1 (Tunísia)', 'Futebol'),
    (384, 'CONMEBOL Libertadores', 'Futebol'),
    (480, 'CONMEBOL Sudamericana', 'Futebol'),
    (242, 'MLS', 'Futebol'),
    (955, 'Saudi Pro League', 'Futebol'),
    -- Asia: aposta em Al-Qadsiah x Al Wasl (2026-09-15) ficou sem evento porque
    -- o continental asiatico nao estava aqui. Elite e' a divisao de cima.
    (463, 'AFC Champions League Elite', 'Futebol'),
    (668, 'AFC Champions League Two', 'Futebol'),
    -- Liga MX parte a temporada em dois torneios com id proprio; os dois
    -- precisam estar aqui ou metade do ano fica sem jogo.
    (11621, 'Liga MX, Apertura', 'Futebol'),
    (11620, 'Liga MX, Clausura', 'Futebol'),
    -- Selecoes: fora de ano de competicao voltam sem jogo, e isso e' normal.
    (16, 'FIFA World Cup', 'Futebol'),
    (1, 'EURO', 'Futebol'),
    (133, 'Copa América', 'Futebol'),
    -- Fora do futebol: mesma estrutura de evento (dois lados, shortName e
    -- nameCode), entao entram sem mudanca no coletor.
    (132, 'NBA', 'Basquete'),
    (486, 'WNBA', 'Basquete'),
    (138, 'Euroleague', 'Basquete'),
    (1562, 'NBB', 'Basquete'),
    (9464, 'NFL', 'Futebol Americano'),
    (32199, 'NCAA Division FBS', 'Futebol Americano'),
    (11205, 'MLB', 'Beisebol'),
    (234, 'NHL', 'Hóquei no Gelo'),
    (1452, 'Superliga (vôlei masculino)', 'Vôlei'),
    (1468, 'Superliga Feminina (vôlei)', 'Vôlei'),
    (19906, 'UFC', 'MMA'),
    -- Tenis: cada Grand Slam e' um torneio por chave (masculina/feminina).
    (2363, 'Australian Open, Men', 'Tênis'),
    (2571, 'Australian Open, Women', 'Tênis'),
    (2480, 'Roland Garros, Men', 'Tênis'),
    (2577, 'Roland Garros, Women', 'Tênis'),
    (2361, 'Wimbledon, Men', 'Tênis'),
    (2600, 'Wimbledon, Women', 'Tênis'),
    (2449, 'US Open, Men', 'Tênis'),
    (2601, 'US Open, Women', 'Tênis'),
    -- E-sports. Nao existe um "CS2 Major" unico no SofaScore: cada organizador
    -- tem o proprio torneio, entao entram os tres que sediam Major.
    (16050, 'MSI', 'eSports'),
    (16053, 'Worlds', 'eSports'),
    (16273, 'The International', 'eSports'),
    (16312, 'PGL Major', 'eSports'),
    (20119, 'BLAST.tv Major', 'eSports'),
    (30435, 'StarLadder Major', 'eSports')
  ) AS v(id, name, sport)
ON CONFLICT (id) DO NOTHING;

COMMIT;

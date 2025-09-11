-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS house_transactions CASCADE;
DROP TABLE IF EXISTS transaction_types CASCADE;
DROP TABLE IF EXISTS bet_results CASCADE;
DROP TABLE IF EXISTS bets CASCADE;
DROP TABLE IF EXISTS house_balances CASCADE;
DROP TABLE IF EXISTS house_aliases CASCADE;
DROP TABLE IF EXISTS betting_houses CASCADE;

-- Create a table for transaction types
-- This makes the schema more flexible and scalable
CREATE TABLE IF NOT EXISTS transaction_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

-- Canonical betting houses table
CREATE TABLE IF NOT EXISTS betting_houses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS house_balances (
    id SERIAL PRIMARY KEY,
    house_id INTEGER NOT NULL REFERENCES betting_houses(id) ON DELETE CASCADE,
    value NUMERIC(12,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create bets table with improved structure
CREATE TABLE IF NOT EXISTS bets (
    id SERIAL PRIMARY KEY,
    game VARCHAR(255) NOT NULL,
    stake DECIMAL(10,2) NOT NULL CHECK (stake > 0),
    odd DECIMAL(5,2) NOT NULL CHECK (odd > 1),
    house_id INTEGER NULL REFERENCES betting_houses(id) ON DELETE SET NULL,
    market VARCHAR(255) NOT NULL,
    sport VARCHAR(50) NOT NULL,
    profit NUMERIC(12,2) NULL,
    bet_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create bet_results table
CREATE TABLE IF NOT EXISTS bet_results (
    id SERIAL PRIMARY KEY,
    bet_id INTEGER NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
    result_id INTEGER NOT NULL DEFAULT 9, -- 9 = PENDING
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create house_transactions table with a foreign key to transaction_types
CREATE TABLE IF NOT EXISTS house_transactions (
    id SERIAL PRIMARY KEY,
    house_id INTEGER NOT NULL REFERENCES betting_houses(id) ON DELETE CASCADE,
    transaction_type_id INTEGER NOT NULL REFERENCES transaction_types(id) ON DELETE RESTRICT,
    value NUMERIC(12,2) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bets_bet_time ON bets(bet_time DESC);
CREATE INDEX IF NOT EXISTS idx_bets_house_id ON bets(house_id);
CREATE INDEX IF NOT EXISTS idx_bet_results_bet_id ON bet_results(bet_id);
CREATE INDEX IF NOT EXISTS idx_bet_results_result_id ON bet_results(result_id);
CREATE INDEX IF NOT EXISTS idx_house_balances_house_id ON house_balances(house_id);
CREATE INDEX IF NOT EXISTS idx_house_transactions_house_id ON house_transactions(house_id);
CREATE INDEX IF NOT EXISTS idx_house_transactions_type_id ON house_transactions(transaction_type_id);
CREATE INDEX IF NOT EXISTS idx_house_transactions_created_at ON house_transactions(created_at DESC);

-- Seed some initial transaction types
INSERT INTO transaction_types (name) VALUES
('DEPOSIT'),
('WITHDRAWAL'),
('ADJUSTMENT')
ON CONFLICT DO NOTHING;

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_bets_updated_at 
    BEFORE UPDATE ON bets 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bet_results_updated_at 
    BEFORE UPDATE ON bet_results 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_house_transactions_updated_at 
    BEFORE UPDATE ON house_transactions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

INSERT INTO betting_houses (id, name) VALUES
(1, '1 PRA 1'),
(2, '1XBET'),
(3, '4PLAY'),
(4, '4WIN'),
(5, '5G'),
(6, '6R'),
(7, '6Z'),
(8, '7GAMES'),
(9, '7K'),
(10, '9D'),
(11, '9F'),
(12, 'A247'),
(13, 'AFUN'),
(14, 'AI'),
(15, 'ALFA BET'),
(16, 'APOSTA GANHA'),
(17, 'APOSTA BET'),
(18, 'APOSTA1'),
(19, 'APOSTAMAX'),
(20, 'APOSTATUDO'),
(21, 'APOSTAR'),
(22, 'APOSTOU'),
(23, 'ARENAPLUS'),
(24, 'AVIAOBET'),
(25, 'B1 BET'),
(26, 'B2XBET'),
(27, 'BACANAPLAY'),
(28, 'BANDBET'),
(29, 'BATEU BET'),
(30, 'BAU BINGO'),
(31, 'BET AKI'),
(32, 'BET APP'),
(33, 'BET DA SORTE'),
(34, 'BET DO MILHÃO'),
(35, 'BET GORILLAS'),
(36, 'BET SUL'),
(37, 'BET VIP'),
(38, 'BET.BET'),
(39, 'BET365'),
(40, 'BET4'),
(41, 'BETBOO'),
(42, 'BETBOOM'),
(43, 'BETBRA'),
(44, 'BETBUFFALOS'),
(45, 'BETCAIXA'),
(46, 'BETCOPA'),
(47, 'BETESPECIAL'),
(48, 'BETESPORTE'),
(49, 'BETFALCONS'),
(50, 'BETFAST'),
(51, 'BETFAIR'),
(52, 'BETFUSION'),
(53, 'BETMGM'),
(54, 'BETNACIONAL'),
(55, 'BETOU'),
(56, 'BETPARK'),
(57, 'BETANO'),
(58, 'BETSSON'),
(59, 'BETWARRIOR'),
(60, 'BIG'),
(61, 'BINGOPLUS'),
(62, 'BLAZE'),
(63, 'BOLSA DE APOSTA'),
(64, 'BRASIL BET'),
(65, 'BRASIL DA SORTE'),
(66, 'BRAVO'),
(67, 'BRAZINO 777'),
(68, 'BRBET'),
(69, 'BR4BET'),
(70, 'BRXBET'),
(71, 'BULLSBET'),
(72, 'CASA DE APOSTAS'),
(73, 'CASSINO'),
(74, 'CAESARS'),
(75, 'CBESPORTES'),
(76, 'CGG'),
(77, 'DONALDBET'),
(78, 'DONOSDABOLA'),
(79, 'ENERGIA'),
(80, 'ESPORTES DA SORTE'),
(81, 'ESPORTE 365'),
(82, 'ESPORTIVA BET'),
(83, 'ESPORTIVAVIP'),
(84, 'ESTRELABET'),
(85, 'F12.BET'),
(86, 'FAZ O BET'),
(87, 'FAZ1BET'),
(88, 'FANBIT'),
(89, 'FLABET'),
(90, 'FOG0777'),
(91, 'FULLTBET'),
(92, 'FYBET'),
(93, 'GALERA.BET'),
(94, 'GAMEPLUS'),
(95, 'GERALBET'),
(96, 'GINGABET'),
(97, 'GOL DE BET'),
(98, 'H2 BET'),
(99, 'HILGARDO'),
(100, 'HILGARDO GAMING'),
(101, 'HIPERBET'),
(102, 'JOGA LIMPO'),
(103, 'JOGÃO'),
(104, 'JOGO'),
(105, 'JOGO DE OURO'),
(106, 'JOGO ONLINE'),
(107, 'JOGOS'),
(108, 'JONBET'),
(109, 'KBET'),
(110, 'KING PANDA'),
(111, 'KTO'),
(112, 'LANCE DE SORTE'),
(113, 'LÍDERBET'),
(114, 'LOTTOLAND'),
(115, 'LOTTU'),
(116, 'LOTOGREEN'),
(117, 'LUCK.BET'),
(118, 'LUVA.BET'),
(119, 'MAGICJACKPOT'),
(120, 'MATCHBOOK'),
(121, 'MAXIMABET'),
(122, 'MCGAMES'),
(123, 'MEGABET'),
(124, 'MEGAPOSTA'),
(125, 'MERIDIAN'),
(126, 'MGM'),
(127, 'MMA'),
(128, 'MONTECARLOS'),
(129, 'MONTECARLOSBET'),
(130, 'MULTIBET'),
(131, 'NETPIX'),
(132, 'NOSSABET'),
(133, 'NOVIBET'),
(134, 'ONABET'),
(135, 'OLEYBET'),
(136, 'P9'),
(137, 'PAGOL'),
(138, 'PAPIGAMES'),
(139, 'PIN'),
(140, 'PINNACLE'),
(141, 'PITACO'),
(142, 'PIXBET'),
(143, 'PLAYUZU'),
(144, 'PQ777'),
(145, 'QGBET'),
(146, 'R7'),
(147, 'RDP'),
(148, 'REALS'),
(149, 'REI DO PITACO'),
(150, 'RICOBET'),
(151, 'RIVALO'),
(152, 'SEGURO BET'),
(153, 'SEUBET'),
(154, 'SORTE ONLINE'),
(155, 'SORTENABET'),
(156, 'SPIN'),
(157, 'SPORTINGBET'),
(158, 'SPORTYBET'),
(159, 'STAKE'),
(160, 'STARTBET'),
(161, 'SUPER'),
(162, 'SUPERBET'),
(163, 'SUPREMABET'),
(164, 'TELE SENA BET'),
(165, 'TIGER'),
(166, 'TIVOBET'),
(167, 'TRADICIONAL'),
(168, 'ULTRABET'),
(169, 'UPBETBR'),
(170, 'UX'),
(171, 'VBET'),
(172, 'VERA'),
(173, 'VERSUSBET'),
(174, 'VERTBET'),
(175, 'VIVARO'),
(176, 'VIVASORTE'),
(177, 'VS-VERSUS'),
(178, 'VUPI'),
(179, 'WJCASINO'),
(180, 'XBET CAIXA'),
(181, 'BETPIX365'),
(182, 'VAIDEBET');

criar tabela de results que nao tem ainda
CREATE TABLE IF NOT EXISTS results (
  id SERIAL PRIMARY KEY,
 name VARCHAR(50) NOT NULL UNIQUE
);

insert into results (name) values
('WON'),
('LOST'),
('PENDING'),
('CANCELADAED'),

create table public.users (
  id serial not null,
  username character varying(50) not null,
  email character varying(100) not null,
  password_hash character varying(255) not null,
  full_name character varying(100) null,
  is_active boolean null default true,
  role_id integer not null,
  created_at timestamp without time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp without time zone null default CURRENT_TIMESTAMP,
  last_login timestamp without time zone null,
  constraint users_pkey primary key (id),
  constraint users_email_key unique (email),
  constraint users_username_key unique (username),
  constraint users_role_id_fkey foreign KEY (role_id) references roles (id)
) TABLESPACE pg_default;



-- Grant permissions (adjust as needed)
-- GRANT ALL PRIVILEGES ON DATABASE betting_tracker TO your_user;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;
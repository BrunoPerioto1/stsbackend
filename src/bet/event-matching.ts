// Casa o texto do evento de uma aposta ("Flamengo x Palmeiras") com um jogo
// real vindo do provider, pra descobrir a data/hora de inicio. Sem IA: nome
// dos times, esporte e proximidade de data.
//
// Funcao pura, sem I/O. Quem busca os candidatos e' o SportEventRepository.
//
// O algoritmo foi calibrado contra 543 eventos reais do SofaScore (24
// competicoes): 26/26 nos casos de nome que as casas de aposta usam. Levenshtein
// e nao similaridade de sequencia porque precisa ser reimplementavel sem
// dependencia.

export interface CandidateEvent {
  externalId: string;
  provider: string;
  startAt: Date;
  sport: string;
  homeName: string;
  homeShort: string | null;
  homeCode: string | null;
  awayName: string;
  awayShort: string | null;
  awayCode: string | null;
}

export interface EventMatch {
  externalId: string;
  provider: string;
  startAt: Date;
  confidence: number;
}

// Limiar deliberadamente alto: errar a data e' pior que nao ter data. Abaixo
// disso a aposta e' criada sem evento.
export const MATCH_THRESHOLD = 0.8;
// Se o segundo colocado chega perto do primeiro, os dois sao plausiveis e a
// escolha seria chute. Descarta.
export const AMBIGUITY_MARGIN = 0.03;

// Sufixo de clube e preposicao que casa de aposta e provider escrevem
// diferente. "Liverpool FC" e "Liverpool" tem que colidir.
const NOISE_TOKENS = new Set([
  'fc',
  'cf',
  'sc',
  'ac',
  'afc',
  'cd',
  'sk',
  'ca',
  'cr',
  'clube',
  'club',
  'de',
  'do',
  'da',
  'the',
  'regatas',
  'futebol',
  'esporte',
  'esportivo',
]);

// A extracao escreve o esporte em portugues ("Futebol", "Basquete") e o
// provider grava em ingles ("Football", "Basketball"). Com mais de um esporte
// no cache, filtrar importa: sem isso "Atlanta Hawks" poderia disputar pontos
// com "Atlanta United". Esporte que nao esta no mapa (multipla de esportes
// diferentes vem como "Varios") nao filtra nada — perder recall aqui e' pior
// que o risco, porque os dois lados ainda precisam casar.
const SPORTS: Record<string, string> = {
  futebol: 'football',
  football: 'football',
  soccer: 'football',
  basquete: 'basketball',
  basquetebol: 'basketball',
  basketball: 'basketball',
  nba: 'basketball',
  'futebol americano': 'american football',
  'american football': 'american football',
  nfl: 'american football',
};

export function normalizeSport(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Nome em portugues de clube estrangeiro. O provider nao tem traducao pt (o
// SofaScore so traduz pra ar/ru/hi/bn), entao essa lista e' manual. Cresce sob
// demanda, quando aparecer aposta que nao casou.
const ALIASES: Record<string, string> = {
  // As chaves ja estao na forma normalizada (sem acento, sem preposicao) —
  // o alias e' consultado DEPOIS da limpeza de tokens.
  'inter milao': 'inter',
  internazionale: 'inter',
  'bayern munique': 'bayern munchen',
  napoles: 'napoli',
  sevilha: 'sevilla',
  colonia: 'koln',
  'juventus turim': 'juventus',
  'atletico madri': 'atletico madrid',
  'manchester utd': 'manchester united',
  'psv eindhoven': 'psv',
  // Dinamarca: a casa escreve o nome em ingles, o provider em danes.
  copenhagen: 'kobenhavn',
  copenhague: 'kobenhavn',
};

// NFD so separa acento de letra base. Estas sao letras proprias do alfabeto —
// nao decompoem, e a limpeza de `[^a-z0-9 ]` as apagaria, partindo o nome em
// dois tokens ("Kobenhavn" virava "k benhavn" e nao casava com nada).
const LETRAS_ESTRANGEIRAS: Record<string, string> = {
  'ø': 'o',
  'æ': 'ae',
  'œ': 'oe',
  'ß': 'ss',
  'ð': 'd',
  'đ': 'd',
  'þ': 'th',
  'ł': 'l',
  'ı': 'i',
};

export function normalizeTeamName(value: string): string {
  const semAcento = value
    .toLowerCase()
    .replace(/[øæœßðđþłı]/g, (c) => LETRAS_ESTRANGEIRAS[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const tokens = semAcento
    .replace(/[-.]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !NOISE_TOKENS.has(token));
  const normalizado = tokens.join(' ');
  return ALIASES[normalizado] ?? normalizado;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return a.length || b.length;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(
        anterior[j] + 1,
        atual[j - 1] + 1,
        anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    anterior = atual;
  }
  return anterior[b.length];
}

export function similarity(a: string, b: string): number {
  const maior = Math.max(a.length, b.length);
  return maior === 0 ? 1 : 1 - levenshtein(a, b) / maior;
}

// "Flamengo x Palmeiras", "Real Madrid vs Barcelona", "A versus B".
const SEPARATOR = /\s+(?:x|vs\.?|versus)\s+/i;

export function splitConfronto(
  texto: string,
): { home: string; away: string } | null {
  const partes = texto.split(SEPARATOR);
  if (partes.length !== 2) return null;
  const [home, away] = partes.map((p) => p.trim());
  return home && away ? { home, away } : null;
}

// Multipla de varios confrontos: o game vira "Múltipla (2 jogos)" e os
// confrontos descem pro mercado, separados por " / " — ver foldMultiEventGame
// e BET_EXTRACTION_RULES. Dois formatos chegam aqui:
//
//   "Real Madrid vs Osasuna - vitória / Barcelona vs Getafe - vitória"
//   "Barcelona x Feyenoord / Stuttgart x Viking · Barcelona e Stuttgart vencem"
//
// No segundo o normalizador anexa a selecao depois de " · ", porque a IA
// devolveu o mercado sem prefixar cada confronto. Corta nos dois separadores.
function fragmentos(texto: string): string[] {
  return texto
    .split(' / ')
    .map((parte) => parte.split(' · ')[0].split(' - ')[0].trim())
    .filter(Boolean);
}

export function extractConfrontos(game: string, market: string): string[] {
  const direto = splitConfronto(game);
  if (direto) return [game];
  for (const fonte of [game, market]) {
    const achados = fragmentos(fonte).filter(
      (fragmento) => splitConfronto(fragmento) !== null,
    );
    if (achados.length) return achados;
  }
  return [];
}

// Todos os apelidos que o provider ja da pro time. shortName e nameCode vem
// prontos do SofaScore ("Man City", "MCI") e sozinhos resolvem a maioria das
// variacoes que as casas escrevem.
function teamKeys(
  name: string,
  short: string | null,
  code: string | null,
): string[] {
  const chaves = [name, short, code]
    .filter((v): v is string => !!v)
    .map(normalizeTeamName)
    .filter(Boolean);
  return [...new Set(chaves)];
}

// token -> times distintos que o usam, dentro da janela coletada. Um token que
// pertence a um unico time e' identificador sozinho: a casa escreve "Operário
// Ferroviário" e o provider "Operário-PR" — nem contencao nem Levenshtein
// resolvem, mas "operario" so existe num time. Token compartilhado ("botafogo",
// "atletico", "inter") nao ganha esse peso, entao homonimo continua caindo no
// desempate normal.
type TokenIndex = Map<string, Set<string>>;

function teamId(evento: CandidateEvent, lado: 'home' | 'away'): string {
  return normalizeTeamName(lado === 'home' ? evento.homeName : evento.awayName);
}

function buildTokenIndex(candidatos: CandidateEvent[]): TokenIndex {
  const index: TokenIndex = new Map();
  for (const evento of candidatos) {
    for (const lado of ['home', 'away'] as const) {
      const id = teamId(evento, lado);
      const chaves =
        lado === 'home'
          ? teamKeys(evento.homeName, evento.homeShort, evento.homeCode)
          : teamKeys(evento.awayName, evento.awayShort, evento.awayCode);
      for (const token of chaves.flatMap((chave) => chave.split(' '))) {
        if (!index.has(token)) index.set(token, new Set());
        index.get(token)!.add(id);
      }
    }
  }
  return index;
}

function scoreTeam(
  alvo: string,
  chaves: string[],
  id: string,
  index: TokenIndex,
): number {
  if (!alvo || !chaves.length) return 0;
  const tokensAlvo = new Set(alvo.split(' '));
  let melhor = 0;
  for (const chave of chaves) {
    if (chave === alvo) return 1;
    // Contencao nos dois sentidos: "nottingham" dentro de "nottingham forest",
    // e "athletico pr" contendo "athletico". A unicidade e' garantida pelo
    // desempate contra o segundo colocado, la fora.
    const tokensChave = new Set(chave.split(' '));
    const contido =
      [...tokensAlvo].every((t) => tokensChave.has(t)) ||
      [...tokensChave].every((t) => tokensAlvo.has(t));
    melhor = Math.max(melhor, contido ? 0.95 : similarity(alvo, chave));
  }
  if (melhor < 0.9) {
    const exclusivo = [...tokensAlvo].some((token) => {
      const donos = index.get(token);
      return donos?.size === 1 && donos.has(id);
    });
    if (exclusivo) melhor = Math.max(melhor, 0.9);
  }
  return melhor;
}

function scoreEvent(
  home: string,
  away: string,
  evento: CandidateEvent,
  index: TokenIndex,
): number {
  // Os dois lados precisam casar. E' o que impede "Botafogo-PB" de virar
  // "Botafogo-SP": o adversario nao bate.
  const scoreHome = scoreTeam(
    home,
    teamKeys(evento.homeName, evento.homeShort, evento.homeCode),
    teamId(evento, 'home'),
    index,
  );
  const scoreAway = scoreTeam(
    away,
    teamKeys(evento.awayName, evento.awayShort, evento.awayCode),
    teamId(evento, 'away'),
    index,
  );
  return Math.min(scoreHome, scoreAway);
}

function matchConfronto(
  confronto: string,
  candidatos: CandidateEvent[],
  index: TokenIndex,
): EventMatch | null {
  const lados = splitConfronto(confronto);
  if (!lados) return null;
  const home = normalizeTeamName(lados.home);
  const away = normalizeTeamName(lados.away);
  if (!home || !away) return null;

  const pontuados = candidatos
    .map((evento) => ({ evento, score: scoreEvent(home, away, evento, index) }))
    .sort((a, b) => b.score - a.score);

  const melhor = pontuados[0];
  if (!melhor || melhor.score < MATCH_THRESHOLD) return null;

  const segundo = pontuados.find(
    (p) => p.evento.externalId !== melhor.evento.externalId,
  );
  if (segundo && melhor.score - segundo.score < AMBIGUITY_MARGIN) return null;

  return {
    externalId: melhor.evento.externalId,
    provider: melhor.evento.provider,
    startAt: melhor.evento.startAt,
    confidence: Number(melhor.score.toFixed(3)),
  };
}

/**
 * Retorna o evento correspondente a aposta, ou null quando nao ha confianca
 * suficiente. Nunca lanca e nunca chuta uma data.
 *
 * Multipla: casa cada confronto. Se algum nao casar, a multipla inteira fica
 * sem data — meia informacao aqui e' pior que nenhuma. A data e' a do primeiro
 * jogo (quando a aposta comeca a valer) e a confianca e' a menor das partes.
 */
export function matchEvent(
  game: string,
  market: string,
  candidatos: CandidateEvent[],
  sport?: string,
): EventMatch | null {
  if (!game || !candidatos.length) return null;

  const esporte = SPORTS[normalizeSport(sport)];
  const elegiveis = esporte
    ? candidatos.filter((c) => normalizeSport(c.sport) === esporte)
    : candidatos;
  if (!elegiveis.length) return null;

  const confrontos = extractConfrontos(game, market ?? '');
  if (!confrontos.length) return null;

  const index = buildTokenIndex(elegiveis);
  const casados: EventMatch[] = [];
  for (const confronto of confrontos) {
    const match = matchConfronto(confronto, elegiveis, index);
    if (!match) return null;
    casados.push(match);
  }

  casados.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return {
    ...casados[0],
    confidence: Math.min(...casados.map((m) => m.confidence)),
  };
}

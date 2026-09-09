// Le o texto do mercado de uma aposta e devolve as condicoes que o placar
// final resolve. Funcao pura, sem I/O.
//
// O texto vem da extracao por IA e e' livre ("Mais de 2.5 - Total de gols",
// "Flamengo - Resultado final"). " / " separa selecoes em todo o fluxo de
// ingestao (ver BET_EXTRACTION_RULES), entao e' por ali que a combinada e'
// quebrada em pernas.
//
// A regra de ouro e' recusar na duvida: uma sugestao errada vira lucro errado
// na planilha do usuario, enquanto um `null` so' pede que ele resolva na mao,
// que ja e' o que ele faz hoje.

import { normalizeTeamName } from '../bet/event-matching';

export type Condition =
  | { kind: 'TOTAL_GOALS'; operator: 'OVER' | 'UNDER'; line: number }
  | { kind: 'BOTH_TEAMS_SCORE'; expected: boolean }
  | { kind: 'MATCH_RESULT'; pick: 'HOME' | 'AWAY' | 'DRAW' }
  | { kind: 'EXACT_SCORE'; home: number; away: number };

export type ParseFailure =
  | 'MERCADO_NAO_RECONHECIDO'
  | 'OUTRA_CATEGORIA'
  | 'TEMPO_PARCIAL'
  | 'GOLS_DE_UM_TIME'
  | 'VARIOS_JOGOS'
  | 'CONDICAO_ALTERNATIVA';

export type ParseResult =
  | { ok: true; conditions: Condition[] }
  | { ok: false; reason: ParseFailure; detail: string };

export interface Teams {
  home: string;
  away: string;
}

// --- recusas -------------------------------------------------------------
// Cada padrao aqui saiu de aposta real do historico. Nenhum e' preventivo.

// Mercado que o placar final nao resolve. Alem das categorias obvias, entram
// os que dependem de QUANDO ou QUEM marcou — o placar diz quantos, nao a que
// minuto nem de quem.
const OTHER_CATEGORY =
  /\b(escanteios?|corners?|cart[oóõ]es|cart[aã]o|cards?|chutes?|finaliza[cç][oõ]es|shots?|faltas?|impedimentos?|defesas?|posse de bola|assist[eê]ncias?|jogador|marcador|artilheiro|anytime|gol mais r[aá]pido|primeiro gol|[uú]ltimo gol|marcar a qualquer momento|gol de vantagem)\b/i;

// Recorte de tempo. "FT" fica de fora: full time e' o escopo que resolvemos.
const PARTIAL_TIME =
  /\b([12]\s*[ºo°]?\s*t\b|[12]\s*[ºo°]\s*tempo|primeiro tempo|segundo tempo|intervalo|half.?time|\bht\b|um dos tempos|ambos os tempos)/i;

// "Multi-gols 1-3" e' faixa de gols de um time, nao placar exato.
const MULTI_GOALS = /\bmulti[\s-]?gols?\b/i;

// Handicap e dupla chance mudam a regra de vitoria; ficam pra outra versao.
const HANDICAP = /\b(handicap|asi[aá]tico|asian)\b|[+-]\s?\d+([.,]\d+)?\s*gol/i;
// As casas escrevem nas duas ordens: "Dupla chance" e "Chance dupla".
const DOUBLE_CHANCE =
  /\b(dupla chance|chance dupla|double chance|ou empate|empate ou)\b/i;

// "Vencer de zero" / "sem tomar gols" e' vitoria + clean sheet: duas condicoes
// numa frase, e a segunda nao esta' no texto como perna separada.
const CLEAN_SHEET =
  /\b(sem (tomar|sofrer|levar)|n[aã]o sofre|n[aã]o toma|de zero\b|de 0\b)/i;

// Aposta agregada sobre varias partidas.
const MANY_MATCHES =
  /\b(nos?\s+\d+\s+jogos?|nas?\s+\d+\s+partidas?|em todos os jogos|em todas as partidas|todas as equipes|de hoje|na rodada|do dia)\b/i;

// "ou" ligando alternativas: so' uma foi extraida.
const ALTERNATIVE = /\bou\b(?!\s*$)/i;

// --- reconhecimento ------------------------------------------------------

const TOTAL_GOALS =
  /\b(mais|menos|over|under|acima|abaixo)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)/i;
const OVER_WORDS = /^(mais|over|acima)$/i;
// "o2.5" / "u1.5", como as casas abreviam.
const SHORT_LINE = /\b([ou])\s?(\d+(?:[.,]\d+)?)\b/i;

const BOTH_SCORE =
  /\b(amb[ao]s\s+(?:os\s+times|as\s+equipes|times|equipes)?\s*marc|ambas\s+marc|btts|both teams to score)/i;
const NEGATIVE = /\b(n[aã]o|no|sem)\b/i;

const EXACT_SCORE_LABEL = /\b(resultado correto|placar exato|correct score)\b/i;
const SCORE_PAIR = /\b(\d{1,2})\s*[-x:]\s*(\d{1,2})\b/;

const DRAW = /\b(empate|draw)\b/i;
// Rotulos que confirmam ser mercado de vencedor da partida.
const RESULT_LABEL =
  /\b(resultado final|resultado da partida|resultado do jogo|vencedor|vence(r|ndo)?|ganha(r)?|1\s?x\s?2|\bml\b|money ?line|match ?winner|resultado)\b/i;

function toNumber(raw: string): number {
  return Number(raw.replace(',', '.'));
}

function mentionsTeam(text: string, team: string): boolean {
  const target = normalizeTeamName(team);
  if (!target) return false;
  const body = ` ${normalizeTeamName(text)} `;
  if (body.includes(` ${target} `)) return true;
  const tokens = target.split(' ').filter((t) => t.length >= 4);
  return tokens.some((token) => body.includes(` ${token} `));
}

// Quao firmemente o texto cita o time. Graduado porque times de um mesmo jogo
// dividem token: "Atletico Madrid" cita os dois lados de Real Madrid x
// Atletico Madrid se "madrid" bastar.
function citationStrength(text: string, team: string): number {
  const target = normalizeTeamName(team);
  if (!target) return 0;
  const body = ` ${normalizeTeamName(text)} `;
  if (body.includes(` ${target} `)) return 1;
  const tokens = target.split(' ').filter((t) => t.length >= 4);
  if (!tokens.length) return 0;
  if (tokens.every((token) => body.includes(` ${token} `))) return 0.7;
  return tokens.some((token) => body.includes(` ${token} `)) ? 0.5 : 0;
}

function parseTotalGoals(fragment: string, teams: Teams): ParseResult | null {
  const long = TOTAL_GOALS.exec(fragment);
  const short = long ? null : SHORT_LINE.exec(fragment);
  if (!long && !short) return null;
  // Sem a palavra "gol" em algum lugar pode ser linha de qualquer coisa.
  if (!/\bgo?ls?\b|\bgoals?\b|\bgol\b/i.test(fragment)) return null;

  // "Flamengo mais de 1.5" e' gol DO TIME, nao do jogo. Sem saber de quem, a
  // regra do total nao se aplica.
  if (mentionsTeam(fragment, teams.home) || mentionsTeam(fragment, teams.away))
    return {
      ok: false,
      reason: 'GOLS_DE_UM_TIME',
      detail: `linha de gols atrelada a um time: "${fragment}"`,
    };

  const operator = long
    ? OVER_WORDS.test(long[1])
      ? 'OVER'
      : 'UNDER'
    : short![1].toLowerCase() === 'o'
      ? 'OVER'
      : 'UNDER';
  const line = toNumber(long ? long[2] : short![2]);

  if (!Number.isFinite(line) || line < 0 || line > 9.5)
    return {
      ok: false,
      reason: 'MERCADO_NAO_RECONHECIDO',
      detail: `linha ${line} implausivel para um jogo`,
    };
  // Linha asiatica (.25/.75) resolve em meio-ganho; nao cabe em ganhou/perdeu.
  if ((line * 2) % 1 !== 0)
    return {
      ok: false,
      reason: 'MERCADO_NAO_RECONHECIDO',
      detail: `linha asiatica ${line}`,
    };

  return { ok: true, conditions: [{ kind: 'TOTAL_GOALS', operator, line }] };
}

function parseBothScore(fragment: string): ParseResult | null {
  if (!BOTH_SCORE.test(fragment)) return null;
  // A negacao costuma vir na selecao, antes do rotulo: "Não - Ambas marcam".
  const selection = fragment.split(/\s+[-–—]\s+/)[0];
  const expected = !NEGATIVE.test(selection);
  return {
    ok: true,
    conditions: [{ kind: 'BOTH_TEAMS_SCORE', expected }],
  };
}

function parseExactScore(fragment: string): ParseResult | null {
  if (!EXACT_SCORE_LABEL.test(fragment)) return null;
  const pares = fragment.match(new RegExp(SCORE_PAIR, 'g')) ?? [];
  if (pares.length !== 1)
    return {
      ok: false,
      reason: pares.length ? 'CONDICAO_ALTERNATIVA' : 'MERCADO_NAO_RECONHECIDO',
      detail: `${pares.length} placares no texto: "${fragment}"`,
    };
  const [, home, away] = SCORE_PAIR.exec(fragment)!;
  return {
    ok: true,
    conditions: [
      { kind: 'EXACT_SCORE', home: Number(home), away: Number(away) },
    ],
  };
}

function parseMatchResult(fragment: string, teams: Teams): ParseResult | null {
  const home = citationStrength(fragment, teams.home);
  const away = citationStrength(fragment, teams.away);
  const draw = DRAW.test(fragment);

  if (!home && !away && !draw) return null;
  // Time citado sem rotulo de resultado pode ser qualquer mercado do time.
  if (!RESULT_LABEL.test(fragment) && !draw)
    return {
      ok: false,
      reason: 'MERCADO_NAO_RECONHECIDO',
      detail: `time citado sem indicar o mercado: "${fragment}"`,
    };

  if (draw && !home && !away)
    return { ok: true, conditions: [{ kind: 'MATCH_RESULT', pick: 'DRAW' }] };

  if (home && away) {
    // "Cottbus vence o Wolfsburg": o verbo diz quem foi apostado, e isso manda
    // sobre a forca — o perdedor pode estar escrito por extenso.
    const vence =
      /^(?<winner>.+?)\s+(?:vencer|vence|ganhar|ganha|bater|bate)\b/i.exec(
        fragment.trim(),
      );
    if (vence?.groups) {
      const trecho = vence.groups.winner;
      const h = citationStrength(trecho, teams.home);
      const a = citationStrength(trecho, teams.away);
      if (h !== a)
        return {
          ok: true,
          conditions: [{ kind: 'MATCH_RESULT', pick: h > a ? 'HOME' : 'AWAY' }],
        };
    }
    if (home === away)
      return {
        ok: false,
        reason: 'MERCADO_NAO_RECONHECIDO',
        detail: `os dois times citados sem indicar o vencedor: "${fragment}"`,
      };
  }

  return {
    ok: true,
    conditions: [{ kind: 'MATCH_RESULT', pick: home > away ? 'HOME' : 'AWAY' }],
  };
}

function parseFragment(fragment: string, teams: Teams): ParseResult {
  for (const [pattern, reason, label] of [
    [OTHER_CATEGORY, 'OUTRA_CATEGORIA', 'mercado de outra categoria'],
    [PARTIAL_TIME, 'TEMPO_PARCIAL', 'recorte de tempo'],
    [MULTI_GOALS, 'MERCADO_NAO_RECONHECIDO', 'multi-gols (faixa, nao placar)'],
    [HANDICAP, 'MERCADO_NAO_RECONHECIDO', 'handicap'],
    [DOUBLE_CHANCE, 'MERCADO_NAO_RECONHECIDO', 'dupla chance'],
    [CLEAN_SHEET, 'MERCADO_NAO_RECONHECIDO', 'combina clean sheet'],
    [MANY_MATCHES, 'VARIOS_JOGOS', 'agregado de varias partidas'],
  ] as const) {
    const found = pattern.exec(fragment);
    if (found)
      return { ok: false, reason, detail: `${label}: "${found[0]}"` };
  }

  const parsed =
    parseExactScore(fragment) ??
    parseBothScore(fragment) ??
    parseTotalGoals(fragment, teams) ??
    parseMatchResult(fragment, teams);

  return (
    parsed ?? {
      ok: false,
      reason: 'MERCADO_NAO_RECONHECIDO',
      detail: `nao reconhecido: "${fragment}"`,
    }
  );
}

/**
 * Quebra o mercado em condicoes. Combinada do mesmo jogo vira varias condicoes
 * que precisam valer todas — se qualquer perna nao for reconhecida, a aposta
 * inteira fica sem sugestao, porque liquidar por metade da informacao inverte
 * o resultado (uma "vitoria + mais de 2.5" que so' cumpriu a vitoria PERDEU).
 */
export function parseMarket(market: string, teams: Teams): ParseResult {
  const text = (market ?? '').trim();
  if (!text)
    return {
      ok: false,
      reason: 'MERCADO_NAO_RECONHECIDO',
      detail: 'mercado vazio',
    };

  // Multipla de jogos diferentes ja' chega com o evento rotulado
  // "Múltipla (N jogos)" (ver foldMultiEventGame); aqui so' sobra a de um jogo.
  const fragments = text
    .split(' / ')
    .flatMap((part) => part.split(' · '))
    .map((part) => part.trim())
    .filter(Boolean);

  const conditions: Condition[] = [];
  for (const fragment of fragments) {
    if (ALTERNATIVE.test(fragment) && !DOUBLE_CHANCE.test(fragment))
      return {
        ok: false,
        reason: 'CONDICAO_ALTERNATIVA',
        detail: `alternativa "ou" no texto: "${fragment}"`,
      };
    const parsed = parseFragment(fragment, teams);
    if (!parsed.ok) return parsed;
    conditions.push(...parsed.conditions);
  }

  return conditions.length
    ? { ok: true, conditions }
    : {
        ok: false,
        reason: 'MERCADO_NAO_RECONHECIDO',
        detail: 'nenhuma condicao extraida',
      };
}

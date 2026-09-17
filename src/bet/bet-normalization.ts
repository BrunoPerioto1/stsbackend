// Labels are removed only as whole, delimiter-separated UI fragments.
export const BET_UI_LABELS = new Set([
  'super odds',
  'super odd',
  'turbinada',
  'odds turbinadas',
  'criar aposta',
  'montar aposta',
  'aposta simples',
  'bilhete',
  'adicionar seleção',
  'fazer aposta',
  'apostar',
  'confirmar aposta',
]);

export function cleanBetText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().split(/(\s*:\s+|\s+[-–—|/]\s+|\r?\n+)/);
  const kept: string[] = [];
  for (let i = 0; i < text.length; i += 2) {
    const part = text[i].trim();
    if (!part || BET_UI_LABELS.has(part.toLocaleLowerCase('pt-BR'))) continue;
    if (kept.length) kept.push(text[i - 1].includes('\n') ? ' ' : text[i - 1]);
    kept.push(part);
  }
  return kept.join('').replace(/\s+/g, ' ').trim() || null;
}

// A IA devolve o mercado com a caixa que estava no bilhete, e casa nenhuma
// escreve "Mais de 1.5 gols" — desce tudo minúsculo. Sobe só a inicial de cada
// seleção (" / " é o separador de seleções em todo o fluxo de ingestão); o
// resto do texto fica exatamente como veio, pra não estragar nome próprio,
// sigla ("1x2", "BTTS") nem linha numérica.
export function capitalizeMarket(value: string | null): string | null {
  if (!value) return value;
  return value
    .split(' / ')
    .map((selection) =>
      selection.replace(/^\p{Ll}/u, (letter) =>
        letter.toLocaleUpperCase('pt-BR'),
      ),
    )
    .join(' / ');
}

// Uma multipla de jogos diferentes nao tem "o jogo" da aposta: o evento vira o
// rotulo com a contagem e os confrontos descem pro mercado, junto das selecoes.
// Multipla do mesmo confronto (varias selecoes de "Vitoria vs Gremio") nao e
// afetada — ali o evento continua sendo o jogo.
export function foldMultiEventGame(
  game: string | null,
  market: string | null,
): { game: string | null; market: string | null } {
  if (!game) return { game, market };
  const events = game
    .split(' / ')
    .map((part) => part.trim())
    .filter(Boolean);
  if (events.length < 2) return { game, market };

  const list = events.join(' / ');
  // O prompt ja pede cada selecao prefixada pelo confronto; a lista so e
  // acrescentada quando o modelo devolveu o mercado sem ela, pra nao repetir
  // nem tentar adivinhar qual selecao pertence a qual jogo.
  const mentioned =
    market != null &&
    events.some((event) =>
      comparableGame(market).includes(comparableGame(event)),
    );
  return {
    game: `Múltipla (${events.length} jogos)`,
    market: !market ? list : mentioned ? market : `${list} · ${market}`,
  };
}

export function normalizeBetNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const isMoney = /^R\$/.test(value.trim());
  let text = value.trim().replace(/^R\$\s*/, '');
  if (/^[+-]?\d{1,3}(?:\.\d{3})+,\d+$/.test(text)) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (
    // "1.500" é milhar quando veio como dinheiro (R$) ou tem mais de um
    // grupo ("1.234.567"). Sem R$ e com um grupo só fica ambíguo com uma
    // odd de três casas, então segue decimal.
    /^[+-]?\d{1,3}(?:\.\d{3})+$/.test(text) &&
    (isMoney || text.split('.').length > 2)
  ) {
    text = text.replace(/\./g, '');
  } else if (/^[+-]?\d+(?:[.,]\d+)?$/.test(text)) {
    text = text.replace(',', '.');
  } else return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export interface RawBetData {
  game?: unknown;
  market?: unknown;
  sport?: unknown;
  odd?: unknown;
  stake?: unknown;
}

export function normalizeBetData(data: RawBetData, diagnostics = true) {
  const multi = foldMultiEventGame(
    cleanBetText(data.game),
    capitalizeMarket(cleanBetText(data.market)),
  );
  const normalized = {
    game: multi.game,
    market: multi.market,
    sport: cleanBetText(data.sport),
    odd: normalizeBetNumber(data.odd),
    stake: normalizeBetNumber(data.stake),
  };
  // Opt-in field diagnostics; never log prompts, transcripts or Telegram IDs.
  if (
    diagnostics &&
    process.env.BET_DIAGNOSTICS === 'true' &&
    process.env.NODE_ENV !== 'production'
  ) {
    const raw = Object.fromEntries(
      Object.keys(normalized).map((key) => [key, data[key]]),
    );
    console.debug('[AI_EXTRACTION]', raw);
    console.debug('[BET_NORMALIZED]', normalized);
  }
  return normalized;
}

export type BetOrigin =
  | { source: 'app'; sourceType: 'manual' }
  | {
      source: 'telegram';
      sourceType: 'text' | 'image' | 'audio';
      telegramMessageId?: number;
      telegramChatId?: string;
    };

export const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;
type ComparableBet = RawBetData & {
  userId?: number | null;
  houseId?: number | null;
};

// Forma canonica de comparacao de texto de aposta. Usada pela impressao
// digital de duplicata e pelo matching com pendencias do /pendentes — os dois
// precisam enxergar "Bahia x Palmeiras" e "Bahia vs Palmeiras" como iguais.
export function comparableText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, '$1.')
    .replace(/\s+/g, ' ')
    .trim();
}

export function comparableGame(text: string): string {
  return comparableText(text).replace(/\s+(?:x|vs\.?|versus)\s+/g, ' vs ');
}

export function betFingerprint(bet: ComparableBet): string | null {
  const data = normalizeBetData(bet, false);
  if (
    !bet.userId ||
    !bet.houseId ||
    !data.game ||
    !data.market ||
    data.odd === null ||
    data.stake === null
  )
    return null;
  return JSON.stringify([
    bet.userId,
    bet.houseId,
    comparableGame(data.game),
    comparableText(data.market),
    data.odd,
    data.stake,
  ]);
}

export function detectPotentialDuplicate(
  bet: ComparableBet,
  candidates: (ComparableBet & { id: number; createdAt: Date })[],
  now: Date,
) {
  const fingerprint = betFingerprint(bet);
  const existing =
    fingerprint &&
    candidates.find((candidate) => {
      const age = now.getTime() - new Date(candidate.createdAt).getTime();
      return (
        age >= 0 &&
        age <= DUPLICATE_WINDOW_MS &&
        betFingerprint(candidate) === fingerprint
      );
    });
  return existing
    ? {
        isPotentialDuplicate: true,
        existingBetId: existing.id,
        existingCreatedAt: new Date(existing.createdAt),
        reason: 'same_event_market_odd_stake_recent' as const,
      }
    : { isPotentialDuplicate: false };
}

// Forma canônica do mercado, uma por tipo, no exemplo "Flamengo x Palmeiras".
// É o que o liquidador (src/settlement) lê: a IA reescreve a abreviação do
// tipster ("Flamengo ML e o2.5", "BTTS", "cantos") pra estas formas em vez de
// copiar o texto. O teste garante que cada exemplo aqui é entendido pelo
// liquidador — se o parser mudar, o prompt não fica mentindo.
export const FORMATOS_DE_MERCADO: readonly (readonly [string, string])[] = [
  ['vitória / empate', 'Flamengo - Resultado final'],
  ['empate', 'Empate - Resultado final'],
  ['dupla chance', 'Flamengo ou Empate - Dupla chance'],
  ['empate anula (DNB)', 'Flamengo +0 - Handicap asiático'],
  ['handicap', 'Flamengo -1.5 - Handicap'],
  ['total de gols do jogo', 'Mais de 2.5 - Total de gols'],
  ['gols de um time', 'Flamengo mais de 1.5 - Total de gols'],
  ['ambas marcam', 'Sim - Ambas marcam'],
  ['placar exato', '2-1 - Resultado correto'],
  ['vencer sem sofrer gol', 'Flamengo vencer sem sofrer gols'],
  ['não sofrer gol', 'Flamengo não sofre gols - Sim'],
  ['resultado do 1º tempo', 'Flamengo - Resultado do 1º tempo'],
  ['gols do 1º tempo', 'Mais de 0.5 - Total de gols 1º tempo'],
  ['intervalo/final', 'Flamengo/Flamengo - Intervalo/final'],
  ['vencer um dos tempos', 'Flamengo vencer um dos tempos - Sim'],
  ['marcar em ambos os tempos', 'Flamengo marcar em ambos os tempos - Sim'],
  ['primeiro gol', 'Flamengo - Primeiro gol'],
  ['escanteios do jogo', 'Mais de 9.5 - Escanteios'],
  ['escanteios de um time', 'Flamengo mais de 4.5 - Escanteios'],
  ['time com mais escanteios', 'Flamengo - Maior número de escanteios'],
  ['cartões do jogo', 'Mais de 4.5 - Total de cartões'],
  ['chutes a gol do jogo', 'Mais de 8.5 - Chutes a gol'],
  ['jogador marca', 'Pedro - Marcar a qualquer momento'],
  ['jogador gol ou assistência', 'Pedro - Gol ou assistência'],
  ['chutes a gol de jogador', 'Pedro mais de 0.5 - Chutes a gol'],
  ['assistência de jogador', 'Pedro - Jogador assistência'],
  ['faltas de jogador', 'Pedro mais de 1.5 - Faltas cometidas'],
  ['faltas sofridas por jogador', 'Pedro mais de 2.5 - Faltas sofridas'],
  ['defesas do goleiro', 'Weverton mais de 2.5 - Defesas do goleiro'],
  ['resultado e total juntos', 'Flamengo e Mais de 2.5 - Resultado final e total de gols'],
];

export const BET_EXTRACTION_RULES = `Evento contém somente o confronto/participantes; mercado contém seleção, jogador, linha e condição, preservando negações e conectivos.
Escreva o mercado na forma canônica "Seleção - Rótulo", uma seleção por perna separada por " / ", expandindo abreviações: ML = vitória, o2.5/over 2.5/+2.5 = Mais de 2.5, u2.5/under 2.5 = Menos de 2.5, 3+ = Mais de 2.5, BTTS = Ambas marcam, cantos/esc = escanteios, HT = 1º tempo, FT = tempo normal, DC = dupla chance, DNB = empate anula, "vence a 0" = vencer sem sofrer gols. Use o nome do time como aparece no evento. Formas (exemplo em Flamengo x Palmeiras):
${FORMATOS_DE_MERCADO.map(([tipo, exemplo]) => `- ${tipo}: ${exemplo}`).join('\n')}
Mercado que não se encaixe em nenhuma forma: mantenha o texto original. Nunca mude linha, lado, período ou sentido (sim/não) ao reescrever. Ignore botões, títulos da tela e promoções em ambos. Esporte só pode ser inferido com contexto forte; participantes ambíguos devem retornar null. Em aposta múltipla de mais de um confronto não existe um jogo: o evento é o rótulo "Múltipla (N jogos)", com N = quantidade de confrontos, e cada seleção no mercado vem prefixada pelo seu confronto, separadas por " / " — "Real Madrid vs Osasuna - vitória / Barcelona vs Getafe - vitória". Vale igual quando o bilhete cita só um time por seleção, sem o adversário ("Liverpool, Arsenal e PSG vencem"): são três confrontos, o evento é "Múltipla (3 jogos)" e o mercado traz cada time como uma seleção — nunca retorne evento null nesse caso. Se todas as seleções forem do mesmo confronto, o evento é esse confronto normalmente. Se as seleções forem de esportes diferentes, esporte é "Vários". Não invente dados ausentes.`;

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
  const normalized = {
    game: cleanBetText(data.game),
    market: capitalizeMarket(cleanBetText(data.market)),
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
  const comparable = (text: string) =>
    text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/(\d),(?=\d)/g, '$1.')
      .replace(/\s+/g, ' ')
      .trim();
  return JSON.stringify([
    bet.userId,
    bet.houseId,
    comparable(data.game).replace(/\s+(?:x|vs\.?|versus)\s+/g, ' vs '),
    comparable(data.market),
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

export const BET_EXTRACTION_RULES = `Evento contém somente o confronto/participantes; mercado contém seleção, jogador, linha e condição, preservando negações e conectivos. Ignore botões, títulos da tela e promoções em ambos. Esporte só pode ser inferido com contexto forte; participantes ambíguos devem retornar null. Não invente dados ausentes.`;

import stringSimilarity from 'string-similarity';
import { comparableGame, comparableText } from '../bet/bet-normalization';
import { normalizeName } from '../common/utils/bet.utils';

// Comparacao local (zero IA) entre a aposta lida de um print e as pendencias
// do /pendentes do usuario. Objetivo: nao planilhar duas vezes a mesma aposta
// que ja chegou como tip. Nada aqui decide sozinho — o score so define se vale
// perguntar "e a mesma aposta?" ao usuario.

export interface BetMatchInput {
  game: string;
  market: string;
  house: string;
  odd: number;
  stake: number;
  at: Date;
}

export interface PendingCandidate extends BetMatchInput {
  tipId: number;
}

export const MATCH_HIGH = 0.75;
export const MATCH_MEDIUM = 0.55;

const HOUR_MS = 60 * 60 * 1000;
// Tip mais velha que isso nao e a aposta do print, mesmo com tudo batendo.
// Exportado porque a query que busca candidatos usa a mesma janela — buscar
// mais do que o scorer aceita seria trabalho jogado fora.
export const MATCH_MAX_AGE_MS = 24 * HOUR_MS;
// Nomes de casa vem do texto da tip e da legenda da foto — mesma regua do
// resolveHouseId, pra "Superbet" e "Superbet Brasil" continuarem a mesma casa.
const HOUSE_MIN_SIMILARITY = 0.8;

const deaccent = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '');

const gameKey = (text: string) => deaccent(comparableGame(text ?? ''));
const marketKey = (text: string) => deaccent(comparableText(text ?? ''));

// Odd e stake sao numeros: diferenca relativa, nao fuzzy de string. Odd tem
// tolerancia apertada (a casa mostra o valor exato); stake tem tolerancia
// maior porque a da tip e estimada pela % da banca e pode ter batido no limite.
function numberScore(
  a: number,
  b: number,
  tight: number,
  loose: number,
): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return 0;
  const diff = Math.abs(a - b) / Math.max(a, b);
  if (diff <= tight) return 1;
  if (diff <= loose) return 0.5;
  return 0;
}

// Casa diferente e outra aposta — por isso e veto, nao peso. A legenda da
// foto e o texto da tip escrevem a mesma casa de jeitos diferentes
// ("Superbet" / "Superbet Brasil"), entao contencao conta como igual.
function sameHouse(a: string, b: string): boolean {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  return (
    stringSimilarity.compareTwoStrings(left, right) >= HOUSE_MIN_SIMILARITY
  );
}

function similarity(a: string, b: string, floor: number): number {
  if (!a || !b) return 0;
  const rating = stringSimilarity.compareTwoStrings(a, b);
  // Abaixo do piso e ruido de palavra em comum ("gols", "mais de"), nao sinal.
  return rating >= floor ? rating : 0;
}

// Retorna null quando o candidato esta descartado de vez (casa diferente ou
// velho demais); caso contrario, score de 0 a 1.
export function scoreBetMatch(
  bet: BetMatchInput,
  candidate: PendingCandidate,
): number | null {
  const ageMs = Math.abs(bet.at.getTime() - candidate.at.getTime());
  if (!Number.isFinite(ageMs) || ageMs > MATCH_MAX_AGE_MS) return null;

  if (!sameHouse(bet.house, candidate.house)) return null;

  const timeScore = ageMs <= 2 * HOUR_MS ? 1 : ageMs <= 6 * HOUR_MS ? 0.5 : 0;

  return (
    0.3 * similarity(gameKey(bet.game), gameKey(candidate.game), 0.5) +
    0.2 * similarity(marketKey(bet.market), marketKey(candidate.market), 0.4) +
    0.25 * numberScore(bet.odd, candidate.odd, 0.01, 0.03) +
    0.2 * numberScore(bet.stake, candidate.stake, 0.02, 0.1) +
    0.05 * timeScore
  );
}

export function findBetMatches(
  bet: BetMatchInput,
  candidates: PendingCandidate[],
  limit = 3,
): { candidate: PendingCandidate; score: number }[] {
  return candidates
    .map((candidate) => ({ candidate, score: scoreBetMatch(bet, candidate) }))
    .filter(
      (row): row is { candidate: PendingCandidate; score: number } =>
        row.score !== null && row.score >= MATCH_MEDIUM,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

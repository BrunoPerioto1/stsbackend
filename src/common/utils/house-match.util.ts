import stringSimilarity from 'string-similarity';
import { normalizeName } from './bet.utils';

export interface HouseNameCandidate {
  id: number;
  name: string;
  aliases?: string[] | null;
}

// Casamento "nome que veio na mensagem" → casa cadastrada. Mora aqui porque
// duas coisas precisam concordar sobre de que casa é uma tip: o Planilhar
// (resolveHouseId) e o filtro de casas da tela de Tips — a casa da tip só
// existe como texto, então filtrar por houseId passa por este casamento.
export function matchHouseIdByName(
  rawName: string | null | undefined,
  houses: HouseNameCandidate[],
): number | null {
  const houseName = normalizeName(rawName ?? '');
  if (!houseName) return null;
  if (!houses?.length) return null;

  // Aliases são cadastrados manualmente pra variações conhecidas ("Superbet
  // Brasil", "Pagol Bet") e comparados por igualdade exata (pós-
  // normalização) — deliberadamente sem heurística de substring aqui, que
  // fica ambígua quando existe casa com nome curto/genérico (ex.: "Bet7k"
  // poderia bater tanto com uma casa "7k" quanto com uma hipotética "Bet").
  for (const h of houses) {
    const aliasMatch = (h.aliases ?? []).some((a) => normalizeName(a) === houseName);
    if (aliasMatch) return h.id;
  }

  const normalizedHouses = houses
    .map((h) => ({ id: h.id, normalized: normalizeName(h.name) }))
    .filter((h) => !!h.normalized);

  if (!normalizedHouses.length) return null;

  const names = normalizedHouses.map((h) => h.normalized);
  // string-similarity não traz tipos; sem a anotação o resultado vira `any` e
  // contamina o resto da função.
  const { bestMatch, bestMatchIndex } = stringSimilarity.findBestMatch(
    houseName,
    names,
  ) as { bestMatch: { rating: number }; bestMatchIndex: number };

  return bestMatch.rating >= 0.8 ? normalizedHouses[bestMatchIndex].id : null;
}

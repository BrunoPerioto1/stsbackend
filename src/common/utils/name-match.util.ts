import stringSimilarity from 'string-similarity';
import { normalizeName } from './bet.utils';

export interface NameCandidate {
  id: number;
  name: string;
  aliases?: string[] | null;
}

// Casa "nome que veio na mensagem" com uma linha cadastrada — casa de aposta
// ou esporte. Existe porque nenhum dos dois chega como id: o parser devolve
// texto livre ("Superbet Brasil", "Soccer"), e quem planilha, quem filtra e
// quem classifica precisam concordar sobre a mesma linha.
export function matchIdByName(
  rawName: string | null | undefined,
  candidates: NameCandidate[],
): number | null {
  const wanted = normalizeName(rawName ?? '');
  if (!wanted) return null;
  if (!candidates?.length) return null;

  // Aliases são cadastrados à mão pras variações conhecidas ("Superbet
  // Brasil", "NFL") e comparados por igualdade exata (pós-normalização) —
  // deliberadamente sem heurística de substring aqui, que fica ambígua quando
  // existe nome curto/genérico (ex.: "Bet7k" poderia bater tanto com uma casa
  // "7k" quanto com uma hipotética "Bet").
  for (const c of candidates) {
    const aliasMatch = (c.aliases ?? []).some((a) => normalizeName(a) === wanted);
    if (aliasMatch) return c.id;
  }

  const normalized = candidates
    .map((c) => ({ id: c.id, normalized: normalizeName(c.name) }))
    .filter((c) => !!c.normalized);

  if (!normalized.length) return null;

  const names = normalized.map((c) => c.normalized);
  // string-similarity não traz tipos; sem a anotação o resultado vira `any` e
  // contamina o resto da função.
  const { bestMatch, bestMatchIndex } = stringSimilarity.findBestMatch(
    wanted,
    names,
  ) as { bestMatch: { rating: number }; bestMatchIndex: number };

  return bestMatch.rating >= 0.8 ? normalized[bestMatchIndex].id : null;
}

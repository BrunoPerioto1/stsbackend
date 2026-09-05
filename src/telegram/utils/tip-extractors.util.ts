export function extractLimitFromText(text: string): number | null {
  if (!text) return null;
  const limitEmojiRegex = /🚦[^0-9]{0,15}([\d.,]+)/i;
  const wordsRegex = /(limite|limit|max|máximo)[^0-9]{0,15}([\d.,]+)/i;
  const m1 = text.match(limitEmojiRegex);
  const m2 = text.match(wordsRegex);
  const raw = (m1?.[1] || m2?.[2] || '').trim();
  if (!raw) return null;

  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.') // Caso brasileiro
    : raw; // Caso internacional

  const val = Number(normalized);
  console.log(
    `Limite extraído: "${raw}" -> normalizado: "${normalized}" -> valor: ${val}`,
  );
  return Number.isFinite(val) && val > 0 ? val : null;
}

export function isAvisoMessage(text: string): boolean {
  if (!text) return false;
  return /\b(SOBRECARGA|AVISO)\b/i.test(text);
}

// Mensagens de SOBRECARGA/AVISO vêm num template diferente — texto puro,
// sem 🏠/🆚/🏷 nenhum — mas sempre na mesma ordem depois da palavra-chave:
// casa, jogo, esporte, mercado, odd. Serve de fallback pros extractors acima
// quando o regex com emoji não bate.
function getAvisoLines(text: string): string[] | null {
  if (!isAvisoMessage(text)) return null;
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const markerIndex = lines.findIndex((l) => /\b(SOBRECARGA|AVISO)\b/i.test(l));
  if (markerIndex === -1) return null;
  return lines.slice(markerIndex + 1);
}

export function extractOddFromText(text: string): number | null {
  if (!text) return null;
  const m = text.match(/🏷\s*([\d]+(?:[.,][\d]+)?)/);
  const raw = m?.[1] ?? getAvisoLines(text)?.[4];
  if (!raw) return null;
  const val = Number(raw.replace(',', '.'));
  return Number.isFinite(val) && val > 1 ? val : null;
}

export function extractHouseFromText(text: string): string | null {
  if (!text) return null;
  const m = text.match(/^🏠\s*(.+)$/m);
  return m ? m[1].trim() : (getAvisoLines(text)?.[0] ?? null);
}

export function extractGameFromText(text: string): string | null {
  if (!text) return null;
  const m = text.match(/^🆚\s*(.+)$/m);
  return m ? m[1].trim() : (getAvisoLines(text)?.[1] ?? null);
}

export function extractMarketFromText(text: string): string | null {
  if (!text) return null;
  const m = text.match(/^📌\s*(.+)$/m);
  return m ? m[1].trim() : (getAvisoLines(text)?.[3] ?? null);
}

export function extractLinkFromText(text: string): string | null {
  if (!text) return null;
  const m = text.match(/https?:\/\/\S+/);
  return m ? m[0] : null;
}

export function extractPercent(text: string): number | null {
  if (!text) return null;

  // O emoji usado antes do percentual varia por ADM/fonte (🛑, 🔴, etc.) e o
  // formato SOBRECARGA/AVISO nem tem emoji — então não fixa em nenhum
  // específico: aceita qualquer linha que seja só "[algo curto] número%".
  const standaloneLineRegex =
    /^[^\n%\d]{0,6}(\d{1,3}(?:[.,]\d{1,2})?)[ \t]*%[ \t]*$/m;
  let m = text.match(standaloneLineRegex);

  if (!m) {
    // Último recurso: pega o primeiro "número%" em qualquer lugar do texto.
    m = text.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s*%/);
  }
  if (!m) return null;

  const raw = m[1];
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;

  const val = Number(normalized);
  return Number.isFinite(val) && val >= 0 ? val : null;
}

export function extractSportFromText(text: string): string | null {
  if (!text) return null;
  const m = text.match(/^⚽\ufe0f?\s*(.+)$/m);
  return m ? m[1].trim() : (getAvisoLines(text)?.[2] ?? null);
}

// Parse 100% local dos 4 campos que a IA extraía. Cobre os dois formatos
// (emoji e SOBRECARGA/AVISO). Retorna null se faltar qualquer campo — aí o
// chamador cai pro Groq.
export function parseBetLocal(
  text: string,
): { game: string; sport: string; market: string; odd: number } | null {
  const game = extractGameFromText(text);
  const sport = extractSportFromText(text);
  const market = extractMarketFromText(text);
  const odd = extractOddFromText(text);
  if (!game || !sport || !market || odd === null) return null;
  return { game, sport, market, odd };
}

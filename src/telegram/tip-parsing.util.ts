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
  console.log(`Limite extraído: "${raw}" -> normalizado: "${normalized}" -> valor: ${val}`);
  return Number.isFinite(val) && val > 0 ? val : null;
}

export function isAvisoMessage(text: string): boolean {
  if (!text) return false;
  return /\b(SOBRECARGA|AVISO)\b/i.test(text);
}

export function extractOddFromText(text: string): number | null {
  if (!text) return null;
  const m = text.match(/🏷\s*([\d]+(?:[.,][\d]+)?)/);
  if (!m) return null;
  const val = Number(m[1].replace(',', '.'));
  return Number.isFinite(val) && val > 1 ? val : null;
}

export function extractPercent(text: string): number | null {
  if (!text) return null;

  // O emoji usado antes do percentual varia por ADM/fonte (🛑, 🔴, etc.) e o
  // formato SOBRECARGA/AVISO nem tem emoji — então não fixa em nenhum
  // específico: aceita qualquer linha que seja só "[algo curto] número%".
  const standaloneLineRegex = /^[^\n%\d]{0,6}(\d{1,3}(?:[.,]\d{1,2})?)[ \t]*%[ \t]*$/m;
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

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Cabeçalho do prompt de "Editar" — carrega o messageId + tipo (texto/mídia)
// direto no texto da mensagem, sem precisar de estado em memória (o processo
// roda em serverless, então nada garante que a mesma instância trate o clique
// em Editar e a resposta com a nova odd). O texto original vem embutido logo
// depois da primeira linha em branco — mandado num <blockquote expandable>
// pra não poluir a tela, mas o conteúdo puro continua ali pra reconstruir.
export const EDIT_PROMPT_HEADER_RE = /^✏️ Editar aposta #(\d+)\|(t|p)\n/;
export const EDIT_PROMPT_INSTRUCTIONS =
  'Digite a odd (se precisar mudar a odd) ou o limite (se precisar).\n' +
  'Formato: odd 3.50  ·  limite 60  ·  ou os dois: 3.50 60';

export const UNLINKED_INSTRUCTIONS =
  '❌ Sua conta não está vinculada.\n\n' +
  'Pra vincular:\n' +
  '1️⃣ Entre em https://stsfront.vercel.app/login e faça login\n' +
  '2️⃣ Vá em Perfil → clique em "Vincular Telegram"\n' +
  '3️⃣ Copie o código que aparecer\n' +
  '4️⃣ Volte aqui e envie: /vincular CODIGO';

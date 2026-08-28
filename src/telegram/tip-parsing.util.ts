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

export function extractHouseFromText(text: string): string | null {
  if (!text) return null;
  const m = text.match(/^🏠\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

export function extractGameFromText(text: string): string | null {
  if (!text) return null;
  const m = text.match(/^🆚\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

// Ação + id da tip a partir do callback_data de um botão (ex.: "planilhar:42"
// -> { action: "planilhar", tipId: 42 }). Sem ":" (mensagens antigas, de
// antes da tip ganhar id) cai em tipId null — o handler decide o que fazer.
export function parseCallbackAction(data: string): { action: string; tipId: number | null } {
  const [action, idRaw] = data.split(':');
  const parsed = idRaw !== undefined ? Number(idRaw) : NaN;
  return { action, tipId: Number.isFinite(parsed) ? parsed : null };
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
export const EDIT_PROMPT_HEADER_RE = /^✏️ Editar aposta #(\d+)\|(t|p)\|(\d*)\n/;
export const EDIT_PROMPT_INSTRUCTIONS =
  'Digite o que quer mudar (um de cada vez):\n' +
  '• odd 3.50\n' +
  '• limite 60\n' +
  '• casa Superbet Brasil\n' +
  '• 3.50 60 (odd + limite juntos)';

export const UNLINKED_INSTRUCTIONS =
  '❌ Sua conta não está vinculada.\n\n' +
  'Pra vincular:\n' +
  '1️⃣ Entre em https://stsfront.vercel.app/login e faça login\n' +
  '2️⃣ Vá em Perfil → clique em "Vincular Telegram"\n' +
  '3️⃣ Copie o código que aparecer\n' +
  '4️⃣ Volte aqui e envie: /vincular CODIGO';

// Parágrafos de propaganda que vêm dentro do texto da tip (cadastro na casa,
// link de outro serviço de planilhar) e que não devem chegar na cópia
// individual — mantém só o que interessa (ex.: "Odd mudou? Clique AQUI").
export const TIP_BOILERPLATE_PATTERNS: RegExp[] = [/não tem cadastro/i, /planilhar com shark track/i];

export interface SimpleEntity {
  type: string;
  offset: number;
  length: number;
  [key: string]: any;
}

// Remove parágrafos inteiros (separados por linha em branco) que batem com
// algum dos padrões, e realinha as entidades (links, negrito, etc.) dos
// parágrafos que sobraram pros novos offsets — senão os links dos
// parágrafos mantidos ficam apontando pro lugar errado do texto.
export function stripBoilerplateParagraphs(
  text: string,
  entities: SimpleEntity[] | undefined,
  patterns: RegExp[],
): { text: string; entities: SimpleEntity[] | undefined } {
  const parts = text.split('\n\n');
  const paragraphs: { start: number; end: number; content: string }[] = [];
  let idx = 0;
  for (const part of parts) {
    paragraphs.push({ start: idx, end: idx + part.length, content: part });
    idx += part.length + 2;
  }

  const kept = paragraphs.filter((p) => !patterns.some((re) => re.test(p.content)));
  const newText = kept.map((p) => p.content).join('\n\n');

  if (!entities) return { text: newText, entities };

  const newEntities: SimpleEntity[] = [];
  let newIdx = 0;
  for (const p of kept) {
    const shift = p.start - newIdx;
    for (const e of entities) {
      if (e.offset >= p.start && e.offset + e.length <= p.end) {
        newEntities.push({ ...e, offset: e.offset - shift });
      }
    }
    newIdx += p.content.length + 2;
  }

  return { text: newText, entities: newEntities };
}

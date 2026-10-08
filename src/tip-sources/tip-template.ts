import { normalizeBetNumber } from '../bet/bet-normalization';

// Modelo de uma fonte de tips: diz onde, na mensagem do tipster, está cada
// campo. A mensagem que um modelo lê vira o card padrão (🏠 🆚 ⚽️ 📌 🏷 🚦 %)
// logo na entrada — fan-out, Planilhar, Editar e /pendentes leem o texto da
// tip pelos extractors de utils/tip-extractors.util.ts, e só conhecem esse
// formato. Traduzir na porta deixa todos eles como estão.
//
// A tela /admin/sources monta as regras a partir de trechos marcados num
// exemplo; o front repete a semântica de readField pra inferir a regra —
// mexeu aqui, confira sts/src/lib/tip-template.ts.

export const TEMPLATE_FIELDS = ['house', 'game', 'sport', 'market', 'odd', 'limit', 'percent'] as const;
export type TemplateField = (typeof TEMPLATE_FIELDS)[number];

// Sem um destes a tip não serve: o fan-out precisa da %, o Planilhar do resto.
// Limite é opcional — tip sem limite só não tem teto na recomendação.
export const REQUIRED_FIELDS: readonly TemplateField[] = ['house', 'game', 'sport', 'market', 'odd', 'percent'];

const NUMERIC_FIELDS: readonly TemplateField[] = ['odd', 'limit', 'percent'];

const MAX_TEXT = 100;
const MAX_LINE = 50;
const MAX_VALUE = 200;

/**
 * Onde um campo está. Sem `fixed`, o valor começa depois de `after` (1ª
 * ocorrência, sem diferenciar maiúscula) ou no começo da linha `line`, e vai
 * até `until` ou o fim da linha. Com os dois, `after` é procurado dentro da
 * linha. `line` conta só linhas com texto, a partir de 1.
 */
export interface FieldRule {
  line?: number;
  after?: string;
  until?: string;
  // A mensagem não traz o campo (ex.: tipster só manda futebol).
  fixed?: string;
}

export interface TipTemplate {
  // Texto que toda mensagem da fonte tem. Várias fontes chegam pelo mesmo
  // repasse no grupo Tips: é ele que impede um modelo de ler a mensagem de outro.
  marker?: string;
  fields: Partial<Record<TemplateField, FieldRule>>;
}

export interface TipValues {
  house: string;
  game: string;
  sport: string;
  market: string;
  odd: number;
  limit: number | null;
  percent: number;
}

export interface FieldReading {
  field: TemplateField;
  // Trecho lido como está na mensagem (ou o valor fixo).
  raw: string | null;
  // [início, fim) do trecho na mensagem; null pra valor fixo ou não achado.
  span: [number, number] | null;
  value: string | number | null;
  error: string | null;
}

export interface TemplateReading {
  markerFound: boolean;
  fields: FieldReading[];
  // Preenchido só quando a mensagem é desta fonte: marcador e obrigatórios ok.
  values: TipValues | null;
}

const lower = (s: string) => s.toLowerCase();

// Linhas com texto, aparadas, com a posição na mensagem.
function textLines(text: string): [number, number][] {
  const lines: [number, number][] = [];
  let start = 0;
  for (const raw of text.split('\n')) {
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed) lines.push([start + lead, start + lead + trimmed.length]);
    start += raw.length + 1;
  }
  return lines;
}

// Separador entre o rótulo e o valor ("Odd: 1.85", "Jogo - X"): não é valor.
// Traço só conta solto entre espaços — grudado no número é sinal ("-1.5" do
// handicap).
const LEADING_NOISE = /^(?:\s|[:|=>•@]|[-–—](?=\s))+/;
const TRAILING_NOISE = /(?:\s|[:|=>•]|(?<=\s)[-–—])+$/;
const NUMBER = /\d+(?:[.,]\d+)*/;

/** Acha o trecho da regra. Não interpreta: número e validação ficam em readTemplate. */
export function locate(text: string, rule: FieldRule): [number, number] | null {
  let from = 0;
  let to = text.length;
  if (rule.line !== undefined) {
    const line = textLines(text)[rule.line - 1];
    if (!line) return null;
    [from, to] = line;
  }

  let start = from;
  if (rule.after) {
    const at = lower(text.slice(from, to)).indexOf(lower(rule.after));
    if (at === -1) return null;
    start = from + at + rule.after.length;
  } else if (rule.line === undefined) {
    return null;
  }

  const newline = text.indexOf('\n', start);
  let end = Math.min(to, newline === -1 ? text.length : newline);
  if (rule.until) {
    const at = lower(text.slice(start, end)).indexOf(lower(rule.until));
    // Sem o `until` na linha vale a linha inteira: tipster que às vezes omite
    // o que vem depois ("@ Bet365") não perde a tip por isso.
    if (at !== -1) end = start + at;
  }

  const piece = text.slice(start, end);
  const lead = piece.match(LEADING_NOISE)?.[0].length ?? 0;
  const trail = piece.slice(lead).match(TRAILING_NOISE)?.[0].length ?? 0;
  if (lead + trail >= piece.length) return null;
  return [start + lead, end - trail];
}

function readNumber(field: TemplateField, raw: string): { value: number | null; offset: number; length: number } {
  const m = raw.match(NUMBER);
  if (!m) return { value: null, offset: 0, length: 0 };
  // Limite é dinheiro: "1.500" é mil e quinhentos, não uma odd de três casas.
  const value = normalizeBetNumber(field === 'limit' ? `R$ ${m[0]}` : m[0]);
  return { value, offset: m.index ?? 0, length: m[0].length };
}

function numberError(field: TemplateField, value: number): string | null {
  if (field === 'odd' && (value <= 1 || value >= 1000)) return 'Odd precisa ser maior que 1';
  if (field === 'percent' && (value <= 0 || value > 100)) return '% precisa ficar entre 0 e 100';
  if (field === 'limit' && value <= 0) return 'Limite precisa ser maior que zero';
  return null;
}

// O card é posicional por linha: quebra de linha no valor vira outro campo.
// Sem "%" pelo mesmo motivo do bet-preview: só a linha da % pode ter.
const cleanText = (s: string) => s.replace(/\s*\n\s*/g, ' ').replace(/%/g, '').trim().slice(0, MAX_VALUE);

function readField(text: string, field: TemplateField, rule: FieldRule | undefined): FieldReading {
  const empty = { field, raw: null, span: null, value: null };
  if (!rule) return { ...empty, error: REQUIRED_FIELDS.includes(field) ? 'Sem regra' : null };

  const fixed = rule.fixed?.trim();
  let raw: string;
  let span: [number, number] | null = null;
  if (fixed) {
    raw = fixed;
  } else {
    span = locate(text, rule);
    if (!span) return { ...empty, error: 'Não achou na mensagem' };
    raw = text.slice(span[0], span[1]);
  }

  if (!NUMERIC_FIELDS.includes(field)) {
    const value = cleanText(raw);
    return value ? { field, raw, span, value, error: null } : { field, raw, span, value: null, error: 'Vazio' };
  }

  const num = readNumber(field, raw);
  if (num.value === null) return { field, raw, span, value: null, error: 'Não é número' };
  // O destaque no exemplo cobre só o número, não o rótulo grudado nele.
  const numSpan: [number, number] | null = span ? [span[0] + num.offset, span[0] + num.offset + num.length] : null;
  return { field, raw, span: numSpan, value: num.value, error: numberError(field, num.value) };
}

export function readTemplate(text: string, template: TipTemplate): TemplateReading {
  const marker = template.marker?.trim();
  const markerFound = !marker || lower(text).includes(lower(marker));
  const fields = TEMPLATE_FIELDS.map((field) => readField(text, field, template.fields[field]));
  const byField = Object.fromEntries(fields.map((f) => [f.field, f])) as Record<TemplateField, FieldReading>;

  const complete = REQUIRED_FIELDS.every((f) => byField[f].value !== null && !byField[f].error);
  if (!markerFound || !complete) return { markerFound, fields, values: null };

  const limit = byField.limit;
  return {
    markerFound,
    fields,
    values: {
      house: byField.house.value as string,
      game: byField.game.value as string,
      sport: byField.sport.value as string,
      market: byField.market.value as string,
      odd: byField.odd.value as number,
      // Limite que não veio (ou veio estranho) não derruba a tip: só fica sem teto.
      limit: limit.value !== null && !limit.error ? (limit.value as number) : null,
      percent: byField.percent.value as number,
    },
  };
}

const ptBr = (n: number) => String(n).replace('.', ',');

/**
 * O card padrão que a tip da fonte vira. A linha da fonte vai por último: o
 * extractLimitFromText aceita "max"/"limite" seguido de número, e uma fonte
 * chamada "Max Tips" logo acima de "🏠 Bet365" virava limite de R$ 365.
 */
export function buildSourceCard(sourceName: string, v: TipValues): string {
  const lines = [
    `🏠 ${v.house}`,
    `🆚 ${v.game}`,
    `⚽️ ${v.sport}`,
    `📌 ${v.market}`,
    `🏷 ${v.odd.toFixed(2)}`,
  ];
  // Formato que o ✏️ Editar sabe reescrever: "🚦 ... R$ valor".
  if (v.limit !== null) lines.push(`🚦 Limite: R$ ${v.limit.toFixed(2)}`);
  lines.push(`🛑 ${ptBr(v.percent)}%`);
  lines.push(`📣 Fonte: ${cleanText(sourceName)}`);
  return lines.join('\n');
}

function ruleFrom(input: unknown, field: TemplateField): FieldRule | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error(`Regra de ${field} inválida`);
  const r = input as Record<string, unknown>;
  const text = (key: string): string | undefined => {
    const v = r[key];
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v !== 'string' || !v.trim()) throw new Error(`${field}.${key} precisa ser texto`);
    if (v.length > MAX_TEXT) throw new Error(`${field}.${key} passa de ${MAX_TEXT} caracteres`);
    return v;
  };

  const rule: FieldRule = {};
  if (r.line !== undefined && r.line !== null) {
    if (!Number.isInteger(r.line) || (r.line as number) < 1 || (r.line as number) > MAX_LINE)
      throw new Error(`${field}.line precisa ser um número de 1 a ${MAX_LINE}`);
    rule.line = r.line as number;
  }
  const after = text('after');
  const until = text('until');
  const fixed = text('fixed');
  if (after) rule.after = after;
  if (until) rule.until = until;
  if (fixed) rule.fixed = fixed.trim();
  // Regra que não aponta pra lugar nenhum é campo desligado.
  return rule.fixed || rule.line !== undefined || rule.after ? rule : undefined;
}

/**
 * Confere o JSON que veio da tela. Lança Error com o motivo em português.
 * `partial`: modelo ainda sendo montado (prévia) — campo obrigatório sem regra
 * não é erro, só aparece como "Sem regra" na leitura.
 */
export function parseTemplate(input: unknown, { partial = false } = {}): TipTemplate {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Modelo inválido');
  const raw = input as { marker?: unknown; fields?: unknown };
  if (raw.marker !== undefined && raw.marker !== null && typeof raw.marker !== 'string')
    throw new Error('Identificador precisa ser texto');
  const marker = typeof raw.marker === 'string' ? raw.marker.trim() : '';
  if (marker.length > MAX_TEXT) throw new Error(`Identificador passa de ${MAX_TEXT} caracteres`);
  if (!raw.fields || typeof raw.fields !== 'object' || Array.isArray(raw.fields))
    throw new Error('Modelo sem campos');

  const fieldsIn = raw.fields as Record<string, unknown>;
  const fields: TipTemplate['fields'] = {};
  for (const field of TEMPLATE_FIELDS) {
    const rule = ruleFrom(fieldsIn[field], field);
    if (rule) fields[field] = rule;
  }
  const missing = REQUIRED_FIELDS.filter((f) => !fields[f]);
  if (missing.length && !partial) throw new Error(`Faltam regras para: ${missing.map((f) => FIELD_LABELS[f]).join(', ')}`);
  return marker ? { marker, fields } : { fields };
}

export const FIELD_LABELS: Record<TemplateField, string> = {
  house: 'Casa',
  game: 'Jogo',
  sport: 'Esporte',
  market: 'Mercado',
  odd: 'Odd',
  limit: 'Limite',
  percent: '% da banca',
};

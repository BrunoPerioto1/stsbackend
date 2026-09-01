export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Parágrafos de propaganda que vêm dentro do texto da tip (cadastro na casa,
// link de outro serviço de planilhar) e que não devem chegar na cópia
// individual — mantém só o que interessa (ex.: "Odd mudou? Clique AQUI").
export const TIP_BOILERPLATE_PATTERNS: RegExp[] = [
  /não tem cadastro/i,
  /planilhar com shark track/i,
];

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

  const kept = paragraphs.filter(
    (p) => !patterns.some((re) => re.test(p.content)),
  );
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

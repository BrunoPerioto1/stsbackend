// Listas em query string chegam como "1,2,3" — o front manda separado por
// vírgula de propósito, pra não depender de como o axios serializaria um array.
export function toNumberArray({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
}

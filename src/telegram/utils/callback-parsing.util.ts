// Ação + args numéricos a partir do callback_data de um botão (ex.:
// "lista_planilhar:42:1" -> { action: "lista_planilhar", args: [42, 1] }).
// Cada handler sabe o que esperar em cada posição (tipId, página, etc.) —
// callback_data sem ":" (mensagens antigas, de antes da tip ganhar id) cai
// em args: [], então args[0] vira undefined e o handler trata como ausente.
export function parseCallbackAction(data: string): {
  action: string;
  args: number[];
} {
  const [action, ...rest] = data.split(':');
  const args = rest.map((p) => Number(p)).filter((n) => Number.isFinite(n));
  return { action, args };
}

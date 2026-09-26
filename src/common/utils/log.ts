/**
 * Argumentos pro `logger.error` do Nest: a mensagem com o motivo e, quando
 * houver, o stack. Passar o erro cru como 2º argumento faz o Nest tratá-lo
 * como "contexto" do log, e a mensagem sai como `[object Object]` ou sem stack.
 */
export function errorArgs(message: string, error: unknown): [string, string?] {
  if (error instanceof Error) {
    const text = `${message}: ${error.message}`;
    return error.stack ? [text, error.stack] : [text];
  }
  return [`${message}: ${String(error)}`];
}

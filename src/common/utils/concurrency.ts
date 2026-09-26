/**
 * Roda `fn` em cada item com no máximo `limit` chamadas ao mesmo tempo. O
 * fan-out de tips mandava uma DM de cada vez: com 30 usuários a última cópia
 * chegava segundos depois da primeira. Sem teto, estouraria o limite de envio
 * do Telegram (~30 mensagens/s por bot).
 */
export async function forEachWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

import { RateLimitedException, RateLimitService } from './rate-limit.service';

// Kysely falso: só o encadeamento que o consume usa, devolvendo o total de hits.
function fakeDb(hits: number | Error) {
  const chain: Record<string, unknown> = {};
  for (const method of ['insertInto', 'values', 'onConflict', 'returning']) chain[method] = () => chain;
  chain.executeTakeFirstOrThrow = () => (hits instanceof Error ? Promise.reject(hits) : Promise.resolve({ hits }));
  return chain;
}

describe('RateLimitService', () => {
  const rule = { limit: 3, windowMs: 60_000 };

  it('deixa passar até o limite', async () => {
    await expect(new RateLimitService(fakeDb(3) as any).consume('b', rule)).resolves.toBeUndefined();
  });

  it('barra o que passa do limite, dizendo quando volta', async () => {
    const now = 90_000; // 30s dentro da janela que começou em 60s
    await expect(new RateLimitService(fakeDb(4) as any).consume('b', rule, now)).rejects.toMatchObject({
      response: { retryAfterMs: 30_000 },
    });
    await expect(new RateLimitService(fakeDb(4) as any).consume('b', rule)).rejects.toBeInstanceOf(RateLimitedException);
  });

  it('banco fora do ar não derruba a funcionalidade', async () => {
    await expect(
      new RateLimitService(fakeDb(new Error('relation does not exist')) as any).consume('b', rule),
    ).resolves.toBeUndefined();
  });
});

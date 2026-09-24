import { daysUntil, extendAccess, hasAccess } from './access';

const DAY = 86_400_000;

describe('access', () => {
  it('sem prazo e ativo tem acesso; vencido ou desativado não', () => {
    expect(hasAccess({ isActive: true, accessUntil: null })).toBe(true);
    expect(
      hasAccess({ isActive: null, accessUntil: new Date(Date.now() + DAY) }),
    ).toBe(true);
    expect(
      hasAccess({ isActive: true, accessUntil: new Date(Date.now() - 1000) }),
    ).toBe(false);
    expect(hasAccess({ isActive: false, accessUntil: null })).toBe(false);
  });

  it('extendAccess soma no vencimento em dia e parte de agora quando vencido', () => {
    const future = new Date(Date.now() + 5 * DAY);
    expect(extendAccess(future, 30).getTime()).toBe(
      future.getTime() + 30 * DAY,
    );
    const renewed = extendAccess(new Date(Date.now() - 10 * DAY), 30).getTime();
    expect(Math.abs(renewed - (Date.now() + 30 * DAY))).toBeLessThan(1000);
  });

  it('daysUntil conta dias de calendário no fuso de SP', () => {
    const now = new Date('2026-09-23T02:30:00Z'); // 22/09 23:30 em SP
    expect(daysUntil(new Date('2026-09-23T04:00:00Z'), now)).toBe(1); // 23/09 01:00 SP
    expect(daysUntil(new Date('2026-09-22T12:00:00Z'), now)).toBe(0);
    expect(daysUntil(new Date('2026-09-25T20:00:00Z'), now)).toBe(3);
  });
});

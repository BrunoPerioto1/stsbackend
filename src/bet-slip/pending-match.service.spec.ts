import { PendingMatchService } from './pending-match.service';

const NL = String.fromCharCode(10);
const CANAL = [
  '🏠 Bet365',
  '🆚 Flamengo x Vasco',
  '📌 Over 2.5',
  '🏷 1.90',
].join(NL);

function setup(deliveryText: string | null) {
  const usersService = {
    findById: jest.fn().mockResolvedValue({ id: 1, minPercentFilter: null }),
    getUserStake: jest.fn().mockResolvedValue(1000),
  };
  const tipsService = {
    getSummaryForUser: jest.fn().mockResolvedValue([
      {
        // BIGINT: o pg devolve o id como string.
        id: '5',
        text: CANAL,
        percent: '1',
        createdAt: new Date('2026-09-30T12:00:00Z'),
        betId: null,
        dismissalId: null,
        deliveryText,
      },
    ]),
  };
  return new PendingMatchService(usersService as any, tipsService as any);
}

describe('pendências candidatas a vínculo com o print', () => {
  it('usam a odd e a casa da cópia editada no bot: é o que o print vai mostrar', async () => {
    const editada = `${CANAL.replace('🏷 1.90', '🏷 2.40').replace('🏠 Bet365', '🏠 Betano')}${NL}${NL}🎯 Recomendação de aposta: R$ 12,00`;
    const [candidata] = await setup(editada).loadCandidates(
      1,
      new Date('2026-09-30T13:00:00Z'),
    );
    expect(candidata).toMatchObject({
      tipId: 5,
      odd: 2.4,
      house: 'Betano',
      stake: 12,
      game: 'Flamengo x Vasco',
    });
  });

  it('sem entrega, ficam com o texto do canal', async () => {
    const [candidata] = await setup(null).loadCandidates(
      1,
      new Date('2026-09-30T13:00:00Z'),
    );
    expect(candidata).toMatchObject({
      tipId: 5,
      odd: 1.9,
      house: 'Bet365',
      stake: 10,
    });
  });
});

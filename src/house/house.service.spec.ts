import { HouseService } from './house.service';
import { HouseRepository } from '../infra/repository/house.repository';

describe('house balances', () => {
  it('includes transaction-only houses and clamps negative balance out of the total, keeping the gap in negativeAmount', async () => {
    const findAllHousesBalance = jest.fn().mockResolvedValue([
      { houseId: 1, houseName: 'Deposit only', totalBets: 0, settledBets: 0, totalStake: 0,
        totalBetProfit: 0, pendingBets: 0, wonBets: 0, lostBets: 0,
        totalDeposit: '100', totalWithdrawalRaw: '0', totalAdjustment: '0', lastMovementAt: null },
      { houseId: 2, houseName: 'Loss', totalBets: 2, settledBets: 1, totalStake: 100,
        totalBetProfit: '-50', pendingBets: 1, wonBets: 0, lostBets: 1,
        totalDeposit: '0', totalWithdrawalRaw: '-10', totalAdjustment: '5', lastMovementAt: null,
        lastBetAt: new Date('2026-09-01T12:00:00Z') },
    ]);
    const service = new HouseService({ findAllHousesBalance } as unknown as HouseRepository);
    const houses = await service.getAllHousesBalanceWithFilter({}, 7);
    expect(houses[0]).toMatchObject({ realHouseBalance: 100, totalBetProfit: 0, totalBets: 0, lastBetAt: null });
    expect(houses[1]).toMatchObject({ realHouseBalance: -55, totalBetProfit: -50, pendingBets: 1,
      lastBetAt: new Date('2026-09-01T12:00:00Z') });
    expect(await service.getHouseMetrics(7)).toEqual({ totalBalance: 100, totalDeposit: 100,
      totalWithdrawal: 10, consolidatedProfit: -50, negativeHouses: 1, negativeAmount: -55,
      totalHousesUsed: 2 });
  });
});

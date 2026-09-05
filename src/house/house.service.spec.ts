import { HouseService } from './house.service';
import { HouseRepository } from '../infra/repository/house.repository';

describe('house balances', () => {
  it('includes transaction-only houses and keeps negative balances in consolidated totals', async () => {
    const findAllHousesBalance = jest.fn().mockResolvedValue([
      { houseId: 1, houseName: 'Deposit only', totalBets: 0, totalStake: 0,
        totalBetProfit: 0, pendingBets: 0, wonBets: 0, lostBets: 0,
        totalDeposit: '100', totalWithdrawalRaw: '0', totalAdjustment: '0', lastMovementAt: null },
      { houseId: 2, houseName: 'Loss', totalBets: 2, totalStake: 100,
        totalBetProfit: '-50', pendingBets: 1, wonBets: 0, lostBets: 1,
        totalDeposit: '0', totalWithdrawalRaw: '-10', totalAdjustment: '5', lastMovementAt: null },
    ]);
    const service = new HouseService({ findAllHousesBalance } as unknown as HouseRepository);
    const houses = await service.getAllHousesBalanceWithFilter({}, 7);
    expect(houses[0]).toMatchObject({ realHouseBalance: 100, totalBetProfit: 0, totalBets: 0 });
    expect(houses[1]).toMatchObject({ realHouseBalance: -55, totalBetProfit: -50, pendingBets: 1 });
    expect(await service.getHouseMetrics(7)).toEqual({ totalBalance: 45, totalDeposit: 100,
      totalWithdrawal: 10, consolidatedProfit: -50, negativeHouses: 1, totalHousesUsed: 2 });
  });
});

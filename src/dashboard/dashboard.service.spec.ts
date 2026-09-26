import { DashboardService } from './dashboard.service';
import { DashboardRepository } from '../infra/repository/dashboard.repository';
import type { UserId } from '../db_types/Users';

describe('dashboard: ROI', () => {
  it('divide o lucro só pelo stake liquidado, não pelo que ainda está em aberto', async () => {
    const findDashboardMetrics = jest.fn().mockResolvedValue({
      totalBets: '4', settledBets: '2', wonBets: '1', lostBets: '1', pendingBets: '1', canceledBets: '1',
      averageStake: '100', averageOdd: '2', totalStaked: '400', settledStake: '200', totalProfit: '50',
    });
    const service = new DashboardService({ findDashboardMetrics } as unknown as DashboardRepository);
    const metrics = await service.getDashboardMetrics(1 as UserId, {});
    expect(metrics).toMatchObject({ roi: 0.25, totalStaked: 400, settledStake: 200 });
  });

  it('resumo mensal traz o ROI de cada mês sobre o stake liquidado', async () => {
    const findMonthlySummary = jest.fn().mockResolvedValue([
      { month: '2026-08-01', totalBets: '3', profitMonth: '30', settledStake: '200' },
      { month: '2026-09-01', totalBets: '1', profitMonth: '0', settledStake: '0' },
    ]);
    const service = new DashboardService({ findMonthlySummary } as unknown as DashboardRepository);
    expect(await service.getMonthlySummary(1 as UserId, {})).toEqual([
      { month: '2026-08-01', totalBets: 3, profitMonth: 30, settledStake: 200, roi: 0.15 },
      { month: '2026-09-01', totalBets: 1, profitMonth: 0, settledStake: 0, roi: 0 },
    ]);
  });

  it('sem nada liquidado o ROI é zero', async () => {
    const findDashboardMetrics = jest.fn().mockResolvedValue({
      totalBets: '1', settledBets: '0', wonBets: '0', lostBets: '0', pendingBets: '1', canceledBets: '0',
      averageStake: '100', averageOdd: '2', totalStaked: '100', settledStake: '0', totalProfit: '0',
    });
    const service = new DashboardService({ findDashboardMetrics } as unknown as DashboardRepository);
    expect((await service.getDashboardMetrics(1 as UserId, {}))?.roi).toBe(0);
  });
});

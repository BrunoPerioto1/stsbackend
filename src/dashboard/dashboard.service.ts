import { Injectable } from '@nestjs/common';
import { DashboardRepository } from '../infra/repository/dashboard.repository';
import { DashboardQueryDto, DashboardMetricsComparisonQueryDto } from './dto/dashboard-query.dto';
import { UserId } from '../db_types/Users';

@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  async getDailySummary(userId: UserId, filter: DashboardQueryDto) {
    return this.dashboardRepository.findDailySummary({ ...filter, userId });
  }

  async getMonthlySummary(userId: UserId, filter: DashboardQueryDto) {
    const rows = await this.dashboardRepository.findMonthlySummary({ ...filter, userId });
    return rows.map((r) => {
      const profitMonth = Number(r.profitMonth);
      const settledStake = Number(r.settledStake);
      return {
        month: r.month,
        totalBets: Number(r.totalBets),
        profitMonth,
        settledStake,
        roi: settledStake > 0 ? profitMonth / settledStake : 0,
      };
    });
  }

  async getProfitByHouse(userId: UserId, filter: DashboardQueryDto) {
    const rows = await this.dashboardRepository.findProfitByHouse({ ...filter, userId });
    return rows.map((r) => ({ house: r.house, profit: Number(r.profit) }));
  }

  async getBetDateRange(userId: UserId) {
    const range = await this.dashboardRepository.findBetDateRange(userId);
    return {
      firstBetDate: range?.firstBetDate ?? null,
      lastBetDate: range?.lastBetDate ?? null,
    };
  }

  async getDashboardMetrics(userId: UserId, filter: DashboardQueryDto) {
    const raw = await this.dashboardRepository.findDashboardMetrics({ ...filter, userId });

    if (!raw) return null;

    const totalBets   = Number(raw.totalBets);
    const wonBets     = Number(raw.wonBets);
    const settledBets = Number(raw.settledBets ?? 0);
    const totalStaked = Number(raw.totalStaked);
    const settledStake = Number(raw.settledStake ?? 0);
    const totalProfit = Number(raw.totalProfit);

    return {
      ...raw,
      totalBets,
      wonBets,
      settledBets,
      totalStaked,
      settledStake,
      totalProfit,
      lostBets:     Number(raw.lostBets),
      pendingBets:  Number(raw.pendingBets),
      canceledBets: Number(raw.canceledBets),
      averageStake: Number(raw.averageStake),
      averageOdd:   Number(raw.averageOdd),
      // Sobre ganhas + perdidas: settledBets agora inclui CASHOUT, que nao e'
      // acerto nem erro.
      hitRate: wonBets + Number(raw.lostBets) > 0 ? wonBets / (wonBets + Number(raw.lostBets)) : 0,
      // Mesma base do ranking de casas: lucro / stake liquidado.
      roi:     settledStake > 0 ? totalProfit / settledStake : 0,
    };
  }

  // Métricas do período atual + anterior numa chamada só — evita o front
  // bater duas vezes em /dashboard/metrics (uma pra cada período) e pagar
  // dois round-trips de function pra só montar o "vs. período anterior".
  async getDashboardMetricsComparison(userId: UserId, query: DashboardMetricsComparisonQueryDto) {
    const { previousStartDate, previousEndDate, ...current } = query;

    const [currentMetrics, previousMetrics] = await Promise.all([
      this.getDashboardMetrics(userId, current),
      this.getDashboardMetrics(userId, {
        houseId: query.houseId,
        houseIds: query.houseIds,
        sportIds: query.sportIds,
        startDate: previousStartDate,
        endDate: previousEndDate,
      }),
    ]);

    return { current: currentMetrics, previous: previousMetrics };
  }
}

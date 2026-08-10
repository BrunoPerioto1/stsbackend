import { Injectable } from '@nestjs/common';
import { DashboardRepository } from '../infra/repository/dashboard.repository';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { UserId } from '../db_types/Users';

@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  async getDailySummary(userId: UserId, filter: DashboardQueryDto) {
    return this.dashboardRepository.findDailySummary({ ...filter, userId });
  }

  async getMonthlySummary(userId: UserId, filter: DashboardQueryDto) {
    return this.dashboardRepository.findMonthlySummary({ ...filter, userId });
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
    const totalStaked = Number(raw.totalStaked);
    const totalProfit = Number(raw.totalProfit);

    return {
      ...raw,
      totalBets,
      wonBets,
      totalStaked,
      totalProfit,
      lostBets:     Number(raw.lostBets),
      pendingBets:  Number(raw.pendingBets),
      canceledBets: Number(raw.canceledBets),
      averageStake: Number(raw.averageStake),
      averageOdd:   Number(raw.averageOdd),
      hitRate: totalBets   > 0 ? wonBets     / totalBets   : 0,
      roi:     totalStaked > 0 ? totalProfit / totalStaked : 0,
    };
  }
}
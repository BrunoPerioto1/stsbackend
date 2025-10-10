import { Injectable } from '@nestjs/common';
import { DashboardRepository } from '../infra/repository/dashboard.repository';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import {
  DashboardMetrics,
  DailySummaryPoint,
  MonthSummaryPoint
} from './dto/dashboard-metrics.dto';

@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  async calculateMetrics(filters: DashboardQueryDto & { userId?: number }): Promise<DashboardMetrics | null> {
    return await this.dashboardRepository.findDashboardMetrics(filters as any);
  }

  // async getChartData(filters: DashboardQueryDto): Promise<ChartDataPoint[]> {
  //   const metrics = await this.calculateMetrics(filters);
  //   return [
  //     { date: 'Investido', value: metrics.totalInvestido },
  //     { date: 'Retorno', value: metrics.totalRetorno },
  //     { date: 'Lucro', value: metrics.lucroTotal },
  //   ];
  // }

  // async getPerformanceSummary(
  //   filters: DashboardQueryDto,
  // ): Promise<PerformanceSummary> {
  //   const metrics = await this.calculateMetrics(filters);
  //   let trend: 'positive' | 'negative' | 'neutral' = 'neutral';
  //   if (metrics.lucroTotal > 0) {
  //     trend = 'positive';
  //   } else if (metrics.lucroTotal < 0) {
  //     trend = 'negative';
  //   }
  //   const period = this.formatPeriod(filters.startDate, filters.endDate);
  //   return {
  //     period,
  //     metrics,
  //     trend,
  //   };
  // }

async getDailySummary(
  filters: DashboardQueryDto & { userId?: number },
): Promise<DailySummaryPoint[]> {
  return  await this.dashboardRepository.findDailySummary(filters as any);

  // return dailyData.map((day) => {
  //   return {
  //     date: day.date,
  //     totalBets: day.totalBets,
  //     profitDay: day.profitDay,
  //   };
  // });
  
}

async getMonthlySummary(
  filters: DashboardQueryDto & { userId?: number },
): Promise<MonthSummaryPoint[]> {
  return  await this.dashboardRepository.findMonthlySummary(filters as any);
}
}
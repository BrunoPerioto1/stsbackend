import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from '../infra/dto/dashboard-query.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('metrics')
  async getMetrics(@Query() query: DashboardQueryDto) {
    return this.dashboardService.calculateMetrics(query.startDate, query.endDate);
  }

  @Get('chart-data')
  async getChartData(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getChartData(query.startDate, query.endDate);
  }

  @Get('performance-summary')
  async getPerformanceSummary(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getPerformanceSummary(query.startDate, query.endDate);
  }
}

import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Obtém métricas do dashboard' })
  @ApiResponse({
    status: 200,
    description: 'Métricas retornadas com sucesso.',
  })
  async getMetrics(@Query() query: DashboardQueryDto) {
    return this.dashboardService.calculateMetrics(query);
  }

  // @Get('chart-data')
  // @ApiOperation({ summary: 'Obtém dados para gráficos do dashboard' })
  // @ApiResponse({
  //   status: 200,
  //   description: 'Dados dos gráficos retornados com sucesso.',
  // })
  // async getChartData(@Query() query: DashboardQueryDto) {
  //   return this.dashboardService.getChartData(query);
  // }

  // @Get('performance-summary')
  // @ApiOperation({ summary: 'Obtém resumo de performance' })
  // @ApiResponse({
  //   status: 200,
  //   description: 'Resumo de performance retornado com sucesso.',
  // })
  // async getPerformanceSummary(@Query() query: DashboardQueryDto) {
  //   return this.dashboardService.getPerformanceSummary(query);
  // }

  @Get('daily-summary')
  @ApiOperation({ summary: 'Obtém resumo diário para gráficos' })
  @ApiResponse({
    status: 200,
    description: 'Resumo diário retornado com sucesso.',
  })
  async getDailySummary(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getDailySummary(query);
  }
}

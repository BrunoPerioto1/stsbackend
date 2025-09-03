// src/dashboard/dashboard.service.ts
import { Injectable } from '@nestjs/common';
import { DashboardRepository } from '../infra/repository/dashboard.repository';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

// As interfaces e DTOs podem ser mantidos aqui ou em um arquivo de tipos separado.
export interface DashboardMetrics {
  totalApostas: number;
  apostasGanhas: number;
  apostasPerdidas: number;
  apostasPendentes: number;
  apostasCanceladas: number;
  totalInvestido: number;
  totalRetorno: number;
  lucroTotal: number;
  roi: number;
  taxaAcerto: number;
}

export interface ChartDataPoint {
  date: string;
  value: number;
}

export interface DailySummaryPoint {
  date: string;
  totalApostas: number;
  apostasGanhas: number;
  apostasPerdidas: number;
  apostasPendentes: number;
  totalInvestido: number;
  totalRetorno: number;
  lucroDia: number;
  roi: number;
  taxaAcerto: number;
}

export interface PerformanceSummary {
  period: string;
  metrics: DashboardMetrics;
  trend: 'positive' | 'negative' | 'neutral';
}

@Injectable()
export class DashboardService {
  
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  async calculateMetrics(filters: DashboardQueryDto): Promise<DashboardMetrics> {
    const bets = await this.dashboardRepository.findBetsWithResults(filters);

    let totalApostas = 0;
    let apostasGanhas = 0;
    let apostasPerdidas = 0;
    let apostasPendentes = 0;
    let apostasCanceladas = 0;
    let totalInvestido = 0;
    let totalRetorno = 0;

    // 2. Processa os dados brutos para calcular as métricas
    for (const bet of bets) {
      totalApostas++;
      const resultId = bet.result_id || 9;
      const stake = parseFloat(bet.stake);
      const odd = parseFloat(bet.odd);

      if (resultId === 1) { // Ganhou
        apostasGanhas++;
        totalInvestido += stake;
        totalRetorno += stake * odd;
      } else if (resultId === 2) { // Perdeu
        apostasPerdidas++;
        totalInvestido += stake;
      } else if (resultId === 9) { // Pendente
        apostasPendentes++;
      } else { // Cancelada ou outros
        apostasCanceladas++;
      }
    }

    const lucroTotal = totalRetorno - totalInvestido;
    const roi = totalInvestido > 0 ? (lucroTotal / totalInvestido) * 100 : 0;
    const apostasFinalizadas = apostasGanhas + apostasPerdidas;
    const taxaAcerto = apostasFinalizadas > 0 ? (apostasGanhas / apostasFinalizadas) * 100 : 0;

    // 3. Retorna os dados formatados
    return {
      totalApostas,
      apostasGanhas,
      apostasPerdidas,
      apostasPendentes,
      apostasCanceladas,
      totalInvestido: parseFloat(totalInvestido.toFixed(2)),
      totalRetorno: parseFloat(totalRetorno.toFixed(2)),
      lucroTotal: parseFloat(lucroTotal.toFixed(2)),
      roi: parseFloat(roi.toFixed(2)),
      taxaAcerto: parseFloat(taxaAcerto.toFixed(1))
    };
  }

  // Os outros métodos de formatação e sumário também usam o repositório indiretamente.
  async getChartData(filters: DashboardQueryDto): Promise<ChartDataPoint[]> {
    const metrics = await this.calculateMetrics(filters);
    return [
      { date: 'Investido', value: metrics.totalInvestido },
      { date: 'Retorno', value: metrics.totalRetorno },
      { date: 'Lucro', value: metrics.lucroTotal }
    ];
  }

  async getPerformanceSummary(filters: DashboardQueryDto): Promise<PerformanceSummary> {
    const metrics = await this.calculateMetrics(filters);
    let trend: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (metrics.lucroTotal > 0) {
      trend = 'positive';
    } else if (metrics.lucroTotal < 0) {
      trend = 'negative';
    }
    const period = this.formatPeriod(filters.startDate, filters.endDate);
    return {
      period,
      metrics,
      trend
    };
  }

  async getDailySummary(filters: DashboardQueryDto): Promise<DailySummaryPoint[]> {
    const dailyData = await this.dashboardRepository.findDailySummary(filters);
    
    return dailyData.map(day => {
      const totalInvestido = parseFloat(day.total_investido) || 0;
      const totalRetorno = parseFloat(day.total_retorno) || 0;
      const lucroDia = parseFloat(day.lucro_dia) || 0;
      const apostasFinalizadas = parseInt(day.apostas_ganhas) + parseInt(day.apostas_perdidas);
      
      const roi = totalInvestido > 0 ? (lucroDia / totalInvestido) * 100 : 0;
      const taxaAcerto = apostasFinalizadas > 0 ? (parseInt(day.apostas_ganhas) / apostasFinalizadas) * 100 : 0;

      return {
        date: day.data,
        totalApostas: parseInt(day.total_apostas),
        apostasGanhas: parseInt(day.apostas_ganhas),
        apostasPerdidas: parseInt(day.apostas_perdidas),
        apostasPendentes: parseInt(day.apostas_pendentes),
        totalInvestido: parseFloat(totalInvestido.toFixed(2)),
        totalRetorno: parseFloat(totalRetorno.toFixed(2)),
        lucroDia: parseFloat(lucroDia.toFixed(2)),
        roi: parseFloat(roi.toFixed(2)),
        taxaAcerto: parseFloat(taxaAcerto.toFixed(1))
      };
    });
  }

  private formatPeriod(startDate?: string, endDate?: string): string {
    if (!startDate && !endDate) {
      return 'Todo o período';
    }
    if (startDate && endDate) {
      const start = new Date(startDate).toLocaleDateString('pt-BR');
      const end = new Date(endDate).toLocaleDateString('pt-BR');
      return `${start} a ${end}`;
    }
    if (startDate) {
      const start = new Date(startDate).toLocaleDateString('pt-BR');
      return `A partir de ${start}`;
    }
    if (endDate) {
      const end = new Date(endDate).toLocaleDateString('pt-BR');
      return `Até ${end}`;
    }
    return 'Período não especificado';
  }
}
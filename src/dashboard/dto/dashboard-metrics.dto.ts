// As interfaces e DTOs podem ser mantidos aqui ou em um arquivo de tipos separado.
export interface DashboardMetrics {
  totalBets: number;
  wonBets: number;
  lostBets: number;
  pendingBets: number;
  canceledBets: number;
  totalStaked: number;
  totalReturn: number;
  averageStake: number;
  averageOdd: number;
  totalProfit: number;
  roi: number;
  hitRate: number;
}

// export interface ChartDataPoint {
//   date: string;
//   value: number;
// }

export interface DailySummaryPoint {
  date: string;
  totalBets: number;
  profitDay: number;
}

// export interface PerformanceSummary {
//   period: string;
//   metrics: DashboardMetrics;
//   trend: 'positive' | 'negative' | 'neutral';
// }

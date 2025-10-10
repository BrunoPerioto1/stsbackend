// src/dashboard/dashboard.repository.ts
import { Injectable } from '@nestjs/common';
import { pool } from '../db/db';
import { DashboardQueryDto } from '../../dashboard/dto/dashboard-query.dto';
import { DailySummaryPoint, DashboardMetrics, MonthSummaryPoint } from '../../dashboard/dto/dashboard-metrics.dto';
import { toCamel } from '../../common/utils/camelcase';

@Injectable()
export class DashboardRepository {
  private buildFilters(filters: DashboardQueryDto & { userId?: number }): { whereClause: string; params: any[] } {
    let whereClause = '';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.userId !== undefined) {
      whereClause += ` AND b.user_id = $${paramIndex}`;
      params.push(filters.userId);
      paramIndex++;
    }

    if (filters.house_id) {
      whereClause += ` AND b.house_id = $${paramIndex}`;
      params.push(filters.house_id);
      paramIndex++;
    }

    if (filters.startDate) {
      whereClause += ` AND b.bet_time >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters.endDate) {
      whereClause += ` AND b.bet_time <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    return { whereClause, params };
  }

  async findDailySummary(filters: DashboardQueryDto & { userId?: number }): Promise<DailySummaryPoint[]> {
    const { whereClause, params } = this.buildFilters(filters);

    const query = `
      SELECT 
        DATE(b.bet_time) AS "date",
        COUNT(b.id) AS "total_bets",
        COALESCE(SUM(b.profit), 0) AS "profit_day"
      FROM bets b
      LEFT JOIN bet_results br ON b.id = br.bet_id
      WHERE 1=1 ${whereClause}
      GROUP BY DATE(b.bet_time)
      ORDER BY DATE(b.bet_time) ASC
    `;

    const resultado = await pool.query(query, params);
    return await toCamel<DailySummaryPoint[]>(resultado.rows);
  }


// refatorar pra ksyelly pq nao faz sentido ter filtro por dia aqui 
  async findMonthlySummary(filters: DashboardQueryDto & { userId?: number }): Promise<MonthSummaryPoint[]> {
    const { whereClause, params } = this.buildFilters(filters);

    const query = `
      SELECT
        DATE_TRUNC('month', b.bet_time) AS "month",
        COUNT(b.id) AS "total_bets",
        COALESCE(SUM(b.profit), 0) AS "profit_month"
      FROM bets b
      LEFT JOIN bet_results br ON b.id = br.bet_id
      WHERE 1=1 ${whereClause}
      GROUP BY DATE_TRUNC('month', b.bet_time)
      ORDER BY DATE_TRUNC('month', b.bet_time) ASC
    `;
    const resultado = await pool.query(query, params);
    return await toCamel<MonthSummaryPoint[]>(resultado.rows);
  }

  async findDashboardMetrics(filters: DashboardQueryDto & { userId?: number }): Promise<DashboardMetrics | null> {
    const { whereClause, params } = this.buildFilters(filters);

    const query = `
      WITH bet_stats AS (
        SELECT 
          COUNT(b.id) as total_bets,
          COUNT(CASE WHEN br.result_id = 1 THEN 1 END) as won_bets,
          COUNT(CASE WHEN br.result_id = 2 THEN 1 END) as lost_bets,
          COUNT(CASE WHEN br.result_id = 9 THEN 1 END) as pending_bets,
          COUNT(CASE WHEN br.result_id = 3 THEN 1 END) as canceled_bets,
          COALESCE(AVG(b.stake), 0) as average_stake,
          COALESCE(AVG(b.odd), 0) as average_odd,
          COALESCE(SUM(b.stake), 0) as total_staked,
          COALESCE(SUM(b.profit), 0) as total_profit
        FROM bets b
        LEFT JOIN bet_results br ON b.id = br.bet_id
        WHERE 1=1 ${whereClause}
      )
      SELECT
        total_bets as "totalBets",
        won_bets as "wonBets",
        lost_bets as "lostBets",
        pending_bets as "pendingBets",
        average_stake as "averageStake",
        average_odd as "averageOdd",
        canceled_bets as "canceledBets",
        total_staked as "totalStaked",
        total_profit as "totalProfit",
        CASE WHEN total_staked > 0 
             THEN ROUND((total_profit / total_staked) * 100, 2)
             ELSE 0 END as "roi",
        CASE WHEN (won_bets + lost_bets) > 0
             THEN ROUND((won_bets::numeric / (won_bets + lost_bets)) * 100, 2)
             ELSE 0 END as "hitRate"
      FROM bet_stats;
    `;

    const result = await pool.query(query, params);
    if (result.rows.length) {
      return await toCamel<DashboardMetrics>(result.rows[0]);
    }
    return null;
  }
}

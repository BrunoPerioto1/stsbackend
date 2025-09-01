// src/dashboard/dashboard.repository.ts
import { Injectable } from '@nestjs/common';
import { pool } from '../db/db';
import { DashboardQueryDto } from '../dto/dashboard-query.dto';

@Injectable()
export class DashboardRepository {

  private buildFilters(filters: DashboardQueryDto): { whereClause: string, params: any[] } {
    let whereClause = '';
    const params: any[] = [];
    let paramIndex = 1;

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

  async findBetsWithResults(filters: DashboardQueryDto): Promise<any[]> {
    const { whereClause, params } = this.buildFilters(filters);
    
    const query = `
      SELECT 
        b.id,
        b.stake,
        b.odd,
        br.result_id,
        bh.name as casa_nome
      FROM bets b
      LEFT JOIN bet_results br ON b.id = br.bet_id
      LEFT JOIN betting_houses bh ON b.house_id = bh.id
      WHERE 1=1 ${whereClause}
    `;

    const resultado = await pool.query(query, params);
    return resultado.rows; 
  }

  async findDailySummary(filters: DashboardQueryDto): Promise<any[]> {
    const { whereClause, params } = this.buildFilters(filters);
    
    const query = `
      SELECT 
        DATE(b.bet_time) as data,
        COUNT(b.id) as total_apostas,
        COUNT(CASE WHEN br.result_id = 1 THEN 1 END) as apostas_ganhas,
        COUNT(CASE WHEN br.result_id = 2 THEN 1 END) as apostas_perdidas,
        COUNT(CASE WHEN br.result_id = 9 THEN 1 END) as apostas_pendentes,
        COALESCE(SUM(CASE WHEN br.result_id IN (1, 2) THEN b.stake END), 0) as total_investido,
        COALESCE(SUM(CASE WHEN br.result_id = 1 THEN b.stake * b.odd END), 0) as total_retorno,
        COALESCE(SUM(CASE WHEN br.result_id = 1 THEN (b.stake * b.odd) - b.stake END), 0) as lucro_dia
      FROM bets b
      LEFT JOIN bet_results br ON b.id = br.bet_id
      LEFT JOIN betting_houses bh ON b.house_id = bh.id
      WHERE 1=1 ${whereClause}
      GROUP BY DATE(b.bet_time)
      ORDER BY DATE(b.bet_time) ASC
    `;

    const resultado = await pool.query(query, params);
    return resultado.rows;
  }
}
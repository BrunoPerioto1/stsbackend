// src/dashboard/dashboard.repository.ts
import { Injectable } from '@nestjs/common';

import { pool } from '../db/db';

@Injectable()
export class DashboardRepository {

  private buildDateFilter(startDate?: string, endDate?: string): string {
    let filter = '';
    if (startDate) {
      filter += ` AND b.bet_time >= '${startDate}'`;
    }
    if (endDate) {
      filter += ` AND b.bet_time <= '${endDate}'`;
    }
    return filter;
  }

  async findBetsWithResults(startDate?: string, endDate?: string): Promise<any[]> {
    const whereClause = this.buildDateFilter(startDate, endDate);
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

    // Acessa a variável global 'pool' diretamente.
    const resultado = await pool.query(query);
    return resultado.rows; 
  }
}
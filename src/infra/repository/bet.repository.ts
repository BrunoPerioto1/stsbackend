import { Injectable, NotFoundException } from '@nestjs/common';
 import camelcaseKeys from 'camelcase-keys';
import { pool } from '../db/db'; 
import { ResultIdEnum } from '../../bet/dto/result-id.enum';
import { CreateBetDto, BetItem } from '../../bet/dto/bet.dto';
import { UpdateApostaDto } from '../../bet/dto/bet.dto';
import { BetFilterDto } from '../../bet/dto/bet-filter.dto';

@Injectable()
export class BetRepository {

  async create(betData: CreateBetDto): Promise<{ id: number }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insere a aposta
      const queryInserirAposta = `
        INSERT INTO bets (game, stake, odd, house_id, market, sport, profit, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, 0, $7)
        RETURNING *,
        (SELECT name FROM betting_houses WHERE id = $4) as house_name
      `;
      const resultadoAposta = await client.query(queryInserirAposta, [
        betData.game,
        betData.stake,
        betData.odd,
        betData.houseId,
        betData.market,
        betData.sport,
        betData.userId,
      ]);
      const aposta = resultadoAposta.rows[0];

      const queryInserirResultado = `
        INSERT INTO bet_results (bet_id) VALUES ($1)
      `;
      await client.query(queryInserirResultado, [aposta.id]);

      await client.query('COMMIT');
      return camelcaseKeys(aposta);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async update(betId: number, updateData: UpdateApostaDto, userId: number): Promise<any> {
    const camposAtualizar: string[] = [];
    const valoresAtualizar: any[] = [];
    let indiceParametro = 1;

    for (const chave in updateData) {
      if ((updateData as any)[chave] !== undefined) {
        const snakeKey = chave.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        camposAtualizar.push(`${snakeKey} = $${indiceParametro++}`);
        valoresAtualizar.push((updateData as any)[chave]);
      }
    }

    if (camposAtualizar.length === 0) {
      return null;
    }

    camposAtualizar.push(`updated_at = NOW()`);
    valoresAtualizar.push(betId);
    valoresAtualizar.push(userId);

    const queryAtualizar = `
      UPDATE bets 
      SET ${camposAtualizar.join(', ')}
      WHERE id = $${indiceParametro} AND user_id = $${indiceParametro + 1}
      RETURNING *
    `;

    const resultado = await pool.query(queryAtualizar, valoresAtualizar);
    return resultado.rowCount > 0 ? camelcaseKeys(resultado.rows[0]) : null;
  }

  async finalizeBetUpdate(betId: number, resultId: ResultIdEnum, profit: number, userId: number): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const queryResult = `
        UPDATE bet_results br
        SET result_id = $1, updated_at = NOW()
        FROM bets b
        WHERE br.bet_id = $2
          AND b.id = br.bet_id
          AND b.user_id = $3
        RETURNING br.*;
      `;
      const resResult = await client.query(queryResult, [resultId, betId, userId]);

      const queryProfit = `
        UPDATE bets
        SET profit = $1, updated_at = NOW()
        WHERE id = $2 AND user_id = $3
        RETURNING *;
      `;
      const resProfit = await client.query(queryProfit, [profit, betId, userId]);

      await client.query('COMMIT');

      if (resProfit.rowCount === 0 || resResult.rowCount === 0) {
        return null;
      }
      return {
        result: camelcaseKeys(resResult.rows[0]),
        bet: camelcaseKeys(resProfit.rows[0]),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async finalizeMultipleBets(betProfits: { betId: number; resultId: ResultIdEnum; profit: number }[], userId: number): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const results: Array<{betId: number; result: any; bet: any}> = [];
      
      for (const { betId, resultId, profit } of betProfits) {
        const resultQuery = `
          UPDATE bet_results br
          SET result_id = $1, updated_at = NOW()
          FROM bets b
          WHERE br.bet_id = $2
            AND b.id = br.bet_id
            AND b.user_id = $3
          RETURNING br.*;
        `;
        const resultRes = await client.query(resultQuery, [resultId, betId, userId]);
        
        const profitQuery = `
          UPDATE bets
          SET profit = $1, updated_at = NOW()
          WHERE id = $2 AND user_id = $3
          RETURNING *;
        `;
        const profitRes = await client.query(profitQuery, [profit, betId, userId]);
        
        if (resultRes.rowCount > 0 && profitRes.rowCount > 0) {
          results.push({
            betId,
            result: resultRes.rows[0],
            bet: profitRes.rows[0]
          });
        }
      }
      
      await client.query('COMMIT');
      
  const camelcaseKeys = (await import('camelcase-keys')).default;
  return camelcaseKeys(results, { deep: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async findBets(filters: BetFilterDto = {}): Promise<BetItem[] | BetItem | null> {
    const queryConditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (filters.betId !== undefined) {
      queryConditions.push(`b.id = $${paramIndex++}`);
      queryParams.push(filters.betId);
    }
    
    if (filters.userId !== undefined) {
      queryConditions.push(`b.user_id = $${paramIndex++}`);
      queryParams.push(filters.userId);
    }
    
    if (filters.startDate !== undefined) {
      queryConditions.push(`b.bet_time >= $${paramIndex++}`);
      queryParams.push(filters.startDate);
    }
    
    if (filters.endDate !== undefined) {
      queryConditions.push(`b.bet_time <= $${paramIndex++}`);
      queryParams.push(filters.endDate);
    }
    
    if (filters.resultId !== undefined) {
      queryConditions.push(`br.result_id = $${paramIndex++}`);
      queryParams.push(filters.resultId);
    }

    if (filters.market !== undefined) {
      queryConditions.push(`b.market ILIKE $${paramIndex++}`);
      queryParams.push(`%${filters.market}%`);
    }

    const whereClause = queryConditions.length > 0
      ? `WHERE ${queryConditions.join(' AND ')}`
      : '';
    
    const query = `
      SELECT
        b.id,
        b.game,
        b.stake,
        b.odd,
        b.house_id,
        b.market,
        b.sport,
        bh.name as house_name,
        b.profit,
        b.bet_time,
        br.result_id,
        r.name AS result_name
      FROM
        bets b
      LEFT JOIN
        bet_results br ON br.bet_id = b.id
      LEFT JOIN
        betting_houses bh ON bh.id = b.house_id
      LEFT JOIN
        results r ON br.result_id = r.id
      ${whereClause}
      ORDER BY
        b.bet_time DESC
    `;

    const result = await pool.query(query, queryParams);

    const camelcaseKeys = (await import('camelcase-keys')).default;
    if (filters.betId !== undefined) {
      return result.rowCount > 0 ? camelcaseKeys(result.rows[0]) : null;
    }
    return camelcaseKeys(result.rows);
  }

  async findById(betId: number): Promise<any> {
  const result = await pool.query('SELECT id, stake , odd FROM bets WHERE id = $1', [betId]);
  const camelcaseKeys = (await import('camelcase-keys')).default;
  return result.rowCount > 0 ? camelcaseKeys(result.rows[0]) : null;
  }

  async findByIds(betIds: number[], userId?: number): Promise<any[]> {
    const resultado = await pool.query(
      userId !== undefined
        ? 'SELECT id, stake, odd FROM bets WHERE id = ANY($1) AND user_id = $2'
        : 'SELECT id, stake, odd FROM bets WHERE id = ANY($1)',
      userId !== undefined ? [betIds, userId] : [betIds],
    );
    const camelcaseKeys = (await import('camelcase-keys')).default;
    return camelcaseKeys(resultado.rows);
  }

  async delete(betId: number, userId: number): Promise<boolean> {
    const resultado = await pool.query('DELETE FROM bets WHERE id = $1 AND user_id = $2', [betId, userId]);
    return resultado.rowCount > 0;
  }

  async deleteMany(betIds: number[], userId: number): Promise<number> {
    const resultado = await pool.query(
      'DELETE FROM bets WHERE id = ANY($1) AND user_id = $2',
      [betIds, userId]
    );
    return resultado.rowCount;
  }

  async resultTypes (): Promise<{ id: number; name: string }[]> {
    const resultado = await pool.query(
      'SELECT id, name FROM results ORDER BY name'
    );
    return resultado.rows;
  }
}

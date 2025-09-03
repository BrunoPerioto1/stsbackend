import { Injectable, NotFoundException } from '@nestjs/common';

import { pool } from '../db/db'; 
import { ResultIdEnum } from '../../bet/dto/result-id.enum';
import { CreateBetDto } from '../../bet/dto/new-bet.dto';
import { UpdateApostaDto } from '../../bet/dto/update-bet.dto';
import { BetFilterDto } from '../../bet/dto/bet-filter.dto';

@Injectable()
export class BetRepository {

  async create(betData: CreateBetDto): Promise<{ id: number }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const queryInserirAposta = `
        INSERT INTO bets (game, stake, odd, house_id, market, sport)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `;
      const resultadoAposta = await client.query(queryInserirAposta, [
        betData.game,
        betData.stake,
        betData.odd,
        betData.house_id,
        betData.market,
        betData.sport,
      ]);
      const apostaId = resultadoAposta.rows[0].id;

      // Consulta o ID do status PENDING da tabela de status
      const statusQuery = `
        SELECT id FROM bet_status WHERE name = 'PENDING'
      `;
      const statusResult = await client.query(statusQuery);
      const pendingStatusId = statusResult.rows[0]?.id || ResultIdEnum.PENDING; // Fallback para o enum caso não encontre
      
      const queryInserirResultado = `
        INSERT INTO bet_results (bet_id, result_id) VALUES ($1, $2)
      `;
      await client.query(queryInserirResultado, [
        apostaId,
        pendingStatusId,
      ]);

      await client.query('COMMIT');
      return { id: apostaId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async update(betId: number, updateData: UpdateApostaDto): Promise<any> {
    const camposAtualizar: string[] = [];
    const valoresAtualizar: any[] = [];
    let indiceParametro = 1;

    for (const chave in updateData) {
      if ((updateData as any)[chave] !== undefined) {
        camposAtualizar.push(`${chave} = $${indiceParametro++}`);
        valoresAtualizar.push((updateData as any)[chave]);
      }
    }

    if (camposAtualizar.length === 0) {
      return null;
    }

    camposAtualizar.push(`updated_at = NOW()`);
    valoresAtualizar.push(betId);

    const queryAtualizar = `
      UPDATE bets 
      SET ${camposAtualizar.join(', ')}
      WHERE id = $${indiceParametro}
      RETURNING *
    `;

    const resultado = await pool.query(queryAtualizar, valoresAtualizar);
    return resultado.rows[0];
  }

  async updateResult(betId: number, resultId: ResultIdEnum): Promise<any> {
    const queryResultado = `
      UPDATE bet_results 
      SET result_id = $1, updated_at = NOW()
      WHERE bet_id = $2
      RETURNING *
    `;
    const params = [resultId, betId];
    const resultado = await pool.query(queryResultado, params);
    return resultado.rows[0];
  }

  async updateProfit(betId: number, profit: number): Promise<any> {
    const queryAtualizar = `
      UPDATE bets 
      SET profit = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const params = [profit, betId];
    const resultado = await pool.query(queryAtualizar, params);
    return resultado.rows[0];
  }

  async updateMultipleResults(betIds: number[], resultId: ResultIdEnum): Promise<number> {
    const resultado = await pool.query(
      'UPDATE bet_results SET result_id = $1 WHERE bet_id = ANY($2)',
      [resultId, betIds],
    );
    return resultado.rowCount;
  }

  async updateMultipleProfits(betProfits: { betId: number; profit: number }[]): Promise<number> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      let totalUpdated = 0;
      for (const { betId, profit } of betProfits) {
        const resultado = await client.query(
          'UPDATE bets SET profit = $1, updated_at = NOW() WHERE id = $2',
          [profit, betId]
        );
        totalUpdated += resultado.rowCount;
      }
      
      await client.query('COMMIT');
      return totalUpdated;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async findBets(filters: BetFilterDto = {}): Promise<any[] | any | null> {
    const queryConditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (filters.betId !== undefined) {
      queryConditions.push(`b.id = $${paramIndex++}`);
      queryParams.push(filters.betId);
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
        b.profit,
        b.bet_time,
        br.result_id,
        r.name AS result_name
      FROM
        bets b
      LEFT JOIN
        bet_results br ON br.bet_id = b.id
      LEFT JOIN 
        results r ON br.result_id = r.id
      ${whereClause}
      ORDER BY
        b.bet_time DESC
    `;
    
    const resultado = await pool.query(query, queryParams);
    
    if (filters.betId !== undefined) {
      return resultado.rowCount > 0 ? resultado.rows[0] : null;
    }
    
    return resultado.rows;
  }
  
  // Updated helper methods using the new dynamic filter method
  async findAll(filters: BetFilterDto = {}): Promise<any[]> {
    return this.findBets(filters) as Promise<any[]>;
  }

  async findById(betId: number): Promise<any | null> {
    return this.findBets({ betId });
  }

  async findByIds(betIds: number[]): Promise<any[]> {
    const resultado = await pool.query(
      'SELECT id, stake, odd FROM bets WHERE id = ANY($1)',
      [betIds],
    );
    return resultado.rows;
  }

  async delete(betId: number): Promise<boolean> {
    const resultado = await pool.query('DELETE FROM bets WHERE id = $1', [betId]);
    return resultado.rowCount > 0;
  }

  async deleteMany(betIds: number[]): Promise<number> {
    const resultado = await pool.query(
      'DELETE FROM bets WHERE id = ANY($1)',
      [betIds]
    );
    return resultado.rowCount;
  }

  async houseExists(houseId: number): Promise<boolean> {
    const checagem = await pool.query('SELECT 1 FROM betting_houses WHERE id = $1', [houseId]);
    return checagem.rowCount > 0;
  }

  async getTransactionTypeId(typeName: string): Promise<number> {
    const resultado = await pool.query(
      'SELECT id FROM transaction_types WHERE name = $1',
      [typeName]
    );
    if (resultado.rowCount === 0) {
      throw new NotFoundException(`Transaction type '${typeName}' not found.`);
    }
    return resultado.rows[0].id;
  }

  async addTransaction(transactionData: { houseId: number; typeId: number; value: number; description: string }) {
    await pool.query(
      'INSERT INTO house_transactions (house_id, transaction_type_id, value, description) VALUES ($1, $2, $3, $4)',
      [transactionData.houseId, transactionData.typeId, transactionData.value, transactionData.description]
    );
  }

  async updateHouseBalance(houseId: number, value: number) {
    await pool.query(
      `UPDATE house_balances SET value = value + $1 WHERE house_id = $2`,
      [value, houseId]
    );
  }
}

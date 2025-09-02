import { Injectable, NotFoundException } from '@nestjs/common';

import { pool } from '../db/db'; 
import { ResultIdEnum } from '../dto/result-id.enum';
import { CreateBetDto } from '../dto/new-bet.dto';
import { UpdateApostaDto } from '../dto/update-bet.dto';

@Injectable()
export class BetRepository {

  private get baseQuery(): string {
    return `
      SELECT 
        a.*,
        c.name AS casa_nome,
        ar.result_id,
        CASE
          WHEN ar.result_id = ${ResultIdEnum.GANHOU} THEN a.stake * (a.odd - 1)
          WHEN ar.result_id = ${ResultIdEnum.PERDEU} THEN -a.stake
          WHEN ar.result_id IN (${ResultIdEnum.EMPATE}, ${ResultIdEnum.ANULADA}, ${ResultIdEnum.REEMBOLSADA}, ${ResultIdEnum.PENDENTE}) THEN 0
          WHEN ar.result_id IN (${ResultIdEnum.MEIO_GANHO}, ${ResultIdEnum.MEIO_GANHO_2}) THEN (a.stake / 2) * (a.odd - 1) + (a.stake / 2)
          WHEN ar.result_id = ${ResultIdEnum.MEIO_PERDIDO} THEN -(a.stake / 2)
          ELSE 0
        END AS lucro_calculado
      FROM bets a
      LEFT JOIN betting_houses c ON c.id = a.house_id
      LEFT JOIN bet_results ar ON a.id = ar.bet_id
    `;
  }

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

      const queryInserirResultado = `
        INSERT INTO bet_results (bet_id, result_id) VALUES ($1, $2)
      `;
      await client.query(queryInserirResultado, [
        apostaId,
        ResultIdEnum.PENDENTE,
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

  async findAll(): Promise<any[]> {
    const query = `${this.baseQuery} ORDER BY a.bet_time DESC`;
    const resultado = await pool.query(query);
    return resultado.rows;
  }

  async findById(betId: number): Promise<any | null> {
    const query = `${this.baseQuery} WHERE a.id = $1`;
    const params = [betId];
    const resultado = await pool.query(query, params);
    return resultado.rowCount > 0 ? resultado.rows[0] : null;
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

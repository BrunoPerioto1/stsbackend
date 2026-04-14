import { Injectable } from '@nestjs/common';
import { pool } from '../db/db'; 
import { ResultIdEnum } from '../../bet/dto/result-id.enum';
import { CreateBetDto, BetItem } from '../../bet/dto/bet.dto';
import { UpdateApostaDto } from '../../bet/dto/bet.dto';
import { BetFilterDto } from '../../bet/dto/bet-filter.dto';
import { toCamel } from '../../common/utils/camelcase';
import { filter } from 'rxjs/internal/operators/filter';
import { isNotEmpty } from 'class-validator';
import { UserId } from '../../db_types/Users';
import { BetId } from '../../db_types/Bet';
import { ResultId } from '../../db_types/Results';

export interface FilterGetBets {
  betId?: BetId;
  userId?: UserId;
  startDate?: Date;
  endDate?: Date;
  resultId?: ResultId;
  q?: string;
  page?: number;
  perPage?: number;
} 

@Injectable()
export class BetRepository {

  async create(betData: CreateBetDto): Promise<{ id: number }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

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

      await client.query(`INSERT INTO bet_results (bet_id) VALUES ($1)`, [aposta.id]);

      await client.query('COMMIT');
      return await toCamel(aposta);
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
    return resultado.rowCount > 0 ? await toCamel(resultado.rows[0]) : null;
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
        result: await toCamel(resResult.rows[0]),
        bet: await toCamel(resProfit.rows[0]),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async finalizeMultipleBets(
    betProfits: { betId: number; resultId: ResultIdEnum; profit: number }[],
    userId: number
  ): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const results: Array<{betId: number; result: any; bet: any}> = [];
      
      for (const { betId, resultId, profit } of betProfits) {
        const resultRes = await client.query(
          `UPDATE bet_results br
           SET result_id = $1, updated_at = NOW()
           FROM bets b
           WHERE br.bet_id = $2
             AND b.id = br.bet_id
             AND b.user_id = $3
           RETURNING br.*;`,
          [resultId, betId, userId]
        );
        
        const profitRes = await client.query(
          `UPDATE bets
           SET profit = $1, updated_at = NOW()
           WHERE id = $2 AND user_id = $3
           RETURNING *;`,
          [profit, betId, userId]
        );
        
        if (resultRes.rowCount > 0 && profitRes.rowCount > 0) {
          results.push({
            betId,
            result: resultRes.rows[0],
            bet: profitRes.rows[0]
          });
        }
      }
      
      await client.query('COMMIT');
      return await toCamel(results, { deep: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async findBets(filters: FilterGetBets) {
    const { betId, userId, startDate, endDate, resultId, q, page, perPage } = filters;
  
    return this.dbRead
      .selectFrom("bets as b")
      .leftJoin("bet_results as br", "br.bet_id", "b.id")
      .leftJoin("betting_houses as bh", "bh.id", "b.house_id")
      .leftJoin("results as r", "r.id", "br.result_id")
      .select([
        "b.id",
        "b.game",
        "b.stake",
        "b.odd",
        "b.house_id",
        "b.market",
        "b.sport",
        "bh.name as houseName",
        "b.profit",
        "b.bet_time",
        "br.result_id",
        "r.name as resultName",
      ])
      .$if(isNotEmpty(betId), (qb) => qb.where("b.id", "=", betId))
      .$if(isNotEmpty(userId), (qb) => qb.where("b.user_id", "=", userId))
      .$if(isNotEmpty(startDate), (qb) => qb.where("b.bet_time", ">=", startDate))
      .$if(isNotEmpty(endDate), (qb) => qb.where("b.bet_time", "<=", endDate))
      .$if(isNotEmpty(resultId), (qb) => qb.where("br.result_id", "=", resultId))
      .$if(isNotEmpty(q), (qb) =>
        qb.where((eb) =>
          eb.or([
            eb("b.market", "ilike", `%${q}%`),
            eb("b.game", "ilike", `%${q}%`),
          ]),
        ),
      )
      .$if(isNotEmpty(page) && isNotEmpty(perPage), (qb) =>
        qb.limit(perPage!).offset((page! - 1) * perPage!),
      )
      .orderBy("b.bet_time", "desc")
      .execute();
  }
  
  async findById(betId: BetId) {
    return this.dbRead
      .selectFrom("bets")
      .select(["id", "stake", "odd"])
      .where("id", "=", betId)
      .executeTakeFirst();
  }
  
  async findByIds(betIds: BetId[], userId?: UserId) {
    return this.dbRead
      .selectFrom("bets")
      .select(["id", "stake", "odd"])
      .$if(betIds.length > 0, (qb) => qb.where("id", "in", betIds))
      .$if(isNotEmpty(userId), (qb) => qb.where("user_id", "=", userId))
      .execute();
  }
  
  async delete(betId: BetId, userId: UserId) {
    const result = await this.dbWrite.transaction().execute(async (trx) => {
      const deletedBet = await trx
        .deleteFrom("bets")
        .where("id", "=", betId)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirst();
  
      return deletedBet;
    });
  
    return result;
  }

  async deleteMany(betIds: BetId[], userId: UserId) {
    const result = await this.dbWrite.transaction().execute(async (trx) => {
      const deletedBets = await trx
        .deleteFrom("bets")
        .where("id", "in", betIds)
        .where("user_id", "=", userId)
        .returningAll()
        .execute();
      return deletedBets;
    });
  
    return result;
  }
  async resultTypes() {
    return this.dbRead
      .selectFrom("results")
      .select(["id", "name"])
      .orderBy("name", "asc")
      .execute();
  }
  
  async countBets(filters: FilterGetBets) {
    const { betId, userId, startDate, endDate, resultId, q } = filters;
  
    const result = await this.dbRead
      .selectFrom("bets as b")
      .leftJoin("bet_results as br", "br.bet_id", "b.id")
      .leftJoin("betting_houses as bh", "bh.id", "b.house_id")
      .leftJoin("results as r", "r.id", "br.result_id")
      .select(({ fn }) => [fn.count("b.id").as("total")])
      .$if(isNotEmpty(betId), (qb) => qb.where("b.id", "=", betId))
      .$if(isNotEmpty(userId), (qb) => qb.where("b.user_id", "=", userId))
      .$if(isNotEmpty(startDate), (qb) => qb.where("b.bet_time", ">=", startDate))
      .$if(isNotEmpty(endDate), (qb) => qb.where("b.bet_time", "<=", endDate))
      .$if(isNotEmpty(resultId), (qb) => qb.where("br.result_id", "=", resultId))
      .$if(isNotEmpty(q), (qb) =>
        qb.where((eb) =>
          eb.or([
            eb("b.market", "ilike", `%${q}%`),
            eb("b.game", "ilike", `%${q}%`),
          ]),
        ),
      )
      .executeTakeFirst();
  
    return Number(result?.total ?? 0);
  }

}
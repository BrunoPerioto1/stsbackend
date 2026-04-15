import { Injectable } from '@nestjs/common';
import { ResultIdEnum } from '../../bet/dto/result-id.enum';
import { CreateBetDto, BetItem } from '../../bet/dto/bet.dto';
import { UpdateApostaDto } from '../../bet/dto/bet.dto';
import { BetFilterDto } from '../../bet/dto/bet-filter.dto';
import { filter } from 'rxjs/internal/operators/filter';
import { isNotEmpty } from 'class-validator';
import { UserId } from '../../db_types/Users';
import { BetId, NewBet, UpdateBet } from '../../db_types/Bet';
import { ResultId } from '../../db_types/Results';
import { NewBetResult } from '../../db_types/BetsResults';

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

  async create(newBet: NewBet) {
  const result = await this.dbWrite.transaction().execute(async (trx) => {
    const createdBet = await trx
      .insertInto("bets")
      .values(newBet)
      .returningAll()
      .returning((eb) => [
        eb
          .selectFrom("bettingHouses")
          .select("name")
          .whereRef("bettingHouses.id", "=", "bets.houseId")
          .as("houseName"),
      ])
      .executeTakeFirstOrThrow();

    const newBetResult: NewBetResult = {
      betId: createdBet.id,
    };

    await trx
      .insertInto("betResults")
      .values(newBetResult)
      .returningAll()
      .executeTakeFirstOrThrow();

    return createdBet;
  });

  return result;
}

 async update(betId: BetId, update: UpdateBet, userId: UserId) {
  return this.dbWrite
    .updateTable("bets")
    .set({
      ...update,
      updatedAt: new Date(),
    })
    .where("id", "=", betId)
    .where("userId", "=", userId)
    .returningAll()
    .executeTakeFirst();
}

 async finalizeBet(
  betId: BetId,
  resultId: ResultIdEnum,
  profit: number,
  userId: UserId,
) {
  const result = await this.dbWrite.transaction().execute(async (trx) => {
    const updatedBetResult = await trx
      .updateTable("betResults as br")
      .set({
        resultId,
        updatedAt: new Date(),
      })
      .from("bets as b")
      .whereRef("b.id", "=", "br.betId")
      .where("br.betId", "=", betId)
      .where("b.userId", "=", userId)
      .returningAll()
      .executeTakeFirst();

    const updatedBet = await trx
      .updateTable("bets")
      .set({
        profit,
        updatedAt: new Date(),
      })
      .where("id", "=", betId)
      .where("userId", "=", userId)
      .returningAll()
      .executeTakeFirst();

    if (!updatedBetResult || !updatedBet) {
      return null;
    }

    return {
      result: updatedBetResult,
      bet: updatedBet,
    };
  });

  return result;
}

 async finalizeMultipleBets(
  betUpdates: { betId: BetId; resultId: ResultIdEnum; profit: number }[],
  userId: UserId,
) {
  const result = await this.dbWrite.transaction().execute(async (trx) => {
    const results: Array<{
      betId: BetId;
      result: unknown;
      bet: unknown;
    }> = [];

    for (const { betId, resultId, profit } of betUpdates) {
      const updatedBetResult = await trx
        .updateTable("betResults as br")
        .set({
          resultId,
          updatedAt: new Date(),
        })
        .from("bets as b")
        .whereRef("b.id", "=", "br.betId")
        .where("br.betId", "=", betId)
        .where("b.userId", "=", userId)
        .returningAll()
        .executeTakeFirst();

      const updatedBet = await trx
        .updateTable("bets")
        .set({
          profit,
          updatedAt: new Date(),
        })
        .where("id", "=", betId)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();

      if (updatedBetResult && updatedBet) {
        results.push({
          betId,
          result: updatedBetResult,
          bet: updatedBet,
        });
      }
    }

    return results;
  });

  return result;
}

  async findBets(filters: FilterGetBets) {
  const { betId, userId, startDate, endDate, resultId, q, page, perPage } = filters;

  return this.dbRead
    .selectFrom("bets as b")
    .leftJoin("betResults as br", "br.betId", "b.id")
    .leftJoin("bettingHouses as bh", "bh.id", "b.houseId")
    .leftJoin("results as r", "r.id", "br.resultId")
    .select([
      "b.id",
      "b.game",
      "b.stake",
      "b.odd",
      "b.houseId",
      "b.market",
      "b.sport",
      "bh.name as houseName",
      "b.profit",
      "b.betTime",
      "br.resultId",
      "r.name as resultName",
    ])
    .$if(isNotEmpty(betId), (qb) => qb.where("b.id", "=", betId))
    .$if(isNotEmpty(userId), (qb) => qb.where("b.userId", "=", userId))
    .$if(isNotEmpty(startDate), (qb) => qb.where("b.betTime", ">=", startDate))
    .$if(isNotEmpty(endDate), (qb) => qb.where("b.betTime", "<=", endDate))
    .$if(isNotEmpty(resultId), (qb) => qb.where("br.resultId", "=", resultId))
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
    .orderBy("b.betTime", "desc")
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
    .$if(isNotEmpty(userId), (qb) => qb.where("userId", "=", userId))
    .execute();
}

async delete(betId: BetId, userId: UserId) {
  const result = await this.dbWrite.transaction().execute(async (trx) => {
    const deletedBet = await trx
      .deleteFrom("bets")
      .where("id", "=", betId)
      .where("userId", "=", userId)
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
      .where("userId", "=", userId)
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
    .leftJoin("betResults as br", "br.betId", "b.id")
    .leftJoin("bettingHouses as bh", "bh.id", "b.houseId")
    .leftJoin("results as r", "r.id", "br.resultId")
    .select(({ fn }) => [fn.count("b.id").as("total")])
    .$if(isNotEmpty(betId), (qb) => qb.where("b.id", "=", betId))
    .$if(isNotEmpty(userId), (qb) => qb.where("b.userId", "=", userId))
    .$if(isNotEmpty(startDate), (qb) => qb.where("b.betTime", ">=", startDate))
    .$if(isNotEmpty(endDate), (qb) => qb.where("b.betTime", "<=", endDate))
    .$if(isNotEmpty(resultId), (qb) => qb.where("br.resultId", "=", resultId))
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
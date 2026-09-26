import { Inject, Injectable } from "@nestjs/common";
import { Kysely, sql, type Expression, type ExpressionBuilder, type SqlBool } from "kysely";
import {
  DATABASE_READ_CONNECTION,
  DATABASE_WRITE_CONNECTION,
} from "../db/db.module";

import {
  LOST_RESULT_IDS,
  ResultIdEnum,
  SETTLED_RESULT_IDS,
  WON_RESULT_IDS,
} from "../../bet/dto/result-id.enum";
import { isNotEmpty } from "class-validator";
import { UserId } from "../../db_types/Users";
import { BetId, NewBet, UpdateBet } from "../../db_types/Bet";
import { ResultId } from "../../db_types/Results";
import { TipId } from "../../db_types/Tips";
import { BettingHouseId } from "../../db_types/BettingHouse";
import { SportId } from "../../db_types/Sports";
import { NewBetResult } from "../../db_types/BetsResults";
import { NewBetEvent } from "../../db_types/BetEvents";
import type { Database } from "../db/database.types";
import { endOfDay, startOfDay } from "../../common/utils/bet.utils";
import { betDate } from "./bet-date";
import type { BetOriginFilter } from "../../bet/dto/bet-filter.dto";

// isNotEmpty (class-validator) considera [] "não vazio" — errado pro nosso
// caso, onde array vazio deve equivaler a "filtro não aplicado".
function hasItems<T>(arr: T[] | undefined): arr is T[] {
  return Array.isArray(arr) && arr.length > 0;
}

export interface FilterGetBets {
  betId?: BetId;
  userId?: UserId;
  startDate?: Date;
  endDate?: Date;
  resultId?: ResultId;
  resultIds?: ResultId[];
  houseIds?: BettingHouseId[];
  sportIds?: SportId[];
  origins?: BetOriginFilter[];
  unmatched?: boolean;
  q?: string;
  page?: number;
  perPage?: number;
}

@Injectable()
export class BetRepository {
  constructor(
    @Inject(DATABASE_WRITE_CONNECTION)
    private readonly dbWrite: Kysely<Database>,
    @Inject(DATABASE_READ_CONNECTION)
    private readonly dbRead: Kysely<Database>,
  ) {}

  async findRecentCandidates(
    userId: UserId,
    houseId: BettingHouseId,
    since: Date,
    until: Date,
  ) {
    // Read the writer so a just-created bet is visible despite replica lag.
    return this.dbWrite
      .selectFrom('bets')
      .select([
        'id',
        'userId',
        'houseId',
        'game',
        'market',
        'odd',
        'stake',
        'createdAt',
      ])
      .where('userId', '=', userId)
      .where('houseId', '=', houseId)
      .where('deletedAt', 'is', null)
      .where('createdAt', '>=', since)
      .where('createdAt', '<=', until)
      .orderBy('createdAt', 'desc')
      .execute();
  }

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

  // Um jogo por confronto de uma multipla de varios jogos. Fora da transacao da
  // aposta de proposito: e' consultivo como o evento da aposta — planilhar
  // nunca pode falhar por causa disso. Ver migrations/20260915_bet_events.sql.
  async saveBetEvents(betId: BetId, events: Omit<NewBetEvent, "betId">[]) {
    if (!events.length) return;
    await this.dbWrite
      .insertInto("betEvents")
      .values(events.map((event) => ({ ...event, betId })))
      .onConflict((oc) => oc.columns(["betId", "position"]).doNothing())
      .execute();
  }

  // Edicao que troca o jogo: as pernas antigas sao de outro confronto e nao
  // podem ficar pra liquidacao. Lista vazia so' apaga.
  async replaceBetEvents(betId: BetId, events: Omit<NewBetEvent, "betId">[]) {
    await this.dbWrite.transaction().execute(async (trx) => {
      await trx.deleteFrom("betEvents").where("betId", "=", betId).execute();
      if (!events.length) return;
      await trx
        .insertInto("betEvents")
        .values(events.map((event) => ({ ...event, betId })))
        .execute();
    });
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
      .where("deletedAt", "is", null)
      .returningAll()
      .executeTakeFirst();
  }

 async finalizeBet(
  betId: BetId,
  resultId: ResultIdEnum,
  profit: number,
  userId: UserId,
  cashoutValue?: number,
) {
  const result = await this.dbWrite.transaction().execute(async (trx) => {
    const updatedBetResult = await trx
      .updateTable("betResults as br")
      .set({
        resultId: resultId as ResultId,
        updatedAt: new Date(),
      })
      .from("bets as b")
      .whereRef("b.id", "=", "br.betId")
      .where("br.betId", "=", betId)
      .where("b.userId", "=", userId)
      .where("b.deletedAt", "is", null)
      .returningAll()
      .executeTakeFirst();

    const updatedBet = await trx
      .updateTable("bets")
      .set({
        profit,
        cashoutValue: cashoutValue ?? null,
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
  if (!betUpdates.length) return [];

  // Duas queries pro lote inteiro, não duas por aposta: confirmar 200
  // sugestões da conferência eram 400 idas ao banco dentro de uma transação.
  // A lista vira uma tabela VALUES e cada UPDATE junta com ela.
  const result = await this.dbWrite.transaction().execute(async (trx) => {
    const valores = sql`(VALUES ${sql.join(
      betUpdates.map(
        ({ betId, resultId, profit }) =>
          sql`(${betId}::int, ${resultId}::int, ${profit}::numeric)`,
      ),
    )}) AS v(bet_id, result_id, profit)`;

    // Aposta de outro usuário ou apagada não entra: o filtro fica aqui, e o
    // resultado só é gravado pras que passaram.
    const bets = await sql<{ id: BetId }>`
      UPDATE bets b
         SET profit = v.profit, updated_at = CURRENT_TIMESTAMP
        FROM ${valores}
       WHERE b.id = v.bet_id AND b.user_id = ${userId} AND b.deleted_at IS NULL
      RETURNING b.*`.execute(trx);

    const ids = bets.rows.map((bet) => bet.id);
    if (!ids.length) return [];

    const results = await sql<{ betId: BetId }>`
      UPDATE bet_results br
         SET result_id = v.result_id, updated_at = CURRENT_TIMESTAMP
        FROM ${valores}
       WHERE br.bet_id = v.bet_id AND br.bet_id = ANY(${ids})
      RETURNING br.*`.execute(trx);

    // O CamelCasePlugin também converte o retorno de SQL cru (bet_id → betId).
    const betById = new Map(bets.rows.map((bet) => [bet.id, bet]));
    return results.rows.map((row) => ({
      betId: row.betId,
      result: row as unknown,
      bet: betById.get(row.betId) as unknown,
    }));
  });
  
  return result;
}

  async findBets(filters: FilterGetBets) {
    const { page, perPage } = filters;

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
        "b.sportId",
        "bh.name as houseName",
        "b.profit",
        "b.cashoutValue",
        "b.betTime",
        "b.eventStartAt",
        "br.resultId",
        "r.name as resultName",
      ])
      .where(betFilters(filters))
      .$if(isNotEmpty(page) && isNotEmpty(perPage), (qb) =>
        qb.limit(perPage!).offset((page! - 1) * perPage!),
      )
      .orderBy(betDate, "desc")
      .execute();
  }

  // Traz tambem resultId/cashoutValue porque o profit e funcao de
  // (resultId, stake, odd, cashoutValue) — o updateBet precisa dos quatro pra
  // recalcular quando o usuario edita uma aposta ja liquidada. Jogo, mercado,
  // esporte e hora sao o que o updateBet compara pra refazer o casamento.
  async findById(betId: BetId) {
    return this.dbRead
      .selectFrom("bets as b")
      .leftJoin("betResults as br", "br.betId", "b.id")
      .select([
        "b.id",
        "b.stake",
        "b.odd",
        "b.cashoutValue",
        "br.resultId",
        "b.game",
        "b.market",
        "b.sport",
        "b.betTime",
      ])
      .where("b.id", "=", betId)
      .where("b.deletedAt", "is", null)
      .executeTakeFirst();
  }

  async findByIds(betIds: BetId[], userId?: UserId) {
    let query = this.dbRead
      .selectFrom("bets")
      .select(["id", "stake", "odd"])
      .where("deletedAt", "is", null)
      .$if(betIds.length > 0, (qb) => qb.where("id", "in", betIds));

    if (userId !== undefined) {
      query = query.where("userId", "=", userId);
    }

    return query.execute();
  }

  // Aposta que uma tip gerou pra esse usuario. Serve pra barrar clique
  // repetido no /pendentes e pra achar o que apagar no Desfazer.
  async findByTipId(tipId: TipId, userId: UserId) {
    return this.dbWrite
      .selectFrom('bets')
      .select(['id', 'game', 'createdAt'])
      .where('tipId', '=', tipId)
      .where('userId', '=', userId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async delete(betId: BetId, userId: UserId) {
    const result = await this.dbWrite.transaction().execute(async (trx) => {
      const deletedBet = await trx
        .updateTable("bets")
        .set({ deletedAt: new Date() })
        .where("id", "=", betId)
        .where("userId", "=", userId)
        .where("deletedAt", "is", null)
        .returningAll()
        .executeTakeFirst();

      return deletedBet;
    });

    return result;
  }

  async deleteMany(betIds: BetId[], userId: UserId) {
    const result = await this.dbWrite.transaction().execute(async (trx) => {
      const deletedBets = await trx
        .updateTable("bets")
        .set({ deletedAt: new Date() })
        .where("id", "in", betIds)
        .where("userId", "=", userId)
        .where("deletedAt", "is", null)
        .returningAll()
        .execute();

      return deletedBets;
    });

    return result;
  }

  async sports() {
    return this.dbRead
      .selectFrom("sports")
      .select(["id", "name"])
      .orderBy("name", "asc")
      .execute();
  }

  async resultTypes() {
    return this.dbRead
      .selectFrom("results")
      .select(["id", "name"])
      .orderBy("name", "asc")
      .execute();
  }

  async countBets(filters: FilterGetBets) {
    const result = await this.dbRead
      .selectFrom("bets as b")
      .leftJoin("betResults as br", "br.betId", "b.id")
      .select(({ fn }) => [fn.count("b.id").as("total")])
      .where(betFilters(filters))
      .executeTakeFirst();

    return Number(result?.total ?? 0);
  }

  /**
   * Quantas apostas e quanto de lucro por mês, com os mesmos filtros da lista.
   * A tela de apostas baixava todas as linhas do filtro só pra somar o total
   * de cada mês; agora os totais vêm daqui e as linhas só do mês aberto.
   * Mês no fuso de SP, pela mesma data do jogo que a lista usa (betDate).
   */
  async monthlySummary(filters: FilterGetBets) {
    const month = sql<string>`to_char(date_trunc('month', (${betDate} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM')`;
    const rows = await this.dbRead
      .selectFrom("bets as b")
      .leftJoin("betResults as br", "br.betId", "b.id")
      .where(betFilters(filters))
      .select((eb) => [
        month.as("month"),
        eb.fn.count<string>("b.id").as("count"),
        eb.fn.coalesce(eb.fn.sum<string>("b.profit"), sql<string>`0`).as("profit"),
      ])
      .groupBy(month)
      .orderBy(month, "desc")
      .execute();
    return rows.map((row) => ({ month: row.month, count: Number(row.count), profit: Number(row.profit) }));
  }

  /**
   * Totais do filtro inteiro pra faixa do topo da lista (apostado, lucro,
   * ROI, acerto). Mesma base do dashboard: ROI sobre o stake já liquidado.
   */
  async totals(filters: FilterGetBets) {
    const settled = SETTLED_RESULT_IDS as unknown as ResultId[];
    return this.dbRead
      .selectFrom("bets as b")
      .leftJoin("betResults as br", "br.betId", "b.id")
      .where(betFilters(filters))
      .select((eb) => [
        eb.fn.count<string>("b.id").as("count"),
        eb.fn.coalesce(eb.fn.sum<string>("b.stake"), sql<string>`0`).as("staked"),
        eb.fn
          .coalesce(
            eb.fn.sum<string>(eb.case().when("br.resultId", "in", settled).then(eb.ref("b.stake")).else(0).end()),
            sql<string>`0`,
          )
          .as("settledStake"),
        eb.fn.coalesce(eb.fn.sum<string>("b.profit"), sql<string>`0`).as("profit"),
        eb.fn.count<string>("b.id").filterWhere("br.resultId", "in", WON_RESULT_IDS as unknown as ResultId[]).as("won"),
        eb.fn.count<string>("b.id").filterWhere("br.resultId", "in", LOST_RESULT_IDS as unknown as ResultId[]).as("lost"),
        eb.fn.count<string>("b.id").filterWhere("br.resultId", "=", ResultIdEnum.PENDING as ResultId).as("pending"),
      ])
      .executeTakeFirstOrThrow();
  }
}

type BetListDb = Database & { b: Database["bets"]; br: Database["betResults"] };

// Filtros da lista de apostas. findBets, countBets e o resumo por mês usam os
// mesmos: eram blocos copiados em cada consulta, que podiam divergir.
// Exige `bets as b` e `betResults as br` na query.
function betFilters(filters: FilterGetBets) {
  const { betId, userId, startDate, endDate, resultId, resultIds, houseIds, sportIds, origins, unmatched, q } = filters;
  return (eb: ExpressionBuilder<BetListDb, "b" | "br">) => {
    const conditions: Expression<SqlBool>[] = [eb("b.deletedAt", "is", null)];
    if (isNotEmpty(betId)) conditions.push(eb("b.id", "=", betId!));
    if (isNotEmpty(userId)) conditions.push(eb("b.userId", "=", userId!));
    if (isNotEmpty(startDate)) conditions.push(eb(betDate, ">=", startOfDay(startDate!)));
    if (isNotEmpty(endDate)) conditions.push(eb(betDate, "<", endOfDay(endDate!)));
    if (hasItems(resultIds)) conditions.push(eb("br.resultId", "in", resultIds));
    else if (isNotEmpty(resultId)) conditions.push(eb("br.resultId", "=", resultId!));
    if (hasItems(houseIds)) conditions.push(eb("b.houseId", "in", houseIds));
    if (hasItems(sportIds)) conditions.push(eb("b.sportId", "in", sportIds));
    if (hasItems(origins)) {
      // Tip vence a fonte: Planilhar pelo bot grava source=telegram, mas o
      // que importa pra quem filtra é que veio do canal. Linha antiga sem
      // source conta como digitada à mão no site — antes do `fromImage`, print
      // lido no site também gravava 'manual', então o histórico cai aqui.
      const noSite = eb.and([
        eb("b.tipId", "is", null),
        eb.or([eb("b.source", "=", "app"), eb("b.source", "is", null)]),
      ]);
      const byOrigin: Record<BetOriginFilter, Expression<SqlBool>> = {
        tip: eb("b.tipId", "is not", null),
        telegram: eb.and([eb("b.tipId", "is", null), eb("b.source", "=", "telegram")]),
        print: eb.and([noSite, eb("b.sourceType", "=", "image")]),
        manual: eb.and([
          noSite,
          eb.or([eb("b.sourceType", "is", null), eb("b.sourceType", "!=", "image")]),
        ]),
      };
      conditions.push(eb.or(origins.map((o) => byOrigin[o])));
    }
    if (unmatched) conditions.push(eb("b.eventExternalId", "is", null));
    if (isNotEmpty(q))
      conditions.push(eb.or([eb("b.market", "ilike", `%${q}%`), eb("b.game", "ilike", `%${q}%`)]));
    return eb.and(conditions);
  };
}
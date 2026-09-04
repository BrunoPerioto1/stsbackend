// src/dashboard/dashboard.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import type { Database } from '../db/database.types';
import { DATABASE_READ_CONNECTION } from '../db/db.module';
import { BettingHouseId } from '../../db_types/BettingHouse';
import { UserId } from '../../db_types/Users';
import { isNotEmpty } from 'class-validator';
import { endOfDay, startOfDay } from '../../common/utils/bet.utils';

// `bet_time` e' TIMESTAMP sem timezone guardando instante UTC, entao a conversao
// precisa dos dois `AT TIME ZONE`: o primeiro rotula o valor como UTC, o segundo
// o traz pro horario civil de Sao Paulo. E a referencia da coluna tem que sair de
// `sql.ref` — dentro de um fragmento sql cru o CamelCasePlugin nao atua e o
// Postgres rebaixaria `b.betTime` pra `b.bettime`, que nao existe.
const betTimeBr = sql`(${sql.ref('b.betTime')} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'`;
const betCalendarDateBr = sql<string>`to_char(${betTimeBr}, 'YYYY-MM-DD')`;
const betCalendarMonthBr = sql<string>`to_char(date_trunc('month', ${betTimeBr}), 'YYYY-MM-DD')`;

interface FilterDashboard {
  startDate?: string;
  endDate?: string;
  houseId?: BettingHouseId;
  house_id?: BettingHouseId;
  userId?: UserId;
}

@Injectable()
export class DashboardRepository {
  constructor(
    @Inject(DATABASE_READ_CONNECTION)
    private readonly dbRead: Kysely<Database>,
  ) {}



async findDailySummary(filters: FilterDashboard) {
  const { startDate, endDate, houseId, userId } = filters;

  return this.dbRead
    .selectFrom("bets as b")
    .$if(isNotEmpty(userId), (qb) =>
      qb.where("b.userId", "=", userId!),
    )
    .$if(isNotEmpty(houseId), (qb) =>
      qb.where("b.houseId", "=", houseId!),
    )
    .$if(isNotEmpty(startDate), (qb) =>
      qb.where("b.betTime", ">=", startOfDay(new Date(startDate!))),
    )
    .$if(isNotEmpty(endDate), (qb) =>
      qb.where("b.betTime", "<", endOfDay(new Date(endDate!))),
    )
    .select(({ fn }) => [
      betCalendarDateBr.as("date"),
      fn.count("b.id").as("totalBets"),
      fn<number>("coalesce", [fn.sum<number>("b.profit"), sql.lit(0)]).as("profitDay"),
    ])
    .groupBy(betCalendarDateBr)
    .orderBy(betCalendarDateBr, "asc")
    .execute();
}
async findMonthlySummary(filters: FilterDashboard) {
  const { startDate, endDate, houseId, userId } = filters;

  return this.dbRead
    .selectFrom("bets as b")
    .$if(isNotEmpty(userId), (qb) =>
      qb.where("b.userId", "=", userId!),
    )
    .$if(isNotEmpty(houseId), (qb) =>
      qb.where("b.houseId", "=", houseId!),
    )
    .$if(isNotEmpty(startDate), (qb) =>
      qb.where("b.betTime", ">=", startOfDay(new Date(startDate!))),
    )
    .$if(isNotEmpty(endDate), (qb) =>
      qb.where("b.betTime", "<", endOfDay(new Date(endDate!))),
    )
    .select(({ fn }) => [
      betCalendarMonthBr.as("month"),
      fn.count("b.id").as("totalBets"),
      fn<number>("coalesce", [fn.sum<number>("b.profit"), sql.lit(0)]).as("profitMonth"),
    ])
    .groupBy(betCalendarMonthBr)
    .orderBy(betCalendarMonthBr, "asc")
    .execute();
}
async findBetDateRange(userId: UserId) {
  return this.dbRead
    .selectFrom("bets as b")
    .where("b.userId", "=", userId)
    .select((eb) => [
      eb.fn.min("b.betTime").as("firstBetDate"),
      eb.fn.max("b.betTime").as("lastBetDate"),
    ])
    .executeTakeFirst();
}

async findDashboardMetrics(filters: FilterDashboard) {
  const { startDate, endDate, houseId, userId } = filters;

  return this.dbRead
    .selectFrom("bets as b")
    .leftJoin("betResults as br", "br.betId", "b.id")
    .$if(isNotEmpty(userId), (qb) =>
      qb.where("b.userId", "=", userId!),
    )
    .$if(isNotEmpty(houseId), (qb) =>
      qb.where("b.houseId", "=", houseId!),
    )
    .$if(isNotEmpty(startDate), (qb) =>
      qb.where("b.betTime", ">=", startOfDay(new Date(startDate!))),
    )
    .$if(isNotEmpty(endDate), (qb) =>
      qb.where("b.betTime", "<", endOfDay(new Date(endDate!))),
    )
    .select((eb) => [
      eb.fn.count("b.id").as("totalBets"),
      eb.fn<number>("sum", [
        eb
          .case()
          .when("br.resultId", "=", 1 as any)
          .then(1)
          .else(0)
          .end(),
      ]).as("wonBets"),
      eb.fn<number>("sum", [
        eb
          .case()
          .when("br.resultId", "=", 2 as any)
          .then(1)
          .else(0)
          .end(),
      ]).as("lostBets"),
      eb.fn<number>("sum", [
        eb
          .case()
          .when("br.resultId", "=", 9 as any)
          .then(1)
          .else(0)
          .end(),
      ]).as("pendingBets"),
      eb.fn<number>("sum", [
        eb
          .case()
          .when("br.resultId", "=", 3 as any)
          .then(1)
          .else(0)
          .end(),
      ]).as("canceledBets"),
      eb.fn<number>("coalesce", [eb.fn.avg<number>("b.stake"), sql.lit(0)]).as("averageStake"),
      eb.fn<number>("coalesce", [eb.fn.avg<number>("b.odd"), sql.lit(0)]).as("averageOdd"),
      eb.fn<number>("coalesce", [eb.fn.sum<number>("b.stake"), sql.lit(0)]).as("totalStaked"),
      eb.fn<number>("coalesce", [eb.fn.sum<number>("b.profit"), sql.lit(0)]).as("totalProfit"),
    ])
    .executeTakeFirst();
}
}

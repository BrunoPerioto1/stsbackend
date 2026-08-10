// src/dashboard/dashboard.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import type { Database } from '../db/database.types';
import { DATABASE_READ_CONNECTION } from '../db/db.module';
import { BettingHouseId } from '../../db_types/BettingHouse';
import { UserId } from '../../db_types/Users';
import { isNotEmpty } from 'class-validator';

export interface FilterDashboard {
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
      qb.where("b.betTime", ">=", new Date(startDate!)),
    )
    .$if(isNotEmpty(endDate), (qb) =>
      qb.where("b.betTime", "<=", new Date(endDate!)),
    )
    .select(({ fn, ref }) => [
      fn<Date>("date", [ref("b.betTime")]).as("date"),
      fn.count("b.id").as("totalBets"),
      fn<number>("coalesce", [fn.sum<number>("b.profit"), sql.lit(0)]).as("profitDay"),
    ])
    .groupBy(({ fn, ref }) => fn<Date>("date", [ref("b.betTime")]))
    .orderBy(({ fn, ref }) => fn<Date>("date", [ref("b.betTime")]), "asc")
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
      qb.where("b.betTime", ">=", new Date(startDate!)),
    )
    .$if(isNotEmpty(endDate), (qb) =>
      qb.where("b.betTime", "<=", new Date(endDate!)),
    )
    .select(({ fn, ref }) => [
      fn<Date>("date_trunc", ["month" as any, ref("b.betTime")]).as("month"),
      fn.count("b.id").as("totalBets"),
      fn<number>("coalesce", [fn.sum<number>("b.profit"), sql.lit(0)]).as("profitMonth"),
    ])
    .groupBy(({ fn, ref }) => fn<Date>("date_trunc", ["month" as any, ref("b.betTime")]))
    .orderBy(({ fn, ref }) => fn<Date>("date_trunc", ["month" as any, ref("b.betTime")]), "asc")
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
      qb.where("b.betTime", ">=", new Date(startDate!)),
    )
    .$if(isNotEmpty(endDate), (qb) =>
      qb.where("b.betTime", "<=", new Date(endDate!)),
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

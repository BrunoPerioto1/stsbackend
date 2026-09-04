// house.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { isNotEmpty } from 'class-validator';
import type { Database } from '../db/database.types';
import { DATABASE_READ_CONNECTION, DATABASE_WRITE_CONNECTION } from '../db/db.module';
import type { UserId } from '../../db_types/Users';
import type { BettingHouseId } from '../../db_types/BettingHouse';
import { HouseFilterRequestDto } from '../../house/dto/house.filter.dto';
import { endOfDay, startOfDay } from '../../common/utils/bet.utils';

export interface FilterGetHouses {
  houseId?: BettingHouseId;
  houseName?: string;
}

@Injectable()
export class HouseRepository {
  constructor(
    @Inject(DATABASE_READ_CONNECTION)
    private readonly dbRead: Kysely<Database>,
    @Inject(DATABASE_WRITE_CONNECTION)
    private readonly dbWrite: Kysely<Database>,
  ) {}

  findAllHouses() {
    return this.dbRead
      .selectFrom('bettingHouses')
      .select(['id', 'name', 'isActive as active', 'aliases'])
      .where('isActive', '=', true)
      .orderBy('name', 'asc')
      .execute();
  }

  createHouse(name: string) {
    return this.dbWrite
      .insertInto('bettingHouses')
      .values({ name, isActive: true })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findById(id: BettingHouseId) {
    return this.dbRead
      .selectFrom('bettingHouses')
      .select(['id', 'name', 'isActive'])
      .where('id', '=', id)
      .executeTakeFirst();
  }

  private betsAggregate(userId: UserId) {
    return this.dbRead
      .selectFrom('bets as b')
      .leftJoin('betResults as br', 'br.betId', 'b.id')
      .where('b.userId', '=', userId)
      .select((eb) => [
        'b.houseId',
        eb.fn.count('b.id').as('totalBets'),
        eb.fn<number>('coalesce', [eb.fn.sum<number>('b.stake'), sql.lit(0)]).as('totalStake'),
        eb.fn<number>('coalesce', [eb.fn.sum<number>('b.profit'), sql.lit(0)]).as('totalBetProfit'),
        eb.fn<number>('coalesce', [
          eb.fn.sum<number>(eb.case().when('br.resultId', '=', 9 as any).then(1).else(0).end()),
          sql.lit(0),
        ]).as('pendingBets'),
        eb.fn<number>('coalesce', [
          eb.fn.sum<number>(eb.case().when('br.resultId', '=', 1 as any).then(1).else(0).end()),
          sql.lit(0),
        ]).as('wonBets'),
        eb.fn<number>('coalesce', [
          eb.fn.sum<number>(eb.case().when('br.resultId', '=', 2 as any).then(1).else(0).end()),
          sql.lit(0),
        ]).as('lostBets'),
      ])
      .groupBy('b.houseId');
  }

  private transactionsAggregate(userId: UserId) {
    return this.dbRead
      .selectFrom('houseTransactions as ht')
      .where('ht.userId', '=', userId)
      .select((eb) => [
        'ht.houseId',
        eb.fn<number>('coalesce', [
          eb.fn.sum<number>(eb.case().when('ht.transactionTypeId', '=', 1 as any).then(eb.ref('ht.value')).else(0).end()),
          sql.lit(0),
        ]).as('totalDeposit'),
        eb.fn<number>('coalesce', [
          eb.fn.sum<number>(eb.case().when('ht.transactionTypeId', '=', 2 as any).then(eb.ref('ht.value')).else(0).end()),
          sql.lit(0),
        ]).as('totalWithdrawalRaw'),
        eb.fn<number>('coalesce', [
          eb.fn.sum<number>(eb.case().when('ht.transactionTypeId', '=', 3 as any).then(eb.ref('ht.value')).else(0).end()),
          sql.lit(0),
        ]).as('totalAdjustment'),
        eb.fn<number>('coalesce', [eb.fn.sum<number>('ht.value'), sql.lit(0)]).as('totalTransactions'),
        eb.fn.max('ht.createdAt').as('lastMovementAt'),
      ])
      .groupBy('ht.houseId');
  }

  findHouseMetrics(userId: UserId) {
    return this.dbRead
      .selectFrom('bettingHouses as bh')
      .where('bh.isActive', '=', true)
      .leftJoin(this.betsAggregate(userId).as('ba'), 'ba.houseId', 'bh.id')
      .leftJoin(this.transactionsAggregate(userId).as('ta'), 'ta.houseId', 'bh.id')
      .select((eb) => [
        eb.fn.coalesce('ba.totalStake', eb.lit(0)).as('totalInvested'),
        eb.fn.coalesce('ba.totalBets', eb.lit(0)).as('totalBets'),
        eb.fn.coalesce('ba.totalBetProfit', eb.lit(0)).as('totalBetProfit'),
        eb.fn.coalesce('ta.totalTransactions', eb.lit(0)).as('transactionBalance'),
      ])
      .executeTakeFirst();
  }

  findAllHousesBalance(userId: UserId, filter?: HouseFilterRequestDto) {
    return this.dbRead
      .selectFrom('bettingHouses as bh')
      .innerJoin(this.betsAggregate(userId).as('ba'), 'ba.houseId', 'bh.id')
      .leftJoin(this.transactionsAggregate(userId).as('ta'), 'ta.houseId', 'bh.id')
      .where('bh.isActive', '=', true)
      .$if(!!filter?.houseId, (qb) => qb.where('bh.id', '=', filter!.houseId!))
      .$if(!!filter?.houseName, (qb) => qb.where('bh.name', 'ilike', `%${filter!.houseName}%`))
      .select((eb) => [
        'bh.id as houseId',
        'bh.name as houseName',
        eb.fn.coalesce('ba.totalBets', eb.lit(0)).as('totalBets'),
        eb.fn.coalesce('ba.totalStake', eb.lit(0)).as('totalStake'),
        eb.fn.coalesce('ba.totalBetProfit', eb.lit(0)).as('totalBetProfit'),
        eb.fn.coalesce('ba.pendingBets', eb.lit(0)).as('pendingBets'),
        eb.fn.coalesce('ba.wonBets', eb.lit(0)).as('wonBets'),
        eb.fn.coalesce('ba.lostBets', eb.lit(0)).as('lostBets'),
        eb.fn.coalesce('ta.totalDeposit', eb.lit(0)).as('totalDeposit'),
        eb.fn.coalesce('ta.totalWithdrawalRaw', eb.lit(0)).as('totalWithdrawalRaw'),
        eb.fn.coalesce('ta.totalAdjustment', eb.lit(0)).as('totalAdjustment'),
        eb.fn.coalesce('ta.totalTransactions', eb.lit(0)).as('totalTransactions'),
        'ta.lastMovementAt',
      ])
      .orderBy('bh.name', 'asc')
      .execute();
  }

  findHouseRanking(userId: UserId, startDate?: Date, endDate?: Date) {
    return this.dbRead
      .selectFrom('bettingHouses as bh')
      .innerJoin('bets as b', (join) =>
        join.onRef('bh.id', '=', 'b.houseId').on('b.userId', '=', userId),
      )
      .innerJoin('betResults as br', 'br.betId', 'b.id')
      .where('bh.isActive', '=', true)
      .where('br.resultId', 'in', [1, 2, 4, 5, 6] as any)
      .$if(!!startDate, (qb) => qb.where('b.betTime', '>=', startOfDay(startDate!)))
      .$if(!!endDate, (qb) => qb.where('b.betTime', '<', endOfDay(endDate!)))
      .groupBy(['bh.id', 'bh.name'])
      .select((eb) => [
        'bh.id as houseId',
        'bh.name as houseName',
        eb.fn.count('b.id').as('settledBets'),
        eb.fn<number>('coalesce', [
          eb.fn.sum<number>(eb.case().when('br.resultId', '=', 1 as any).then(1).else(0).end()),
          sql.lit(0),
        ]).as('wonBets'),
        eb.fn<number>('coalesce', [eb.fn.avg<number>('b.odd'), sql.lit(0)]).as('avgOdd'),
        eb.fn<number>('coalesce', [eb.fn.avg<number>('b.stake'), sql.lit(0)]).as('avgStake'),
        eb.fn<number>('coalesce', [eb.fn.sum<number>('b.stake'), sql.lit(0)]).as('volume'),
        eb.fn<number>('coalesce', [eb.fn.sum<number>('b.profit'), sql.lit(0)]).as('profit'),
      ])
      .execute();
  }

  findUserBets(userId: UserId, filter?: FilterGetHouses) {
    return this.dbRead
      .selectFrom('bets as b')
      .leftJoin('betResults as br', 'br.betId', 'b.id')
      .leftJoin('bettingHouses as bh', 'bh.id', 'b.houseId')
      .select([
        'b.id',
        'b.houseId',
        'b.stake',
        'b.profit',
        'br.resultId',
        'bh.name as houseName',
      ])
      .where('b.userId', '=', userId)
      .$if(filter?.houseId !== undefined, (qb) => qb.where('b.houseId', '=', filter!.houseId!))
      .$if(isNotEmpty(filter?.houseName), (qb) => qb.where('bh.name', 'ilike', `%${filter!.houseName}%`))
      .execute();
  }

  findHouseTransactions(userId: UserId, filter?: FilterGetHouses) {
    return this.dbRead
      .selectFrom('houseTransactions as ht')
      .leftJoin('bettingHouses as bh', 'bh.id', 'ht.houseId')
      .select([
        'ht.id',
        'ht.houseId',
        'ht.userId',
        'ht.transactionTypeId',
        'ht.value',
        'ht.description',
        'ht.createdAt',
        'ht.updatedAt',
        'bh.name as houseName',
      ])
      .where('ht.userId', '=', userId)
      .$if(isNotEmpty(filter?.houseId),   (qb) => qb.where('ht.houseId', '=', filter!.houseId!))
      .$if(isNotEmpty(filter?.houseName), (qb) => qb.where('bh.name', 'ilike', `%${filter!.houseName}%`))
      .execute();
  }
}
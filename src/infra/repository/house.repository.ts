// house.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { isNotEmpty } from 'class-validator';
import type { Database } from '../db/database.types';
import { DATABASE_READ_CONNECTION } from '../db/db.module';
import type { UserId } from '../../db_types/Users';
import type { BettingHouseId } from '../../db_types/BettingHouse';
import { HouseFilterRequestDto } from '../../house/dto/house.filter.dto';

export interface FilterGetHouses {
  houseId?: BettingHouseId;
  houseName?: string;
}

@Injectable()
export class HouseRepository {
  constructor(
    @Inject(DATABASE_READ_CONNECTION)
    private readonly dbRead: Kysely<Database>,
  ) {}

  findAllHouses() {
    return this.dbRead
      .selectFrom('bettingHouses')
      .select(['id', 'name', 'isActive as active'])
      .where('isActive', '=', true)
      .orderBy('name', 'asc')
      .execute();
  }

  findById(id: BettingHouseId) {
    return this.dbRead
      .selectFrom('bettingHouses')
      .select(['id', 'name', 'isActive'])
      .where('id', '=', id)
      .executeTakeFirst();
  }

  findHouseMetrics(userId: UserId) {
    return this.dbRead
      .selectFrom('bettingHouses as bh')
      .leftJoin('bets as b', (join) =>
        join.onRef('bh.id', '=', 'b.houseId').on('b.userId', '=', userId),
      )
      .leftJoin('betResults as br', 'b.id', 'br.betId')
      .leftJoin('houseTransactions as ht', 'bh.id', 'ht.houseId')
      .where('bh.isActive', '=', true)
      .select((eb) => [
        eb.fn<number>('coalesce', [eb.fn.sum<number>('b.stake'),  0 as any]).as('totalInvested'),
        eb.fn.count('b.id').as('totalBets'),
        eb.fn<number>('coalesce', [eb.fn.sum<number>('b.profit'), 0 as any]).as('totalBetProfit'),
        eb.fn<number>('coalesce', [eb.fn.sum<number>('ht.value'), 0 as any]).as('transactionBalance'),
        eb.fn<number>('coalesce', [
          eb.fn.sum<number>(
            eb.case()
              .when('br.resultId', '=', 1 as any).then(eb.ref('b.stake'))
              .when('br.resultId', '=', 2 as any).then(eb.ref('b.profit'))
              .when('br.resultId', '=', 9 as any).then(eb.ref('b.stake'))
              .when('br.resultId', '=', 4 as any).then(eb.ref('b.stake'))
              .else(0 as any)
              .end(),
          ),
          0 as any,
        ]).as('totalReturn'),
      ])
      .executeTakeFirst();
  }

  findAllHousesBalance(userId: UserId, filter?: HouseFilterRequestDto) {
    return this.dbRead
      .selectFrom('bettingHouses as bh')
      .innerJoin('bets as b', (join) =>
        join.onRef('bh.id', '=', 'b.houseId').on('b.userId', '=', userId),
      )
      .leftJoin('betResults as br', 'b.id', 'br.betId')
      .leftJoin('houseTransactions as ht', 'bh.id', 'ht.houseId')
      .where('bh.isActive', '=', true)
      .$if(!!filter?.houseId,   (qb) => qb.where('bh.id',   '=', filter!.houseId!))
      .$if(!!filter?.houseName, (qb) => qb.where('bh.name', 'ilike', `%${filter!.houseName}%`))
      .select((eb) => [
        'bh.id as houseId',
        'bh.name as houseName',
        eb.fn.count('b.id').as('totalBets'),
        eb.fn<number>('coalesce', [eb.fn.sum<number>('b.stake'),  0 as any]).as('totalStake'),
        eb.fn<number>('coalesce', [eb.fn.sum<number>('b.profit'), 0 as any]).as('totalBetProfit'),
        eb.fn<number>('coalesce', [eb.fn.sum<number>('ht.value'), 0 as any]).as('totalTransactions'),
        eb.fn<number>('coalesce', [
          eb.fn.sum<number>(
            eb.case()
              .when('br.resultId', '=', 1 as any).then(eb.ref('b.stake'))
              .when('br.resultId', '=', 2 as any).then(eb.ref('b.profit'))
              .when('br.resultId', '=', 9 as any).then(eb.ref('b.stake'))
              .when('br.resultId', '=', 4 as any).then(eb.ref('b.stake'))
              .else(0 as any)
              .end(),
          ),
          0 as any,
        ]).as('totalReturn'),
        eb.fn<number>('sum', [
          eb.case().when('br.resultId', '=', 9 as any).then(1).else(0).end(),
        ]).as('pendingBets'),
        eb.fn<number>('sum', [
          eb.case().when('br.resultId', '=', 1 as any).then(1).else(0).end(),
        ]).as('wonBets'),
        eb.fn<number>('sum', [
          eb.case().when('br.resultId', '=', 2 as any).then(1).else(0).end(),
        ]).as('lostBets'),
      ])
      .groupBy(['bh.id', 'bh.name'])
      .orderBy('bh.name', 'asc')
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
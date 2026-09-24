// house.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import type { Database } from '../db/database.types';
import { DATABASE_READ_CONNECTION, DATABASE_WRITE_CONNECTION } from '../db/db.module';
import type { UserId } from '../../db_types/Users';
import type { BettingHouseId } from '../../db_types/BettingHouse';
import { HouseFilterRequestDto } from '../../house/dto/house.filter.dto';
import { endOfDay, startOfDay } from '../../common/utils/bet.utils';
import { betDate } from './bet-date';
import {
  LOST_RESULT_IDS,
  ResultIdEnum,
  SETTLED_RESULT_IDS,
  WON_RESULT_IDS,
} from '../../bet/dto/result-id.enum';

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

  createHouse(name: string, aliases: string[] = []) {
    return this.dbWrite
      .insertInto('bettingHouses')
      .values({ name, aliases, isActive: true })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Lista da tela de admin: inclui as inativas (`findAllHouses` esconde, e daí
   * não haveria como reativar uma) e traz quantas apostas cada casa tem — é o
   * que denuncia duplicata, "Bet365" com 300 apostas ao lado de "Bet 365" com 2.
   */
  findAllHousesForAdmin() {
    return this.dbRead
      .selectFrom('bettingHouses as h')
      .leftJoin('bets as b', (join) => join.onRef('b.houseId', '=', 'h.id').on('b.deletedAt', 'is', null))
      .select((eb) => [
        'h.id as id',
        'h.name as name',
        'h.isActive as isActive',
        'h.aliases as aliases',
        eb.fn.count<string>('b.id').as('betCount'),
      ])
      .groupBy(['h.id', 'h.name', 'h.isActive', 'h.aliases'])
      .orderBy('h.name', 'asc')
      .execute();
  }

  updateHouse(id: BettingHouseId, update: { name?: string; aliases?: string[]; isActive?: boolean }) {
    return this.dbWrite
      .updateTable('bettingHouses')
      .set({ ...update, updatedAt: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
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
      .where('b.deletedAt', 'is', null)
      .leftJoin('betResults as br', 'br.betId', 'b.id')
      .where('b.userId', '=', userId)
      .select((eb) => [
        'b.houseId',
        eb.fn.count('b.id').as('totalBets'),
        eb.fn<number>('sum', [eb.case().when('br.resultId', 'in', SETTLED_RESULT_IDS as any).then(1).else(0).end()]).as('settledBets'),
        eb.fn<number>('coalesce', [eb.fn.sum<number>('b.stake'), sql.lit(0)]).as('totalStake'),
        eb.fn<number>('coalesce', [eb.fn.sum<number>('b.profit'), sql.lit(0)]).as('totalBetProfit'),
        eb.fn<number>('coalesce', [
          eb.fn.sum<number>(eb.case().when('br.resultId', '=', ResultIdEnum.PENDING as any).then(1).else(0).end()),
          sql.lit(0),
        ]).as('pendingBets'),
        eb.fn<number>('coalesce', [
          eb.fn.sum<number>(eb.case().when('br.resultId', 'in', WON_RESULT_IDS as any).then(1).else(0).end()),
          sql.lit(0),
        ]).as('wonBets'),
        eb.fn<number>('coalesce', [
          eb.fn.sum<number>(eb.case().when('br.resultId', 'in', LOST_RESULT_IDS as any).then(1).else(0).end()),
          sql.lit(0),
        ]).as('lostBets'),
        // Hora em que a aposta foi feita, nao o `betDate`: aposta de hoje num
        // jogo de daqui a 3 dias tem que contar como atividade de hoje.
        eb.fn.max('b.betTime').as('lastBetAt'),
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

  findAllHousesBalance(userId: UserId, filter?: HouseFilterRequestDto) {
    return this.dbRead
      .selectFrom('bettingHouses as bh')
      .leftJoin(this.betsAggregate(userId).as('ba'), 'ba.houseId', 'bh.id')
      .leftJoin(this.transactionsAggregate(userId).as('ta'), 'ta.houseId', 'bh.id')
      .where('bh.isActive', '=', true)
      .where((eb) => eb.or([
        eb('ba.houseId', 'is not', null),
        eb('ta.houseId', 'is not', null),
      ]))
      .$if(!!filter?.houseId, (qb) => qb.where('bh.id', '=', filter!.houseId!))
      .$if(!!filter?.houseName, (qb) => qb.where('bh.name', 'ilike', `%${filter!.houseName}%`))
      .select((eb) => [
        'bh.id as houseId',
        'bh.name as houseName',
        eb.fn.coalesce('ba.totalBets', eb.lit(0)).as('totalBets'),
        eb.fn.coalesce('ba.settledBets', eb.lit(0)).as('settledBets'),
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
        'ba.lastBetAt',
      ])
      .orderBy('bh.name', 'asc')
      .execute();
  }

  findHouseRanking(userId: UserId, startDate?: Date, endDate?: Date) {
    return this.dbRead
      .selectFrom('bettingHouses as bh')
      .innerJoin('bets as b', (join) =>
        join.onRef('bh.id', '=', 'b.houseId').on('b.userId', '=', userId).on('b.deletedAt', 'is', null),
      )
      .innerJoin('betResults as br', 'br.betId', 'b.id')
      .where('bh.isActive', '=', true)
      .where('br.resultId', 'in', SETTLED_RESULT_IDS as any)
      .$if(!!startDate, (qb) => qb.where(betDate, '>=', startOfDay(startDate!)))
      .$if(!!endDate, (qb) => qb.where(betDate, '<', endOfDay(endDate!)))
      .groupBy(['bh.id', 'bh.name'])
      .select((eb) => [
        'bh.id as houseId',
        'bh.name as houseName',
        eb.fn.count('b.id').as('settledBets'),
        eb.fn<number>('coalesce', [
          eb.fn.sum<number>(eb.case().when('br.resultId', 'in', WON_RESULT_IDS as any).then(1).else(0).end()),
          sql.lit(0),
        ]).as('wonBets'),
        eb.fn<number>('coalesce', [
          eb.fn.sum<number>(eb.case().when('br.resultId', 'in', LOST_RESULT_IDS as any).then(1).else(0).end()),
          sql.lit(0),
        ]).as('lostBets'),
        eb.fn<number>('coalesce', [eb.fn.avg<number>('b.odd'), sql.lit(0)]).as('avgOdd'),
        eb.fn<number>('coalesce', [eb.fn.avg<number>('b.stake'), sql.lit(0)]).as('avgStake'),
        eb.fn<number>('coalesce', [eb.fn.sum<number>('b.stake'), sql.lit(0)]).as('volume'),
        eb.fn<number>('coalesce', [eb.fn.sum<number>('b.profit'), sql.lit(0)]).as('profit'),
      ])
      .execute();
  }
}

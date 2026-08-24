import { Inject, Injectable } from '@nestjs/common';
import { BettingHouseId } from '../../db_types/BettingHouse';
import { UserId } from '../../db_types/Users';
import { NewHouseTransaction } from '../../db_types/HouseTransactions';
import { DATABASE_READ_CONNECTION, DATABASE_WRITE_CONNECTION } from '../db/db.module';
import { Kysely } from 'kysely';
import { Database } from '../db/database.types';
import { isNotEmpty } from 'class-validator';
import { endOfDay } from '../../common/utils/bet.utils';

export interface FilterGetTransactions {
  houseId?: BettingHouseId;
  startDate?: Date;
  endDate?: Date;
}

@Injectable()
export class TransactionRepository {

  constructor(
    @Inject(DATABASE_WRITE_CONNECTION)
    private readonly dbWrite: Kysely<Database>,
    @Inject(DATABASE_READ_CONNECTION)
    private readonly dbRead: Kysely<Database>,
  ) {}

 async create(newHouseTransaction: NewHouseTransaction) {
  const result = await this.dbWrite
    .insertInto("houseTransactions")
    .values(newHouseTransaction)
    .returning("id")
    .executeTakeFirstOrThrow();

  return result;
}

async findAllTransactions(userId: UserId, filter?: FilterGetTransactions) {
  return this.dbRead
    .selectFrom("houseTransactions as ht")
    .leftJoin("bettingHouses as h", "ht.houseId", "h.id")
    .leftJoin("transactionTypes as tt", "ht.transactionTypeId", "tt.id")
    .select([
      "ht.id",
      "h.name as houseName",
      "tt.name as transactionType",
      "ht.value",
      "ht.createdAt",
    ])
    .where("ht.userId", "=", userId) 
    .$if(isNotEmpty(filter?.houseId), (qb) =>
      qb.where("ht.houseId", "=", filter!.houseId!)
    )
    .$if(isNotEmpty(filter?.startDate), (qb) =>
      qb.where("ht.createdAt", ">=", filter!.startDate!)
    )
    .$if(isNotEmpty(filter?.endDate), (qb) =>
      qb.where("ht.createdAt", "<=", endOfDay(filter!.endDate!))
    )
    .orderBy("ht.createdAt", "desc")
    .execute();
}
  async findAllTypeTransactions() {
    return this.dbRead
      .selectFrom("transactionTypes")
      .select(["id", "name"])
      .orderBy("name", "asc")
      .execute();
  }
}
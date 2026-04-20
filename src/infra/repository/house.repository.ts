import { Inject, Injectable } from "@nestjs/common";
import { isNotEmpty } from "class-validator";
import { Kysely } from "kysely";
import type { Database } from "../db/database.types";
import { DATABASE_READ_CONNECTION } from "../db/db.module";
import type { UserId } from "../../db_types/Users";
import type { BettingHouseId } from "../../db_types/BettingHouse";


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

  async findAllHouses() {
    return this.dbRead
      .selectFrom("bettingHouses")
      .select([
        "id",
        "name",
        "isActive as active",
      ])
      .where("isActive", "=", true)
      .orderBy("name", "asc")
      .execute();
  }

  async findById(id: BettingHouseId) {
    return this.dbRead
      .selectFrom("bettingHouses")
      .select([
        "id",
        "name",
        "isActive",
      ])
      .where("id", "=", id)
      .executeTakeFirst();
  }

  async findUserBets(userId: UserId, filter?: FilterGetHouses) {
    return this.dbRead
      .selectFrom("bets as b")
      .leftJoin("betResults as br", "br.betId", "b.id")
      .leftJoin("bettingHouses as bh", "bh.id", "b.houseId")
      .select([
        "b.id",
        "b.houseId",
        "b.stake",
        "b.profit",
        "br.resultId",
        "bh.name as houseName",
      ])
      .where("b.userId", "=", userId)
      .$if(filter?.houseId !== undefined, (qb) =>
        qb.where("b.houseId", "=", filter!.houseId!),
      )
      .$if(isNotEmpty(filter?.houseName), (qb) =>
        qb.where("bh.name", "ilike", `%${filter!.houseName}%`),
      )
      .execute();
  }

  async findHouseTransactions(userId: UserId, filter?: FilterGetHouses) {
    return this.dbRead
      .selectFrom("houseTransactions as ht")
      .leftJoin("bettingHouses as bh", "bh.id", "ht.houseId")
      .select([
        "ht.id",
        "ht.houseId",
        "ht.userId",
        "ht.transactionTypeId",
        "ht.value",
        "ht.description",
        "ht.createdAt",
        "ht.updatedAt",
        "bh.name as houseName",
      ])
      .where("ht.userId", "=", userId)
      .$if(filter?.houseId !== undefined, (qb) =>
        qb.where("ht.houseId", "=", filter!.houseId!),
      )
      .$if(isNotEmpty(filter?.houseName), (qb) =>
        qb.where("bh.name", "ilike", `%${filter!.houseName}%`),
      )
      .execute();
  }
}
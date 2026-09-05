
import { Inject, Injectable } from '@nestjs/common';
import { NewUser, UpdateUser, UserId } from '../../db_types/Users';
import { DATABASE_READ_CONNECTION, DATABASE_WRITE_CONNECTION } from '../db/db.module';
import { Kysely } from 'kysely';
import { Database } from '../db/database.types';

@Injectable()
export class UsersRepository {
  constructor(
    @Inject(DATABASE_WRITE_CONNECTION)
    private readonly dbWrite: Kysely<Database>,
    @Inject(DATABASE_READ_CONNECTION)
    private readonly dbRead: Kysely<Database>,
  ) {}

 async findByEmail(email: string) {
  return this.dbRead
    .selectFrom("users")
    .selectAll()
    .where("email", "=", email)
    .executeTakeFirst();
}

async findByUsername(username: string) {
  return this.dbRead
    .selectFrom("users")
    .selectAll()
    .where("username", "=", username)
    .executeTakeFirst();
}

async findById(id: UserId) {
  return this.dbRead
    .selectFrom("users")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
}

   async linkTelegram(userId: UserId, telegramUserId: number) {
  const update: UpdateUser = {
    telegramUserId,
    telegramLinkedAt: new Date(),
    // O código morre no ato: um mesmo código não vincula dois Telegrams.
    telegramLinkCode: null,
    telegramLinkExpiresAt: null,
    updatedAt: new Date(),
  };

  const linkedUser = await this.dbWrite
    .updateTable("users")
    .set(update)
    .where("id", "=", userId)
    .returning("id")
    .executeTakeFirstOrThrow();

  return !!linkedUser;
}


 async insertUser(newUser: NewUser) {
  return this.dbWrite
    .insertInto("users")
    .values({
      ...newUser,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

 async updateUser(id: UserId, update: UpdateUser) {
  if (Object.keys(update).length === 0) {
    return this.findById(id);
  }

  return this.dbWrite
    .updateTable("users")
    .set({
      ...update,
      updatedAt: new Date(),
    })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

async findByTelegramLinkCode(code: string) {
  return this.dbRead
    .selectFrom("users")
    .selectAll()
    .where("telegramLinkCode", "=", code)
    .executeTakeFirst();
}

// Apaga tudo que é do usuário e o usuário. bets e house_transactions são
// ON DELETE SET NULL no banco, então sem esse delete explícito as linhas
// sobreviveriam órfãs à conta excluída.
async deleteUserAndData(userId: UserId) {
  await this.dbWrite.transaction().execute(async (trx) => {
    await trx.deleteFrom("bets").where("userId", "=", userId).execute();
    await trx.deleteFrom("houseTransactions").where("userId", "=", userId).execute();
    await trx.deleteFrom("houseBalances").where("userId", "=", userId).execute();
    await trx.deleteFrom("users").where("id", "=", userId).execute();
  });
}

async findByTelegramUserId(telegramUserId: number) {
  return this.dbRead
    .selectFrom("users")
    .selectAll()
    .where("telegramUserId", "=", telegramUserId)
    .executeTakeFirst();
}

  async updateUserStake(userId: UserId, stake: number) {
  const updated = await this.dbWrite
    .updateTable("users")
    .set({
      stake,
      updatedAt: new Date(),
    })
    .where("id", "=", userId)
    .returning("id")
    .executeTakeFirst();

  return !!updated;
}

async getUserStake(userId: UserId) {
  const result = await this.dbRead
    .selectFrom("users")
    .select("stake")
    .where("id", "=", userId)
    .executeTakeFirst();

  return result?.stake ?? null;
}

async findLinkedForTipsFanout() {
  return this.dbRead
    .selectFrom("users")
    .select(["id", "telegramUserId", "minPercentFilter"])
    .where("telegramUserId", "is not", null)
    .execute();
}

async updateMinPercentFilter(telegramUserId: number, value: number | null) {
  const updated = await this.dbWrite
    .updateTable("users")
    .set({ minPercentFilter: value, updatedAt: new Date() })
    .where("telegramUserId", "=", telegramUserId)
    .returning("id")
    .executeTakeFirst();

  return !!updated;
}
}

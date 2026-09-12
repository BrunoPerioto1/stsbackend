import { Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import type { Database } from '../db/database.types';
import { DATABASE_READ_CONNECTION } from '../db/db.module';

@Injectable()
export class SportRepository {
  constructor(
    @Inject(DATABASE_READ_CONNECTION)
    private readonly dbRead: Kysely<Database>,
  ) {}

  findAllSports() {
    return this.dbRead
      .selectFrom('sports')
      .select(['id', 'name', 'aliases', 'isActive as active'])
      .where('isActive', '=', true)
      .orderBy('name', 'asc')
      .execute();
  }
}

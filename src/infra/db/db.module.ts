import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './db.service';
import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { pool } from './db';
import type { Database } from './database.types';
import { KYSELY_DB } from './db.tokens';

@Global()
@Module({
  providers: [
    DatabaseService,
    {
      provide: Pool,
      useValue: pool,
    },
    {
      provide: KYSELY_DB,
      useFactory: () =>
        new Kysely<Database>({
          dialect: new PostgresDialect({ pool }),
        }),
    },
  ],
  exports: [DatabaseService, Pool, KYSELY_DB],
})
export class DatabaseModule {}

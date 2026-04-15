import { Global, Logger, Module } from '@nestjs/common';
import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

import { pool } from './db';
import { DatabaseService } from './db.service';
import type { Database } from './database.types';
import { KYSELY_DB } from './db.tokens';

export const DATABASE_WRITE_CONNECTION = 'DATABASE_WRITE_CONNECTION';
export const DATABASE_READ_CONNECTION = 'DATABASE_READ_CONNECTION';

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
          plugins: [new CamelCasePlugin()],
        }),
    },
    {
      provide: DATABASE_WRITE_CONNECTION,
      useFactory: () => {
        const db = new Kysely<Database>({
          dialect: new PostgresDialect({ pool }),
          plugins: [new CamelCasePlugin()],
        });

        new Logger('DB').log('WRITE connected');

        return db;
      },
    },
    {
      provide: DATABASE_READ_CONNECTION,
      useFactory: () => {
        const db = new Kysely<Database>({
          dialect: new PostgresDialect({ pool }),
          plugins: [new CamelCasePlugin()],
        });

        new Logger('DB').log('READ connected');

        return db;
      },
    },
  ],
  exports: [
    DatabaseService,
    Pool,
    KYSELY_DB,
    DATABASE_WRITE_CONNECTION,
    DATABASE_READ_CONNECTION,
  ],
})
export class DatabaseModule {}

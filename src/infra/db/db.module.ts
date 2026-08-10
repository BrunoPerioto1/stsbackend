import { Global, Logger, Module } from '@nestjs/common';
import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';

import { pool } from './db';
import type { Database } from './database.types';

export const DATABASE_WRITE_CONNECTION = 'DATABASE_WRITE_CONNECTION';
export const DATABASE_READ_CONNECTION = 'DATABASE_READ_CONNECTION';

@Global()
@Module({
  providers: [
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
  exports: [DATABASE_WRITE_CONNECTION, DATABASE_READ_CONNECTION],
})
export class DatabaseModule {}

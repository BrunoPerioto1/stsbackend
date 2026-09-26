import { Global, Logger, Module } from '@nestjs/common';
import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import type { Pool } from 'pg';

import { createPool } from './db';
import type { Database } from './database.types';

export const DATABASE_WRITE_CONNECTION = 'DATABASE_WRITE_CONNECTION';
export const DATABASE_READ_CONNECTION = 'DATABASE_READ_CONNECTION';
const DATABASE_POOL = 'DATABASE_POOL';

// Leitura e escrita dividem o mesmo pool: não há réplica separada hoje. Os
// dois nomes ficam pra quando houver.
const kysely = (pool: Pool, label: string) => {
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin()],
  });
  new Logger('DB').log(`${label} connected`);
  return db;
};

@Global()
@Module({
  providers: [
    { provide: DATABASE_POOL, useFactory: createPool },
    {
      provide: DATABASE_WRITE_CONNECTION,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool) => kysely(pool, 'WRITE'),
    },
    {
      provide: DATABASE_READ_CONNECTION,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool) => kysely(pool, 'READ'),
    },
  ],
  exports: [DATABASE_WRITE_CONNECTION, DATABASE_READ_CONNECTION],
})
export class DatabaseModule {}

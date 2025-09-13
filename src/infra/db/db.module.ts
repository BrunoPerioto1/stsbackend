import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './db.service';
import { Pool } from 'pg';
import { pool } from './db';

@Global()
@Module({
  providers: [
    DatabaseService,
    {
      provide: Pool,
      useValue: pool,
    }
  ],
  exports: [DatabaseService, Pool],
})
export class DatabaseModule {}

import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from '../infra/repository/users.repository';
import { DatabaseModule } from '../infra/db/db.module';
import { Pool } from 'pg';
import { pool } from '../infra/db/db';
// import { TelegramLinkController } from './telegram-link.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersRepository,
    { provide: Pool, useValue: pool },
  ],
  exports: [UsersService],
})
export class UsersModule {}

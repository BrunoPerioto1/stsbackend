import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infra/db/db.module';
import { TipsRepository } from '../infra/repository/tips.repository';
import { TipsController } from '../tips/tips.controller';
import { TipsService } from '../tips/tips.service';
import { UsersModule } from './users.module';

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [TipsController],
  providers: [TipsRepository, TipsService],
  exports: [TipsService],
})
export class TipsModule {}

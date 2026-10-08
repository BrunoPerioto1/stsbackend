import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infra/db/db.module';
import { TipsRepository } from '../infra/repository/tips.repository';
import { TipsController } from '../tips/tips.controller';
import { TipsService } from '../tips/tips.service';
import { BetModule } from './bet.module';
import { HouseModule } from './house.module';
import { UsersModule } from './users.module';
import { TipSourcesModule } from './tip-sources.module';

@Module({
  imports: [DatabaseModule, UsersModule, BetModule, HouseModule, TipSourcesModule],
  controllers: [TipsController],
  providers: [TipsRepository, TipsService],
  exports: [TipsService],
})
export class TipsModule {}

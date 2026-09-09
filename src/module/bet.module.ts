import { Module } from '@nestjs/common';
import { BetService } from '../bet/bet.service';
import { BetController } from '../bet/bet.controller';
import { BetRepository } from '../infra/repository/bet.repository';
import { SportEventRepository } from '../infra/repository/sport-event.repository';
import { DatabaseModule } from '../infra/db/db.module';

@Module({
  imports: [DatabaseModule],
  providers: [BetService, BetRepository, SportEventRepository],
  controllers: [BetController],
  exports: [BetService],
})
export class BetModule {}

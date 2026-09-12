import { Module } from '@nestjs/common';
import { BetService } from '../bet/bet.service';
import { BetController } from '../bet/bet.controller';
import { BetRepository } from '../infra/repository/bet.repository';
import { SportEventRepository } from '../infra/repository/sport-event.repository';
import { DatabaseModule } from '../infra/db/db.module';
import { SportModule } from './sport.module';

@Module({
  imports: [DatabaseModule, SportModule],
  providers: [BetService, BetRepository, SportEventRepository],
  controllers: [BetController],
  // SportEventRepository sai daqui porque o /tips também precisa do cache de
  // jogos pra mostrar o horário do confronto — mesma fonte da aposta.
  exports: [BetService, SportEventRepository],
})
export class BetModule {}

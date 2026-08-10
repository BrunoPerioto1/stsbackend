import { Module } from '@nestjs/common';
import { ApostaService } from '../bet/bet.service';
import { ApostaController } from '../bet/bet.controller';
import { BetRepository } from '../infra/repository/bet.repository';
import { DatabaseModule } from '../infra/db/db.module';

@Module({
  imports: [DatabaseModule],
  providers: [ApostaService, BetRepository],
  controllers: [ApostaController],
  exports: [ApostaService],
})
export class ApostaModule {}

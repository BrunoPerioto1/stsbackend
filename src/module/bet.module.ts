import { Module } from '@nestjs/common';
import { ApostaService } from '../bet/bet.service';
import { ApostaController } from '../bet/bet.controller';
import { BetRepository } from '../infra/repository/bet.repository';

@Module({
  providers: [ApostaService, BetRepository],
  controllers: [ApostaController],
  exports: [ApostaService],
})
export class ApostaModule {}

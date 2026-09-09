import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infra/db/db.module';
import { SettlementRepository } from '../infra/repository/settlement.repository';
import { SettlementController } from '../settlement/settlement.controller';
import { SettlementService } from '../settlement/settlement.service';
import { BetModule } from './bet.module';

// Confirmar uma sugestao reusa BetService.finalizeMany: mesmo calculo de lucro
// e mesma transacao da finalizacao manual.
@Module({
  imports: [DatabaseModule, BetModule],
  providers: [SettlementService, SettlementRepository],
  controllers: [SettlementController],
})
export class SettlementModule {}

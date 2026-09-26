import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infra/db/db.module';
import { SettlementRepository } from '../infra/repository/settlement.repository';
import { SettlementController } from '../settlement/settlement.controller';
import { SettlementCronController } from '../settlement/settlement-cron.controller';
import { SettlementService } from '../settlement/settlement.service';
import { BetModule } from './bet.module';
import { TelegramBotModule } from './telegram-bot.module';
import { UsersModule } from './users.module';

// Confirmar uma sugestao reusa BetService.finalizeMany: mesmo calculo de lucro
// e mesma transacao da finalizacao manual. O bot entra so' pelo aviso do cron.
@Module({
  imports: [DatabaseModule, BetModule, TelegramBotModule, UsersModule],
  providers: [SettlementService, SettlementRepository],
  controllers: [SettlementController, SettlementCronController],
})
export class SettlementModule {}

import { Module } from '@nestjs/common';
import { BetSlipController } from '../bet-slip/bet-slip.controller';
import { BetSlipService } from '../bet-slip/bet-slip.service';
import { BetSlipParserService } from '../bet-slip/bet-slip-parser.service';
import { PendingMatchService } from '../bet-slip/pending-match.service';
import { GrokService } from '../telegram/grok.service';
import { HouseModule } from './house.module';
import { UsersModule } from './users.module';
import { TipsModule } from './tips.module';

@Module({
  // GrokService entra como provider local pelo mesmo motivo do TipsModule:
  // daqui só se usa o resolveHouseId, e importar o TelegramModule fecharia
  // um ciclo.
  imports: [HouseModule, UsersModule, TipsModule],
  controllers: [BetSlipController],
  providers: [
    BetSlipService,
    BetSlipParserService,
    PendingMatchService,
    GrokService,
  ],
  exports: [BetSlipParserService, PendingMatchService],
})
export class BetSlipModule {}

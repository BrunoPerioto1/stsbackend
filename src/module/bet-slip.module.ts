import { Module } from '@nestjs/common';
import { BetSlipController } from '../bet-slip/bet-slip.controller';
import { BetSlipService } from '../bet-slip/bet-slip.service';
import { BetSlipParserService } from '../bet-slip/bet-slip-parser.service';
import { PendingMatchService } from '../bet-slip/pending-match.service';
import { HouseModule } from './house.module';
import { UsersModule } from './users.module';
import { TipsModule } from './tips.module';
import { RateLimitModule } from './rate-limit.module';

@Module({
  imports: [HouseModule, UsersModule, TipsModule, RateLimitModule],
  controllers: [BetSlipController],
  providers: [
    BetSlipService,
    BetSlipParserService,
    PendingMatchService,
  ],
  exports: [BetSlipParserService, PendingMatchService],
})
export class BetSlipModule {}

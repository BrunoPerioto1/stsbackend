import { Module } from '@nestjs/common';
import { BetModule } from './module/bet.module';
import { BetSlipModule } from './module/bet-slip.module';
import { TelegramModule } from './module/telegram.module';
import { HouseModule } from './module/house.module';
import { DashboardModule } from './module/dashboard.module';
import { TransactionModule } from './module/transaction.module';
import { AuthModule } from './module/auth.module';
import { TelegramLinkModule } from './module/telegram-link.module';
import { TipsModule } from './module/tips.module';
import { SettlementModule } from './module/settlement.module';

@Module({
  imports: [
    BetModule,
    BetSlipModule,
    TelegramModule,
    HouseModule,
    DashboardModule,
    TransactionModule,
    AuthModule,
    TelegramLinkModule,
    TipsModule,
    SettlementModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

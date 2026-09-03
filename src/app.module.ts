import { Module } from '@nestjs/common';
import { BetModule } from './module/bet.module';
import { TelegramModule } from './module/telegram.module';
import { HouseModule } from './module/house.module';
import { DashboardModule } from './module/dashboard.module';
import { TransactionModule } from './module/transaction.module';
import { AuthModule } from './module/auth.module';
import { TelegramLinkModule } from './module/telegram-link.module';

@Module({
  imports: [
    BetModule,
    TelegramModule,
    HouseModule,
    DashboardModule,
    TransactionModule,
    AuthModule,
    TelegramLinkModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ApostaModule } from './module/bet.module';
import { TelegramModule } from './module/telegram.module';
import { HouseModule } from './module/house.module';
import { DashboardModule } from './module/dashboard.module';

@Module({
  imports: [ApostaModule, TelegramModule, HouseModule, DashboardModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
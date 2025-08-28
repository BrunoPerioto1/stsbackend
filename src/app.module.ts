import { Module } from '@nestjs/common';
import { ApostaModule } from './module/bet.module';
import { TelegramModule } from './module/telegram.module';
import { HouseModule } from './module/house.module';

@Module({
  imports: [ApostaModule, TelegramModule, HouseModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
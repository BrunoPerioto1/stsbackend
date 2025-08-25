import { Module } from '@nestjs/common';
import { TelegramModule } from './telegram/telegram.module';
import { ApostaModule } from './aposta/aposta.module';

@Module({
  imports: [TelegramModule, ApostaModule],
})
export class AppModule {}
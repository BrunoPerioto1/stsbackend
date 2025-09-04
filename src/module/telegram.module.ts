import { Module } from '@nestjs/common';
import { TelegramService } from '../telegram/telegram.service';
import { GrokService } from '../telegram/grok.service';
import { ApostaModule } from './bet.module';

@Module({
  imports: [ApostaModule],
  providers: [TelegramService, GrokService],
})
export class TelegramModule {}

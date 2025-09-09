import { Module } from '@nestjs/common';
import { TelegramService } from '../telegram/telegram.service';
import { GrokService } from '../telegram/grok.service';
import { ApostaModule } from './bet.module';
import { HouseModule } from './house.module';

@Module({
  imports: [ApostaModule, HouseModule],
  providers: [TelegramService, GrokService],
})
export class TelegramModule {}

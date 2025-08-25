import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { GrokService } from './grok.service';
import {ApostaModule} from '../aposta/aposta.module';

@Module({
  imports: [ApostaModule],
  providers: [TelegramService, GrokService],
})
export class TelegramModule {}

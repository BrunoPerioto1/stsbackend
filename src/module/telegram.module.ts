import { Module } from '@nestjs/common';
import { TelegramService } from '../telegram/telegram.service';
import { GrokService } from '../telegram/grok.service';
import { BetModule } from './bet.module';
import { HouseModule } from './house.module';
import { DatabaseModule } from '../infra/db/db.module';
import { UsersModule } from './users.module';
import { TelegramController } from '../telegram/telegram.controller';
import { TipsModule } from './tips.module';
import {
  TELEGRAM_BOT,
  createTelegramBot,
} from '../telegram/telegram-bot.provider';
import { BotCommandsService } from '../telegram/bot-commands.service';
import { BetTextService } from '../telegram/bet-text.service';
import { TipFanoutService } from '../telegram/tip-fanout.service';
import { PendentesService } from '../telegram/pendentes.service';
import { TelegramCallbackService } from '../telegram/telegram-callback.service';

@Module({
  imports: [BetModule, HouseModule, DatabaseModule, UsersModule, TipsModule],
  controllers: [TelegramController],
  providers: [
    { provide: TELEGRAM_BOT, useFactory: createTelegramBot },
    TelegramService,
    GrokService,
    BotCommandsService,
    BetTextService,
    TipFanoutService,
    PendentesService,
    TelegramCallbackService,
  ],
})
export class TelegramModule {}

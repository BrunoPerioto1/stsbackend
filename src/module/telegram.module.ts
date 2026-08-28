import { Module } from '@nestjs/common';
import { TelegramService } from '../telegram/telegram.service';
import { GrokService } from '../telegram/grok.service';
import { ApostaModule } from './bet.module';
import { HouseModule } from './house.module';
import { DatabaseModule } from '../infra/db/db.module';
import { UsersModule } from '../users/users.module';
import { TelegramController } from '../telegram/telegram.controller';
import { TipsModule } from './tips.module';

@Module({
  imports: [ApostaModule, HouseModule, DatabaseModule, UsersModule, TipsModule],
  controllers: [TelegramController],
  providers: [TelegramService, GrokService],
})
export class TelegramModule {}

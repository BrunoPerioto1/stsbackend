import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infra/db/db.module';
import { TipsRepository } from '../infra/repository/tips.repository';
import { TipsController } from '../tips/tips.controller';
import { TipsService } from '../tips/tips.service';
import { GrokService } from '../telegram/grok.service';
import { BetModule } from './bet.module';
import { HouseModule } from './house.module';
import { UsersModule } from './users.module';

@Module({
  // GrokService entra como provider local, não via TelegramModule: aquele
  // importa este, e importar de volta fecharia um ciclo. Só se usa daqui o
  // resolveHouseId, que é casamento de string com as casas cadastradas.
  imports: [DatabaseModule, UsersModule, BetModule, HouseModule],
  controllers: [TipsController],
  providers: [TipsRepository, TipsService, GrokService],
  exports: [TipsService],
})
export class TipsModule {}

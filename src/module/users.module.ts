import { Module } from '@nestjs/common';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { UsersRepository } from '../infra/repository/users.repository';
import { DatabaseModule } from '../infra/db/db.module';
import { TelegramBotModule } from './telegram-bot.module';

@Module({
  // TelegramBotModule pela porta do grupo Tips: desvincular, trocar de
  // Telegram e excluir a conta tiram a pessoa de lá.
  imports: [DatabaseModule, TelegramBotModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}

import { Module } from '@nestjs/common';
import { TelegramLinkController } from '../auth/telegram-link.controller';
import { UsersRepository } from '../infra/repository/users.repository';
import { DatabaseModule } from '../infra/db/db.module';
import { JwtModule } from '@nestjs/jwt';
import * as dotenv from 'dotenv';
dotenv.config();

@Module({
  imports: [
    DatabaseModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [TelegramLinkController],
  providers: [UsersRepository],
})
export class TelegramLinkModule {}

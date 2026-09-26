import { Module } from '@nestjs/common';
import { TelegramLinkController } from '../auth/telegram-link.controller';
import { UsersRepository } from '../infra/repository/users.repository';
import { DatabaseModule } from '../infra/db/db.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    DatabaseModule,
    // registerAsync: o segredo é lido quando o módulo sobe, com o .env já
    // carregado pelo ConfigModule — não no import do arquivo.
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: '1d' },
      }),
    }),
  ],
  controllers: [TelegramLinkController],
  providers: [UsersRepository],
})
export class TelegramLinkModule {}

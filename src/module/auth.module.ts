import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from '../auth/jwt/jwt.strategy';
import { AuthService } from '../auth/auth.service';
import { AuthController } from '../auth/auth.controller';
import { PasswordResetService } from '../auth/password-reset.service';
import { UsersModule } from './users.module';
import { TelegramBotModule } from './telegram-bot.module';

@Module({
  imports: [
    // registerAsync: o segredo é lido quando o módulo sobe, depois que o .env
    // já foi carregado — não no import do arquivo.
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { algorithm: 'HS256', expiresIn: '1d' },
      }),
    }),
    UsersModule,
    // O código de "Esqueci a senha" sai pelo bot.
    TelegramBotModule,
  ],
  controllers: [AuthController],
  providers: [JwtStrategy, AuthService, PasswordResetService],
  exports: [JwtStrategy, JwtModule, AuthService],
})
export class AuthModule {}

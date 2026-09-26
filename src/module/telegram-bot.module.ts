import { Module } from '@nestjs/common';
import {
  TELEGRAM_BOT,
  createTelegramBot,
} from '../telegram/telegram-bot.provider';
import { TipsGroupService } from '../telegram/tips-group.service';
import { PaymentClaimService } from '../users/payment-claim.service';
import { UsersModule } from './users.module';

// O bot e a porta do grupo Tips num módulo à parte: o painel admin também
// tira gente do grupo e manda convite, e importar o TelegramModule inteiro lá
// levaria junto os handlers e o fan-out. O "Já paguei" mora aqui pelo mesmo
// motivo: a tela de renovação e o botão do bot usam o mesmo aviso.
@Module({
  imports: [UsersModule],
  providers: [
    { provide: TELEGRAM_BOT, useFactory: createTelegramBot },
    TipsGroupService,
    PaymentClaimService,
  ],
  exports: [TELEGRAM_BOT, TipsGroupService, PaymentClaimService],
})
export class TelegramBotModule {}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { TELEGRAM_BOT } from '../telegram/telegram-bot.provider';
import { UsersRepository } from '../infra/repository/users.repository';
import { ADMIN_ROLE_ID } from '../common/guards/admin.guard';
import { frontUrl } from '../common/utils/front-url';
import { billingInfo } from './access';
import type { UserId } from '../db_types/Users';

// Dois cliques seguidos não viram duas mensagens pro admin.
const RENOTIFY_AFTER_MS = 30 * 60_000;

export type PaymentClaimResult = 'notified' | 'already' | 'inactive' | 'not_found';

/**
 * "Já paguei" (tela de renovação ou botão do bot). Marca a conta, que aparece
 * destacada no painel, e avisa os admins no Telegram com o identificador do
 * PIX. Não libera nada: quem libera continua sendo o admin, depois de conferir.
 */
@Injectable()
export class PaymentClaimService {
  private readonly logger = new Logger(PaymentClaimService.name);

  constructor(
    @Inject(TELEGRAM_BOT) private readonly bot: Telegraf,
    private readonly usersRepository: UsersRepository,
  ) {}

  async claim(userId: number): Promise<PaymentClaimResult> {
    const user = await this.usersRepository.findById(userId as UserId);
    if (!user) return 'not_found';
    if (user.isActive === false) return 'inactive';

    const last = user.paymentClaimedAt ? new Date(user.paymentClaimedAt).getTime() : 0;
    if (Date.now() - last < RENOTIFY_AFTER_MS) return 'already';

    await this.usersRepository.updateUser(user.id, { paymentClaimedAt: new Date() });

    const { price, txid } = billingInfo(user.id);
    const text = [
      `💰 ${user.fullName || user.username} (${user.email}) avisou que pagou${price ? ` R$ ${price.toFixed(2).replace('.', ',')}` : ''}.`,
      `Identificador do PIX: ${txid}`,
      'Confira o extrato e libere o acesso no painel.',
    ].join('\n');

    const admins = await this.usersRepository.findAdminsWithTelegram(ADMIN_ROLE_ID);
    for (const admin of admins) {
      await this.bot.telegram
        .sendMessage(admin.telegramUserId as number, text, {
          reply_markup: {
            inline_keyboard: [[{ text: '👤 Abrir usuários', url: frontUrl('/admin/users') }]],
          },
        })
        .catch((error: Error) => this.logger.warn(`aviso de pagamento falhou: ${error.message}`));
    }
    return 'notified';
  }
}

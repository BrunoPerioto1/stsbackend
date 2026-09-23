import {
  Controller,
  Get,
  Headers,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Telegraf } from 'telegraf';
import { TELEGRAM_BOT } from './telegram-bot.provider';
import { UsersRepository } from '../infra/repository/users.repository';
import { ADMIN_ROLE_ID } from '../common/guards/admin.guard';
import { billingInfo, daysUntil } from '../users/access';

// Dias antes do vencimento em que o cliente é lembrado. Cron roda 1x/dia, então
// cada aviso sai uma vez só sem precisar guardar "já avisei".
const REMINDER_DAYS: Record<number, string> = {
  3: '⏳ Seu acesso vence em 3 dias',
  1: '⚠️ Seu acesso vence amanhã',
  0: '🔒 Seu acesso venceu hoje',
};

@ApiTags('access')
@Controller('access')
export class AccessController {
  constructor(
    @Inject(TELEGRAM_BOT) private readonly bot: Telegraf,
    private readonly usersRepository: UsersRepository,
  ) {}

  // Público: a tela de acesso vencido precisa mostrar a chave sem token válido.
  @Get('billing')
  @ApiOperation({ summary: 'Chave PIX e preço do acesso' })
  billing() {
    return billingInfo();
  }

  // Chamado pelo cron da Vercel (vercel.json), que manda Bearer CRON_SECRET.
  @Get('cron')
  @ApiExcludeEndpoint()
  async remind(@Headers('authorization') auth?: string) {
    if (
      !process.env.CRON_SECRET ||
      auth !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      throw new UnauthorizedException();
    }

    const { pixKey, price } = billingInfo();
    const payLine = [
      price ? `Valor: R$ ${price.toFixed(2).replace('.', ',')}` : null,
      pixKey ? `PIX: \`${pixKey}\`` : null,
      'Depois de pagar, mande o comprovante aqui.',
    ]
      .filter(Boolean)
      .join('\n');
    const keyboard = pixKey
      ? {
          inline_keyboard: [
            [{ text: '📋 Copiar PIX', copy_text: { text: pixKey } } as any],
          ],
        }
      : undefined;

    const users = await this.usersRepository.findWithAccessDeadline();
    const summary: string[] = [];

    for (const user of users) {
      if (user.isActive === false || !user.accessUntil) continue;
      const days = daysUntil(user.accessUntil);
      const headline = REMINDER_DAYS[days];
      if (!headline) continue;

      const date = new Date(user.accessUntil).toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
      });
      summary.push(
        `• ${user.username}: ${days === 0 ? 'venceu hoje' : `vence em ${days}d`} (${date})${user.telegramUserId ? '' : ' — sem Telegram'}`,
      );
      if (!user.telegramUserId) continue;

      try {
        await this.bot.telegram.sendMessage(
          user.telegramUserId,
          `${headline} (${date}).\n\n${payLine}`,
          {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
          },
        );
      } catch (error) {
        console.error(
          `⚠️ Aviso de vencimento falhou (userId=${user.id}):`,
          error,
        );
      }
    }

    if (summary.length) {
      const admins =
        await this.usersRepository.findAdminsWithTelegram(ADMIN_ROLE_ID);
      for (const admin of admins) {
        await this.bot.telegram
          .sendMessage(
            admin.telegramUserId as number,
            `💰 Vencimentos:\n${summary.join('\n')}`,
          )
          .catch((error) =>
            console.error('⚠️ Resumo de vencimentos falhou:', error),
          );
      }
    }

    return { notified: summary.length };
  }
}

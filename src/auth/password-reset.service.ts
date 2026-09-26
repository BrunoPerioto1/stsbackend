import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Telegraf } from 'telegraf';
import { TELEGRAM_BOT } from '../telegram/telegram-bot.provider';
import { UsersRepository } from '../infra/repository/users.repository';

const CODE_TTL_MS = 15 * 60_000;
// Um código novo por minuto: segurar o dedo no botão não vira spam no bot.
const RESEND_AFTER_MS = 60_000;
// Cinco erros matam o código; seis dígitos não aguentam força bruta sem teto.
const MAX_ATTEMPTS = 5;

const INVALID = 'Código inválido ou vencido. Peça um novo.';

/**
 * "Esqueci a senha" pelo Telegram: o site não manda e-mail, mas o bot já
 * conhece quem vinculou a conta. O código de 6 dígitos vai no privado do bot e
 * só o hash fica no banco.
 *
 * A resposta do pedido é a mesma exista ou não a conta, tenha ou não Telegram
 * — senão a tela viraria um jeito de descobrir quais e-mails estão cadastrados.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    @Inject(TELEGRAM_BOT) private readonly bot: Telegraf,
  ) {}

  async request(email: string): Promise<void> {
    const user = await this.usersRepository.findByEmail(email.trim());
    if (!user?.telegramUserId || user.isActive === false) return;

    const sentAt = user.passwordResetExpiresAt
      ? new Date(user.passwordResetExpiresAt).getTime() - CODE_TTL_MS
      : 0;
    if (Date.now() - sentAt < RESEND_AFTER_MS) return;

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.usersRepository.updateUser(user.id, {
      passwordResetCodeHash: await bcrypt.hash(code, 10),
      passwordResetExpiresAt: new Date(Date.now() + CODE_TTL_MS),
      passwordResetAttempts: 0,
    });

    try {
      await this.bot.telegram.sendMessage(
        user.telegramUserId,
        `🔑 Código pra redefinir sua senha: *${code}*\n\nVale 15 minutos. Se não foi você, ignore — sua senha continua a mesma.`,
        { parse_mode: 'Markdown' },
      );
    } catch (error) {
      this.logger.warn(`codigo de senha nao saiu (userId=${user.id}): ${(error as Error).message}`);
    }
  }

  async reset(email: string, code: string, newPassword: string): Promise<void> {
    const user = await this.usersRepository.findByEmail(email.trim());
    const expiresAt = user?.passwordResetExpiresAt ? new Date(user.passwordResetExpiresAt).getTime() : 0;
    if (!user?.passwordResetCodeHash || expiresAt <= Date.now()) {
      throw new BadRequestException(INVALID);
    }

    if (!(await bcrypt.compare(code.trim(), user.passwordResetCodeHash))) {
      const attempts = (user.passwordResetAttempts ?? 0) + 1;
      await this.usersRepository.updateUser(
        user.id,
        attempts >= MAX_ATTEMPTS
          ? { passwordResetCodeHash: null, passwordResetExpiresAt: null, passwordResetAttempts: 0 }
          : { passwordResetAttempts: attempts },
      );
      throw new BadRequestException(INVALID);
    }

    // Senha nova também destrava o login: quem esqueceu a senha costuma ter
    // estourado as tentativas antes de chegar aqui.
    await this.usersRepository.updateUser(user.id, {
      passwordHash: await bcrypt.hash(newPassword, 10),
      passwordResetCodeHash: null,
      passwordResetExpiresAt: null,
      passwordResetAttempts: 0,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
  }
}

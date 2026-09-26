import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { User } from '../common/decorators/user.decorator';
import { Telegraf } from 'telegraf';
import { TELEGRAM_BOT } from './telegram-bot.provider';
import { UsersRepository } from '../infra/repository/users.repository';
import { ADMIN_ROLE_ID } from '../common/guards/admin.guard';
import { CronGuard } from '../common/guards/cron.guard';
import {
  accessStatus,
  billingInfo,
  billingPayLine,
  daysUntil,
  pixKeyboard,
} from '../users/access';
import { readPayToken } from '../users/pay-token';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { PaymentClaimService } from '../users/payment-claim.service';
import { BillingQueryDTO, PaymentClaimDTO } from '../users/dto/access.dto';
import type { UserId } from '../db_types/Users';
import { errorArgs } from '../common/utils/log';

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
  private readonly logger = new Logger(AccessController.name);

  constructor(
    @Inject(TELEGRAM_BOT) private readonly bot: Telegraf,
    private readonly usersRepository: UsersRepository,
    private readonly paymentClaim: PaymentClaimService,
    private readonly rateLimit: RateLimitService,
  ) {}

  // Público: a tela de acesso vencido não tem JWT. Com o payToken da resposta
  // 402, devolve também o PIX copia-e-cola desta conta (valor + txid), se ela
  // é nova ou vencida e se já avisou que pagou.
  @Get('billing')
  @ApiOperation({ summary: 'Chave PIX e preço; com token, o PIX copia-e-cola da conta' })
  async billing(@Query() query: BillingQueryDTO) {
    const userId = readPayToken(query.token);
    const user = userId ? await this.usersRepository.findById(userId as UserId) : undefined;
    if (!user) return { ...billingInfo(), status: null, paymentClaimedAt: null };
    return {
      ...billingInfo(user.id),
      status: accessStatus(user),
      paymentClaimedAt: user.paymentClaimedAt,
    };
  }

  // Mesmo PIX, pra quem ainda está em dia (aviso de "vence em N dias"): com
  // sessão válida não precisa de payToken.
  @Get('billing/me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'PIX copia-e-cola da conta logada' })
  async myBilling(@User('userId') userId: number) {
    const user = await this.usersRepository.findById(userId as UserId);
    return { ...billingInfo(userId), status: null, paymentClaimedAt: user?.paymentClaimedAt ?? null };
  }

  @Post('paid/me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Avisa o admin que a conta logada pagou a renovação' })
  async paidMe(@User('userId') userId: number) {
    return { result: await this.paymentClaim.claim(userId) };
  }

  // "Já paguei" da tela de renovação. Só avisa o admin; não libera nada.
  @Post('paid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Avisa o admin que o pagamento foi feito' })
  async paid(@Body() body: PaymentClaimDTO) {
    const userId = readPayToken(body.token);
    if (!userId) throw new UnauthorizedException('Link de pagamento vencido. Entre de novo.');
    const result = await this.paymentClaim.claim(userId);
    if (result === 'inactive') throw new BadRequestException('Conta desativada. Fale com o administrador.');
    if (result === 'not_found') throw new UnauthorizedException();
    return { result };
  }

  // Chamado pelo cron da Vercel (vercel.json), que manda Bearer CRON_SECRET.
  @Get('cron')
  @ApiExcludeEndpoint()
  @UseGuards(CronGuard)
  async remind() {
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
          `${headline} (${date}).\n\n${billingPayLine(user.id)}`,
          {
            parse_mode: 'Markdown',
            reply_markup: pixKeyboard(user.id),
          },
        );
      } catch (error) {
        this.logger.error(...errorArgs(`⚠️ Aviso de vencimento falhou (userId=${user.id})`, error));
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
            this.logger.error(...errorArgs('⚠️ Resumo de vencimentos falhou', error)),
          );
      }
    }

    // Faxina diária do contador de limite (janelas de mais de um dia).
    await this.rateLimit.purgeOld();

    return { notified: summary.length };
  }
}

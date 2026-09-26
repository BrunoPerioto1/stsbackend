import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { PendentesService } from './pendentes.service';
import { unlinkedInstructions } from './messages.const';
import {
  PAYMENT_CLAIM_CALLBACK,
  accessBlock,
  accessStatus,
  billingInfo,
  billingPayLine,
  pixKeyboard,
} from '../users/access';
import { PaymentClaimService } from '../users/payment-claim.service';
import {
  RateLimitedException,
  RateLimitService,
  TELEGRAM_LINK_LIMIT,
} from '../common/rate-limit/rate-limit.service';
import { MAX_PERCENT_FILTER, MIN_PERCENT_FILTER } from '../users/dto/request.dto';
import { normalizeBetNumber } from '../bet/bet-normalization';
import { frontUrl } from '../common/utils/front-url';
import {
  callbackData,
  commandArgs,
  messageText,
  senderId,
  type BotContext,
} from './utils/bot-context';
import { errorArgs } from '../common/utils/log';

// Os comandos "simples" do bot — cada um só conversa com o usuário que
// chamou, sem envolver fan-out de tips nem callback_query.
@Injectable()
export class BotCommandsService {
  private readonly logger = new Logger(BotCommandsService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly pendentesService: PendentesService,
    private readonly paymentClaim: PaymentClaimService,
    private readonly rateLimit?: RateLimitService,
  ) {}

  async handleStart(ctx: BotContext) {
    await ctx.reply(
      '👋 Bem-vindo!\n\n' +
        `1️⃣ Vincule sua conta: faça login em ${frontUrl('/login')} → Perfil → Telegram → "Gerar código de vinculação" e envie aqui /vincular com os seis dígitos\n` +
        '2️⃣ Defina sua banca: /stake VALOR\n' +
        '3️⃣ (Opcional) Defina o filtro de porcentagem mínima das tips que você quer receber: /filtro 1.5\n' +
        '   Use /filtro off para remover o filtro e receber todas as tips.\n\n' +
        'Depois disso, as apostas do grupo Tips que baterem seu filtro chegam aqui, com um botão para planilhar.\n\n' +
        '📋 Use /pendentes a qualquer momento pra ver quais tips ainda faltam planilhar.',
    );
  }

  // /pendentes: resumo do que ainda falta planilhar (ou marcar como aposta
  // caiu), sem limite de data — uma tip só sai da lista quando você resolve
  // ela, senão ficaria perdida pra sempre se passasse batido no dia em que
  // chegou.
  async handlePendentes(ctx: BotContext) {
    try {
      const user = await this.usersService.findByTelegramUserId(senderId(ctx));
      if (!user) {
        await ctx.reply(unlinkedInstructions());
        return;
      }
      const { text, keyboard } = await this.pendentesService.buildMessage(user);
      await ctx.reply(text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: keyboard,
      });
    } catch (err) {
      this.logger.error(...errorArgs('Erro ao buscar pendentes', err));
      await ctx.reply('❌ Erro ao buscar tips pendentes. Tente novamente.');
    }
  }

  // /site: link direto pro dashboard do app.
  async handleSite(ctx: BotContext) {
    await ctx.reply(`📊 Site: ${frontUrl()}`);
  }

  async handleFiltro(ctx: BotContext) {
    const [arg] = commandArgs(ctx);
    const telegramUserId = senderId(ctx);

    try {
      const user = await this.usersService.findByTelegramUserId(telegramUserId);
      if (!user) {
        await ctx.reply(unlinkedInstructions());
        return;
      }

      if (commandArgs(ctx).length !== 1) {
        await ctx.reply(
          '❌ Formato incorreto. Use: /filtro VALOR (ex.: /filtro 1.5) ou /filtro off',
        );
        return;
      }
      if (arg.toLowerCase() === 'off') {
        await this.usersService.setMinPercentFilter(telegramUserId, null);
        await ctx.reply('✅ Filtro removido. Você vai receber todas as tips do grupo.');
        return;
      }

      const value = Number(arg.replace(',', '.'));
      if (!Number.isFinite(value) || value < MIN_PERCENT_FILTER || value > MAX_PERCENT_FILTER) {
        await ctx.reply(
          `❌ Valor inválido. Informe de ${MIN_PERCENT_FILTER} a ${MAX_PERCENT_FILTER} (ex.: /filtro 1.5), ou /filtro off pra receber tudo.`,
        );
        return;
      }

      await this.usersService.setMinPercentFilter(telegramUserId, value);
      await ctx.reply(`✅ Filtro definido: só chegam tips com porcentagem >= ${value}%`);
    } catch (error) {
      this.logger.error(...errorArgs('Erro ao atualizar filtro', error));
      await ctx.reply('❌ Erro ao atualizar seu filtro. Tente novamente.');
    }
  }

  async handleStake(ctx: BotContext) {
    const args = commandArgs(ctx);
    if (args.length !== 1) {
      await ctx.reply('❌ Formato incorreto. Use: /stake VALOR\nExemplo: /stake 2000');
      return;
    }

    // Banca é dinheiro: "1.500" é mil e quinhentos, "1500,50" tem centavos.
    // O prefixo R$ é o que faz o normalizeBetNumber ler o ponto como milhar.
    const value = normalizeBetNumber(`R$ ${args[0].replace(/^R\$/i, '')}`);
    if (value === null || value <= 0) {
      await ctx.reply('❌ Valor inválido. Informe um número maior que zero.');
      return;
    }

    try {
      const user = await this.usersService.findByTelegramUserId(senderId(ctx));
      if (!user) {
        await ctx.reply(unlinkedInstructions());
        return;
      }

      await this.usersService.updateUserStake(user.id, value);

      await ctx.reply(
        `✅ Banca definida: R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      );
    } catch (error) {
      this.logger.error(...errorArgs('Erro ao atualizar stake', error));
      await ctx.reply('❌ Erro ao atualizar sua banca. Tente novamente.');
    }
  }

  // Último @ gravado por id do Telegram, neste processo: evita uma escrita no
  // banco a cada mensagem. Só vai ao banco na primeira mensagem de cada um e
  // quando o @ muda.
  private readonly knownUsernames = new Map<number, string | null>();

  /** Mantém o @ do card do app em dia; nunca atrapalha o fluxo da mensagem. */
  syncUsername(from: { id: number; is_bot?: boolean; username?: string } | undefined) {
    if (!from || from.is_bot) return;
    const username = from.username ?? null;
    if (this.knownUsernames.get(from.id) === username) return;
    this.knownUsernames.set(from.id, username);
    this.usersService.syncTelegramUsername(from.id, username).catch((error: Error) => {
      this.knownUsernames.delete(from.id);
      this.logger.error('Erro ao sincronizar @ do Telegram', error);
    });
  }

  /**
   * Porteiro do privado: conta vinculada vencida ou desativada não registra
   * aposta, não planilha e não usa comando. Fica na entrada (middleware) e não
   * em cada handler — botão ou comando novo já nasce protegido.
   * Devolve true quando barrou (e já respondeu).
   */
  async blockIfNoAccess(ctx: BotContext): Promise<boolean> {
    if (ctx.chat?.type !== 'private' || !ctx.from || ctx.from.is_bot) return false;
    // Instruções e vínculo seguem livres: é por eles que a pessoa volta.
    if (/^\/(start|vincular)(@\w+)?(\s|$)/.test(messageText(ctx))) return false;

    let user: Awaited<ReturnType<UsersService['findByTelegramUserId']>>;
    try {
      user = await this.usersService.findByTelegramUserId(ctx.from.id);
    } catch (error) {
      // Banco fora: deixa passar — o handler vai esbarrar no mesmo erro e
      // responder como sempre respondeu.
      this.logger.error(...errorArgs('Erro ao conferir acesso no bot', error));
      return false;
    }
    // Sem vínculo: os handlers já pedem o /vincular.
    if (!user) return false;

    // "Já paguei" passa pelo porteiro: é justamente quem está vencido que aperta.
    if (callbackData(ctx) === PAYMENT_CLAIM_CALLBACK) {
      await this.answerPaymentClaim(ctx, user.id, !accessBlock(user));
      return true;
    }

    const block = accessBlock(user);
    if (!block) return false;

    const { pixKey, price } = billingInfo(user.id);
    if (ctx.callbackQuery) {
      // Pop-up e nada mais: a mensagem e o botão ficam intactos, então o mesmo
      // "Planilhar" volta a funcionar quando o acesso for liberado.
      const text =
        block === 'inactive'
          ? '🚫 Sua conta está desativada. Fale com o administrador.'
          : [
              accessStatus(user) === 'new'
                ? '🔓 Sua conta ainda não foi ativada. Ative pelo PIX.'
                : '🔒 Seu acesso venceu. Renove pelo PIX para continuar.',
              price ? `Valor: R$ ${price.toFixed(2).replace('.', ',')}` : null,
              pixKey ? `PIX: ${pixKey}` : null,
            ]
              .filter(Boolean)
              .join('\n');
      await ctx.answerCbQuery(text.slice(0, 200), { show_alert: true }).catch(() => undefined);
      return true;
    }

    if (block === 'inactive') {
      await ctx.reply('🚫 Sua conta está desativada. Fale com o administrador.');
      return true;
    }
    const date = new Date(user.accessUntil as Date).toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });
    const headline =
      accessStatus(user) === 'new'
        ? '🔓 Sua conta ainda não foi ativada.'
        : `🔒 Seu acesso venceu em ${date}.`;
    await ctx.reply(`${headline}\n\n${billingPayLine(user.id)}`, {
      parse_mode: 'Markdown',
      reply_markup: pixKeyboard(user.id),
    });
    return true;
  }

  private async answerPaymentClaim(ctx: BotContext, userId: number, alreadyReleased: boolean) {
    if (alreadyReleased) {
      await ctx.answerCbQuery('✅ Seu acesso já está liberado.', { show_alert: true }).catch(() => undefined);
      return;
    }
    const result = await this.paymentClaim.claim(userId);
    const text =
      result === 'notified'
        ? '✅ Avisei o administrador. O acesso volta assim que ele conferir o pagamento.'
        : result === 'already'
          ? '⏳ O administrador já foi avisado. Assim que ele conferir, o acesso volta.'
          : '🚫 Sua conta está desativada. Fale com o administrador.';
    await ctx.answerCbQuery(text, { show_alert: true }).catch(() => undefined);
  }

  async handleVincular(ctx: BotContext) {
    const args = commandArgs(ctx);
    if (args.length !== 1) {
      await ctx.reply('❌ Formato incorreto. Use: /vincular 123456');
      return;
    }

    const telegramUserId = senderId(ctx);
    try {
      // Código de 6 dígitos: sem teto de tentativas dava pra chutar o de outra conta.
      await this.rateLimit?.consume(`vincular:tg:${telegramUserId}`, TELEGRAM_LINK_LIMIT);
      await this.usersService.confirmTelegramLink(args[0], telegramUserId, ctx.from?.username ?? null);
      await ctx.reply('✅ Conta vinculada com sucesso!');
    } catch (error) {
      if (error instanceof BadRequestException) {
        await ctx.reply('❌ Erro: ' + error.message);
        return;
      }
      if (error instanceof RateLimitedException) {
        await ctx.reply(`⏳ ${(error.getResponse() as { message: string }).message}`);
        return;
      }
      this.logger.error(...errorArgs('Erro ao confirmar vinculação', error));
      await ctx.reply('❌ Erro ao processar solicitação. Tente mais tarde.');
    }
  }
}

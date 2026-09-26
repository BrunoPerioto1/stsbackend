import { Inject, Injectable, Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { TELEGRAM_BOT } from './telegram-bot.provider';
import { UsersService } from '../users/users.service';
import { unlinkedInstructions } from './messages.const';
import { accessBlock, billingPayLine, pixKeyboard } from '../users/access';
import { errorArgs } from '../common/utils/log';

// Curto o bastante pra um convite esquecido no chat não virar porta aberta. E,
// como o link pede aprovação, quem não pagou esbarra no bot mesmo com ele na mão.
const INVITE_TTL_SECONDS = 24 * 60 * 60;

type JoinRequest = {
  chat: { id: number };
  from: { id: number };
  user_chat_id: number;
};

const spDate = (d: Date) =>
  new Date(d).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
  });

// O Telegram não esconde mensagem de quem é membro: o único jeito de quem não
// pagou deixar de ler o grupo Tips é estar fora dele. Esta classe é a porta —
// entra por pedido (o bot aprova só vinculado e em dia), sai pelo painel (ban,
// senão volta pelo link que já tem) e volta com convite quando o acesso é
// liberado. Pressupõe o bot admin do grupo com "Banir usuários" e "Convidar
// usuários via link".
@Injectable()
export class TipsGroupService {
  private readonly logger = new Logger(TipsGroupService.name);

  private readonly chatId: number | null;

  constructor(
    @Inject(TELEGRAM_BOT) private readonly bot: Telegraf,
    private readonly usersService: UsersService,
  ) {
    const chatId = Number(process.env.TIPS_GROUP_CHAT_ID);
    this.chatId = Number.isFinite(chatId) && chatId !== 0 ? chatId : null;
    if (!this.chatId) {
      this.logger.warn(
        '⚠️  TIPS_GROUP_CHAT_ID não definido — fan-out e controle de entrada do grupo Tips ficam desativados.',
      );
    }
  }

  get configured(): boolean {
    return this.chatId !== null;
  }

  isTipsGroup(chatId: number): boolean {
    return this.chatId !== null && chatId === this.chatId;
  }

  // Só manda tip pra quem ainda está no grupo Tips — evita continuar mandando
  // DM pra quem já vinculou a conta um dia mas saiu do grupo depois.
  async isMember(telegramUserId: number): Promise<boolean> {
    if (!this.chatId) return true;
    try {
      const member = await this.bot.telegram.getChatMember(
        this.chatId,
        telegramUserId,
      );
      return member.status !== 'left' && member.status !== 'kicked';
    } catch (err) {
      this.logger.error(...errorArgs(`⚠️ Não foi possível checar membro do grupo Tips (telegramUserId=${telegramUserId})`, err));
      return false;
    }
  }

  // Ban sem prazo: dura até o readmit. O aviso é cortesia — se não sair (a
  // pessoa bloqueou o bot), a remoção continua valendo. `userId` (da conta)
  // deixa o aviso levar o PIX copia-e-cola dela.
  async remove(telegramUserId: number, userId?: number): Promise<void> {
    if (!this.chatId) throw new Error('TIPS_GROUP_CHAT_ID não definido');
    await this.bot.telegram.banChatMember(this.chatId, telegramUserId);

    await this.bot.telegram
      .sendMessage(
        telegramUserId,
        `🔒 Seu acesso venceu e você saiu do grupo de Tips.\n\n${billingPayLine(userId)}`,
        { parse_mode: 'Markdown', reply_markup: pixKeyboard(userId) },
      )
      .catch((error) =>
        this.logger.error(...errorArgs(`⚠️ Aviso de saída do grupo Tips falhou (telegramUserId=${telegramUserId})`, error)),
      );
  }

  /**
   * Acesso liberado: quem está fora do grupo ganha um convite no privado
   * (e perde o ban, se tiver). Quem continua lá dentro não recebe nada.
   * Chamar depois de gravar o novo vencimento — o convite pede aprovação, e
   * o bot aprova lendo o banco.
   *
   * null = nada a fazer; 'failed' = o Telegram recusou alguma etapa (o erro
   * vai pro log, e repetir é seguro).
   */
  async readmit(
    telegramUserId: number,
    accessUntil: Date | null,
  ): Promise<'sent' | 'failed' | null> {
    if (!this.chatId) return null;
    try {
      const member = await this.bot.telegram.getChatMember(
        this.chatId,
        telegramUserId,
      );
      const inside =
        member.status === 'creator' ||
        member.status === 'administrator' ||
        member.status === 'member' ||
        (member.status === 'restricted' && member.is_member);
      if (inside) return null;

      if (member.status === 'kicked') {
        await this.bot.telegram.unbanChatMember(this.chatId, telegramUserId, {
          only_if_banned: true,
        });
      }
      const link = await this.bot.telegram.createChatInviteLink(this.chatId, {
        creates_join_request: true,
        expire_date: Math.floor(Date.now() / 1000) + INVITE_TTL_SECONDS,
      });
      const until = accessUntil ? ` até ${spDate(accessUntil)}` : '';
      await this.bot.telegram.sendMessage(
        telegramUserId,
        `✅ Acesso liberado${until}.\n\nPra voltar ao grupo de Tips, entre por este link (vale 24h):\n${link.invite_link}`,
      );
      return 'sent';
    } catch (error) {
      this.logger.error(...errorArgs(`⚠️ Convite do grupo Tips falhou (telegramUserId=${telegramUserId})`, error));
      return 'failed';
    }
  }

  // Entrada só por pedido: o bot aprova quem é vinculado e está em dia, e
  // recusa o resto dizendo o que falta.
  async handleJoinRequest(request: JoinRequest): Promise<void> {
    if (!this.chatId || !this.isTipsGroup(request.chat.id)) return;
    const telegramUserId = request.from.id;

    let user: Awaited<ReturnType<UsersService['findByTelegramUserId']>>;
    try {
      user = await this.usersService.findByTelegramUserId(telegramUserId);
    } catch (error) {
      // Banco fora: o pedido fica pendente e um admin decide pelo Telegram.
      this.logger.error(...errorArgs('Erro ao conferir pedido de entrada no grupo Tips', error));
      return;
    }

    const block = user ? accessBlock(user) : 'unlinked';
    try {
      if (!block) {
        await this.bot.telegram.approveChatJoinRequest(
          this.chatId,
          telegramUserId,
        );
        return;
      }

      // O Telegram só deixa o bot falar com quem pediu enquanto o pedido está
      // aberto: a explicação vai antes da recusa.
      await this.explainRefusal(request.user_chat_id, block, user?.accessUntil, user?.id)
        .catch((error) =>
          this.logger.error(...errorArgs(`⚠️ Explicação da recusa no grupo Tips falhou (telegramUserId=${telegramUserId})`, error)),
        );
      await this.bot.telegram.declineChatJoinRequest(
        this.chatId,
        telegramUserId,
      );
    } catch (error) {
      this.logger.error(...errorArgs(`⚠️ Pedido de entrada no grupo Tips não resolvido (telegramUserId=${telegramUserId})`, error));
    }
  }

  private explainRefusal(
    chatId: number,
    block: 'unlinked' | 'inactive' | 'expired',
    accessUntil: Date | null | undefined,
    userId?: number,
  ) {
    if (block === 'unlinked') {
      return this.bot.telegram.sendMessage(
        chatId,
        `${unlinkedInstructions()}\n\nO grupo de Tips é só pra contas vinculadas e em dia. Depois de vincular, peça pra entrar de novo pelo mesmo link.`,
      );
    }
    if (block === 'inactive') {
      return this.bot.telegram.sendMessage(
        chatId,
        '🚫 Sua conta está desativada. Fale com o administrador.',
      );
    }
    return this.bot.telegram.sendMessage(
      chatId,
      `🔒 Seu acesso venceu em ${spDate(accessUntil as Date)}, então o pedido pra entrar no grupo de Tips foi recusado.\n\n${billingPayLine(userId)}`,
      { parse_mode: 'Markdown', reply_markup: pixKeyboard(userId) },
    );
  }
}

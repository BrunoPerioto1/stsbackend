import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import type { MessageEntity } from 'telegraf/types';
import { TELEGRAM_BOT } from './telegram-bot.provider';
import { BotCommandsService } from './bot-commands.service';
import { BetTextService, type BetPhotoMessage } from './bet-text.service';
import { TipFanoutService } from './tip-fanout.service';
import { TelegramCallbackService } from './telegram-callback.service';
import { TipsGroupService } from './tips-group.service';
import { EDIT_PROMPT_HEADER_RE } from './messages.const';
import { parseBetLocal } from './utils/tip-extractors.util';

// Bootstrap do bot: conecta cada evento do Telegraf no
// serviço responsável. A lógica de verdade (comandos, fan-out de tips,
// parsing/criação de aposta, callback_query) vive nos serviços injetados
// aqui — este arquivo só existe pra deixar visível, num lugar só, o que o
// bot escuta e pra onde cada coisa vai.
@Injectable()
export class TelegramService implements OnModuleInit {
  constructor(
    @Inject(TELEGRAM_BOT) public bot: Telegraf,
    private readonly botCommands: BotCommandsService,
    private readonly betTextService: BetTextService,
    private readonly tipFanoutService: TipFanoutService,
    private readonly callbackService: TelegramCallbackService,
    private readonly tipsGroup: TipsGroupService,
  ) {}

  onModuleInit() {
    this.registerHandlers();
  }

  private registerHandlers() {
    // Só conversa privada: no grupo de Tips quem fala é o bot de repasse.
    this.bot.use(async (ctx, next) => {
      if (ctx.chat?.type === 'private') this.botCommands.syncUsername(ctx.from);
      if (await this.botCommands.blockIfNoAccess(ctx)) return;
      return next();
    });

    this.bot.command('start', (ctx) => this.botCommands.handleStart(ctx));
    this.bot.command('pendentes', (ctx) =>
      this.botCommands.handlePendentes(ctx),
    );
    this.bot.command('site', (ctx) => this.botCommands.handleSite(ctx));
    this.bot.command('filtro', (ctx) => this.botCommands.handleFiltro(ctx));
    this.bot.command('stake', (ctx) => this.botCommands.handleStake(ctx));
    this.bot.command('vincular', (ctx) => this.botCommands.handleVincular(ctx));

    // DMs livres: processa como aposta direto (fluxo original).
    // Mensagens do grupo Tips: só chegam aqui porque o betbpbot (repasse) tem
    // Bot-to-Bot Communication Mode ativado no BotFather (+ admin do grupo +
    // Group Privacy off) — sem isso o Telegram não entrega updates de
    // mensagens postadas por outro bot. Privacy off também significa que o
    // bot vê mensagens de humanos no grupo — por isso só processa como tip
    // se quem mandou for um bot (evita alguém digitando "%5" ser confundido
    // com uma tip de verdade).
    this.bot.on('message', async (ctx) => {
      // A mensagem vem como união de todos os tipos; aqui só importam estes
      // campos, e cada ramo abaixo confere o que usa.
      const msg = ctx.message as {
        message_id: number;
        date: number;
        text?: string;
        caption?: string;
        photo?: BetPhotoMessage['photo'];
        entities?: MessageEntity[];
        caption_entities?: MessageEntity[];
        reply_to_message?: { text?: string };
      };

      if (this.tipFanoutService.isTipsGroup(ctx.chat.id)) {
        if (!ctx.from?.is_bot) return;
        const text = msg.text ?? msg.caption;
        const hasMedia = !!msg.photo;
        const entities = msg.entities ?? msg.caption_entities;
        if (text)
          await this.tipFanoutService.handleTipsMessage(
            text,
            ctx.chat.id,
            msg.message_id,
            hasMedia,
            entities,
          );
        return;
      }

      if ('voice' in ctx.message || 'audio' in ctx.message) {
        await this.betTextService.handleBetAudio(ctx, ctx.message);
        return;
      }

      // Resposta a um prompt de "✏️ Editar" (força reply no Telegram)?
      const replyToText = msg.reply_to_message?.text;
      const headerMatch = replyToText?.match(EDIT_PROMPT_HEADER_RE);
      if (headerMatch && replyToText) {
        await this.betTextService.handleEditReply(
          ctx,
          replyToText,
          headerMatch,
          msg.text ?? '',
        );
        return;
      }

      // Print de bilhete: só entra no fluxo de visão quando a legenda NÃO é
      // um card de aposta completo — encaminhar uma tip com mídia + legenda
      // inteira continua caindo no parser de texto de sempre.
      if (msg.photo && !parseBetLocal(msg.caption ?? '')) {
        await this.betTextService.handleBetPhoto(ctx, { ...msg, photo: msg.photo });
        return;
      }

      const userMessage = msg.text ?? msg.caption;
      if (!userMessage) return;

      await this.betTextService.processBetText(ctx, userMessage);
    });

    // Cliques nos botões da cópia individual recebida em DM (Enviar ao
    // Planilhador, Editar, Aposta Caiu) e da lista compacta do /pendentes.
    this.bot.on('callback_query', (ctx) => this.callbackService.handle(ctx));

    // Pedido de entrada no grupo Tips (link com "aprovação do admin"): o bot
    // aprova só vinculado e em dia. O middleware de acesso lá em cima deixa
    // passar — o update vem do grupo, não de conversa privada.
    this.bot.on('chat_join_request', (ctx) =>
      this.tipsGroup.handleJoinRequest(ctx.chatJoinRequest),
    );
  }
}

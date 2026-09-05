import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import { TELEGRAM_BOT } from './telegram-bot.provider';
import { BotCommandsService } from './bot-commands.service';
import { BetTextService } from './bet-text.service';
import { TipFanoutService } from './tip-fanout.service';
import { TelegramCallbackService } from './telegram-callback.service';
import { EDIT_PROMPT_HEADER_RE } from './messages.const';
import { parseBetLocal } from './utils/tip-extractors.util';

dotenv.config();

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
  ) {}

  onModuleInit() {
    this.registerHandlers();
  }

  private registerHandlers() {
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
      const msg = ctx.message as any;

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

      // Resposta a um prompt de "✏️ Editar" (força reply no Telegram)?
      const replyToText = msg.reply_to_message?.text as string | undefined;
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
        await this.betTextService.handleBetPhoto(ctx, msg);
        return;
      }

      const userMessage = msg.text ?? msg.caption;
      if (!userMessage) return;

      await this.betTextService.processBetText(ctx, userMessage);
    });

    // Cliques nos botões da cópia individual recebida em DM (Enviar ao
    // Planilhador, Editar, Aposta Caiu) e da lista compacta do /pendentes.
    this.bot.on('callback_query', (ctx) => this.callbackService.handle(ctx));
  }
}

import { Injectable, OnModuleInit } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import { GrokService } from './grok.service';
import { ApostaService } from '../bet/bet.service';
import { CreateBetDto } from '../bet/dto/bet.dto';
import { UsersService } from '../users/users.service';
import { HouseService } from '../house/house.service';
import { TipsService } from '../tips/tips.service';
import {
  EDIT_PROMPT_HEADER_RE,
  EDIT_PROMPT_INSTRUCTIONS,
  TIP_BOILERPLATE_PATTERNS,
  UNLINKED_INSTRUCTIONS,
  escapeHtml,
  extractGameFromText,
  extractHouseFromText,
  extractLimitFromText,
  extractLinkFromText,
  extractMarketFromText,
  extractOddFromText,
  extractPercent,
  isAvisoMessage,
  parseCallbackAction,
  stripBoilerplateParagraphs,
} from './tip-parsing.util';

dotenv.config();

@Injectable()
export class TelegramService implements OnModuleInit {
  public bot: Telegraf;
  private readonly tipsGroupChatId: number | null;

  constructor(
    private readonly grokService: GrokService,
    private readonly apostaService: ApostaService,
    private readonly usersService: UsersService,
    private readonly houseService: HouseService,
    private readonly tipsService: TipsService,
  ) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('❌ TELEGRAM_BOT_TOKEN não definido no .env');

    this.bot = new Telegraf(token);

    const tipsGroupChatId = Number(process.env.TIPS_GROUP_CHAT_ID);
    this.tipsGroupChatId = Number.isFinite(tipsGroupChatId) && tipsGroupChatId !== 0 ? tipsGroupChatId : null;
    if (!this.tipsGroupChatId) {
      console.warn('⚠️  TIPS_GROUP_CHAT_ID não definido — o fan-out multiusuário do grupo Tips ficará desativado.');
    }
  }

  async onModuleInit() {
    this.registerCommands();

    const url = `${process.env.APP_URL}/telegram/${process.env.TELEGRAM_BOT_TOKEN}`;
    try {
      await this.bot.telegram.setWebhook(url);
      console.log(`🤖 Telegram bot iniciado em webhook: ${url}`);
    } catch (error) {
      console.error(
        `⚠️  Não foi possível registrar o webhook do Telegram (${url}). O bot ficará indisponível, mas o resto da API continua rodando.`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  private registerCommands() {
    // Comando /start
    this.bot.command('start', async (ctx) => {
      await ctx.reply(
        '👋 Bem-vindo!\n\n' +
          '1️⃣ Vincule sua conta: faça login em https://stsfront.vercel.app/login → Perfil → "Vincular Telegram", copie o código e envie /vincular SEU_CODIGO\n' +
          '2️⃣ Defina sua banca: /stake VALOR\n' +
          '3️⃣ (Opcional) Defina o filtro de porcentagem mínima das tips que você quer receber: /filtro 1.5\n' +
          '   Use /filtro off para remover o filtro e receber todas as tips.\n\n' +
          'Depois disso, as apostas do grupo Tips que baterem seu filtro chegam aqui, com um botão para planilhar.\n\n' +
          '📋 Use /pendentes a qualquer momento pra ver quais tips ainda faltam planilhar.',
      );
    });

    // Comando /pendentes: resumo do que ainda falta planilhar (ou marcar
    // como aposta caiu), sem limite de data — uma tip só sai da lista quando
    // você resolve ela, senão ficaria perdida pra sempre se passasse batido
    // no dia em que chegou.
    this.bot.command('pendentes', async (ctx) => {
      try {
        const user = await this.usersService.findByTelegramUserId(ctx.from.id);
        if (!user) {
          await ctx.reply(UNLINKED_INSTRUCTIONS);
          return;
        }
        const { text, keyboard } = await this.buildPendentesMessage(user);
        await ctx.reply(text, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          reply_markup: keyboard,
        });
      } catch (err) {
        console.error('❌ Erro ao buscar pendentes:', err);
        await ctx.reply('❌ Erro ao buscar tips pendentes. Tente novamente.');
      }
    });

    // Comando /filtro
    this.bot.command('filtro', async (ctx) => {
      const args = ctx.message.text.split(' ');
      const telegramUserId = ctx.from.id;

      try {
        const user = await this.usersService.findByTelegramUserId(telegramUserId);
        if (!user) {
          await ctx.reply(UNLINKED_INSTRUCTIONS);
          return;
        }

        if (args.length !== 2 || args[1].toLowerCase() === 'off') {
          if (args.length === 2 && args[1].toLowerCase() === 'off') {
            await this.usersService.setMinPercentFilter(telegramUserId, null);
            await ctx.reply('✅ Filtro removido. Você vai receber todas as tips do grupo.');
            return;
          }
          await ctx.reply('❌ Formato incorreto. Use: /filtro VALOR (ex.: /filtro 1.5) ou /filtro off');
          return;
        }

        const value = Number(args[1].replace(',', '.'));
        if (!Number.isFinite(value) || value < 0) {
          await ctx.reply('❌ Valor inválido. Informe um número maior ou igual a zero.');
          return;
        }

        await this.usersService.setMinPercentFilter(telegramUserId, value);
        await ctx.reply(`✅ Filtro definido: só chegam tips com porcentagem >= ${value}%`);
      } catch (error) {
        console.error('Erro ao atualizar filtro:', error);
        await ctx.reply('❌ Erro ao atualizar seu filtro. Tente novamente.');
      }
    });

    // Comando /stake
    this.bot.command('stake', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length !== 2) {
        await ctx.reply(
          '❌ Formato incorreto. Use: /stake VALOR\nExemplo: /stake 2000',
        );
        return;
      }

      const value = Number(args[1].replace(/[.,]/g, ''));
      if (!Number.isFinite(value) || value <= 0) {
        await ctx.reply('❌ Valor inválido. Informe um número maior que zero.');
        return;
      }

      try {
        const user = await this.usersService.findByTelegramUserId(ctx.from.id);
        if (!user) {
          await ctx.reply(UNLINKED_INSTRUCTIONS);
          return;
        }

        await this.usersService.updateUserStake(user.id, value);

        await ctx.reply(
          `✅ Banca definida: R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        );
      } catch (error) {
        console.error('Erro ao atualizar stake:', error);
        await ctx.reply('❌ Erro ao atualizar sua banca. Tente novamente.');
      }
    });

    // Comando /vincular
    this.bot.command('vincular', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length !== 2) {
        await ctx.reply(
          '❌ Formato incorreto. Use: /vincular SEU_CODIGO',
        );
        return;
      }

      const code = args[1];
      const telegramUserId = ctx.from.id;

      try {
        const url = `${process.env.API_URL || 'http://localhost:4000'}/auth/link-telegram/confirm`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, telegramUserId }),
        });

        const result: any = await response.json();

        if (result.success) {
          await ctx.reply('✅ Conta vinculada com sucesso!');
        } else {
          await ctx.reply('❌ Erro: ' + result.message);
        }
      } catch (error) {
        console.error('Erro ao confirmar vinculação:', error);
        await ctx.reply('❌ Erro ao processar solicitação. Tente mais tarde.');
      }
    });

    // DMs livres: processa como aposta direto (fluxo original).
    // Mensagens do grupo Tips: só chegam aqui porque o betbpbot (repasse) tem
    // Bot-to-Bot Communication Mode ativado no BotFather (+ admin do grupo +
    // Group Privacy off) — sem isso o Telegram não entrega updates de
    // mensagens postadas por outro bot. Privacy off também significa que o
    // bot vê mensagens de humanos no grupo — por isso só processa como tip
    // se quem mandou for um bot (evita alguém digitando "%5" ser confundido
    // com uma tip de verdade).
    this.bot.on('message', async (ctx) => {
      if (this.tipsGroupChatId && ctx.chat.id === this.tipsGroupChatId) {
        if (!ctx.from?.is_bot) return;
        const msg = ctx.message as any;
        const text = msg.text ?? msg.caption;
        const hasMedia = !!msg.photo;
        const entities = msg.entities ?? msg.caption_entities;
        if (text) await this.handleTipsMessage(text, ctx.chat.id, msg.message_id, hasMedia, entities);
        return;
      }

      const msg = ctx.message as any;

      // Resposta a um prompt de "✏️ Editar" (força reply no Telegram)?
      const replyToText = msg.reply_to_message?.text as string | undefined;
      const headerMatch = replyToText?.match(EDIT_PROMPT_HEADER_RE);
      if (headerMatch && replyToText) {
        await this.handleEditReply(ctx, replyToText, headerMatch, msg.text ?? '');
        return;
      }

      const userMessage = msg.text ?? msg.caption;
      if (!userMessage) return;

      await this.processBetText(ctx, userMessage);
    });

    // Cliques nos botões da cópia individual recebida em DM: Enviar ao
    // Planilhador, Editar e Aposta Caiu — cada um age só na mensagem de
    // quem clicou.
    this.bot.on('callback_query', async (ctx) => {
      const query = ctx.callbackQuery as any;
      const msg = query.message;
      const text: string | undefined = msg?.text ?? msg?.caption;
      const isMedia = !!msg?.photo;
      const { action, args } = parseCallbackAction(query.data as string);
      const tipId = args[0] ?? null;

      if (action === 'noop') {
        await ctx.answerCbQuery();
        return;
      }

      if (action === 'planilhar') {
        if (!text) {
          await ctx.answerCbQuery('❌ Não consegui ler o texto da mensagem.');
          return;
        }
        try {
          await this.processBetText(ctx, text, msg.message_id, tipId ?? undefined);
          const novoTexto = `✅ PLANILHADO\n\n${text}`;
          const doneKeyboard = { inline_keyboard: [[{ text: '✅ Planilhado', callback_data: 'done' }]] };
          if (isMedia) await ctx.editMessageCaption(novoTexto, { reply_markup: doneKeyboard });
          else await ctx.editMessageText(novoTexto, { reply_markup: doneKeyboard });
          await ctx.answerCbQuery('✅ Planilhado!');
        } catch (err) {
          console.error('❌ Erro ao planilhar via callback:', err);
          await ctx.answerCbQuery('❌ Erro ao planilhar. Veja o chat para detalhes.');
        }
        return;
      }

      if (action === 'editar') {
        if (!text) {
          await ctx.answerCbQuery('❌ Não consegui ler o texto da mensagem.');
          return;
        }
        const currentOdd = extractOddFromText(text);
        const currentLimit = extractLimitFromText(text);
        const currentHouse = extractHouseFromText(text);
        const header = `✏️ Editar aposta #${msg.message_id}|${isMedia ? 'p' : 't'}|${tipId ?? ''}`;
        const preamble = `${header}\n🏷 Odd atual: ${currentOdd ?? '?'}\n🚦 Limite atual: ${currentLimit ?? '?'}\n🏠 Casa atual: ${currentHouse ?? '?'}\n${EDIT_PROMPT_INSTRUCTIONS}\n\n`;
        await ctx.answerCbQuery();
        try {
          await ctx.reply(`${preamble}<blockquote expandable>${escapeHtml(text)}</blockquote>`, {
            parse_mode: 'HTML',
            reply_markup: { force_reply: true },
            link_preview_options: { is_disabled: true },
          });
        } catch (err) {
          console.error('⚠️ Falha ao mandar prompt de edição com blockquote, caindo pra texto simples:', err);
          await ctx.reply(`${preamble}${text}`, {
            reply_markup: { force_reply: true },
            link_preview_options: { is_disabled: true },
          });
        }
        return;
      }

      if (action === 'aposta_caiu') {
        if (!text) {
          await ctx.answerCbQuery('❌ Não consegui ler o texto da mensagem.');
          return;
        }
        if (text.startsWith('❌ APOSTA CAIU')) {
          await ctx.answerCbQuery('Já marcado.');
          return;
        }
        const novoTexto = `❌ APOSTA CAIU\n\n${text}`;
        const voltarData = tipId !== null ? `voltar:${tipId}` : 'voltar';
        try {
          if (isMedia) await ctx.editMessageCaption(novoTexto, { reply_markup: { inline_keyboard: [[{ text: '↩️ Voltar', callback_data: voltarData }]] } });
          else await ctx.editMessageText(novoTexto, { reply_markup: { inline_keyboard: [[{ text: '↩️ Voltar', callback_data: voltarData }]] } });
          if (tipId !== null) {
            const user = await this.usersService.findByTelegramUserId(ctx.from.id);
            if (user) await this.tipsService.dismissTip(tipId, user.id);
          }
          await ctx.answerCbQuery('❌ Marcado como aposta caiu!');
        } catch (err) {
          console.error('❌ Erro ao marcar aposta caiu:', err);
          await ctx.answerCbQuery('❌ Erro ao marcar.');
        }
        return;
      }

      if (action === 'voltar') {
        if (!text) {
          await ctx.answerCbQuery();
          return;
        }
        const restaurado = text.replace(/^❌ APOSTA CAIU\n\n/, '');
        try {
          if (isMedia) await ctx.editMessageCaption(restaurado, { reply_markup: this.tipsCopyKeyboard(tipId ?? undefined) });
          else await ctx.editMessageText(restaurado, { reply_markup: this.tipsCopyKeyboard(tipId ?? undefined) });
          if (tipId !== null) {
            const user = await this.usersService.findByTelegramUserId(ctx.from.id);
            if (user) await this.tipsService.undismissTip(tipId, user.id);
          }
          await ctx.answerCbQuery('↩️ Voltando');
        } catch (err) {
          console.error('❌ Erro ao voltar:', err);
          await ctx.answerCbQuery('❌ Erro ao voltar.');
        }
        return;
      }

      // Paginação da lista do /pendentes: só troca de página, sem mexer em
      // nenhuma tip.
      if (action === 'lista_pagina') {
        const page = args[0] ?? 0;
        const user = await this.usersService.findByTelegramUserId(ctx.from.id);
        if (!user) {
          await ctx.answerCbQuery('❌ Conta não vinculada.');
          return;
        }
        try {
          const { text: summaryText, keyboard } = await this.buildPendentesMessage(user, page);
          await ctx.editMessageText(summaryText, {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
            reply_markup: keyboard,
          });
          await ctx.answerCbQuery();
        } catch (err) {
          console.error('❌ Erro ao trocar página de pendentes:', err);
          await ctx.answerCbQuery('❌ Erro ao trocar página.');
        }
        return;
      }

      // Botões da lista compacta do /pendentes — cada linha da lista tem seu
      // próprio Planilhar/Caiu/Editar (com a página atual embutida em
      // args[1], pra continuar na mesma página depois de resolver um item),
      // e resolver um item atualiza a própria mensagem-lista em vez de gerar
      // mensagem nova (é isso que evita poluir o chat de novo).
      if (action === 'lista_planilhar' || action === 'lista_caiu' || action === 'lista_editar') {
        if (tipId === null) {
          await ctx.answerCbQuery('❌ Referência inválida.');
          return;
        }
        const page = args[1] ?? 0;
        const user = await this.usersService.findByTelegramUserId(ctx.from.id);
        if (!user) {
          await ctx.answerCbQuery('❌ Conta não vinculada.');
          return;
        }

        if (action === 'lista_editar') {
          const sent = await this.resendTipCard(user, tipId);
          await ctx.answerCbQuery(sent ? '📤 Reenviado! Edita por lá.' : '❌ Tip não encontrada.');
          return;
        }

        if (action === 'lista_caiu') {
          await this.tipsService.dismissTip(tipId, user.id);
          await ctx.answerCbQuery('❌ Marcado como caiu.');
        } else {
          const tip = await this.tipsService.findById(tipId);
          if (!tip) {
            await ctx.answerCbQuery('❌ Tip não encontrada.');
            return;
          }
          try {
            await this.processBetText(ctx, tip.text, undefined, tipId);
            await ctx.answerCbQuery('✅ Planilhado!');
          } catch {
            await ctx.answerCbQuery('❌ Erro ao planilhar. Veja a mensagem no chat.');
            return;
          }
        }

        try {
          const { text: summaryText, keyboard } = await this.buildPendentesMessage(user, page);
          await ctx.editMessageText(summaryText, {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
            reply_markup: keyboard,
          });
        } catch (err) {
          console.error('❌ Erro ao atualizar lista de pendentes:', err);
        }
        return;
      }
    });
  }

  private tipsCopyKeyboard(tipId?: number) {
    const suffix = tipId !== undefined ? `:${tipId}` : '';
    return {
      inline_keyboard: [
        [{ text: '📊 Enviar ao Planilhador', callback_data: `planilhar${suffix}` }],
        [{ text: '✏️ Editar', callback_data: `editar${suffix}` }, { text: '❌ Aposta Caiu', callback_data: `aposta_caiu${suffix}` }],
      ],
    };
  }

  private static readonly PENDENTES_PAGE_SIZE = 2;

  // Resumo pro /pendentes: total de tips relevantes pro filtro do usuário,
  // quantas já viraram aposta, quantas foram marcadas como caiu, e a lista
  // (agrupada por dia, paginada) das que ainda não têm nenhuma das duas
  // coisas — sem paginação isso vira uma parede de botões quando acumula
  // muita pendente.
  private async buildPendentesMessage(user: { id: number; minPercentFilter?: number | null }, page = 0) {
    const minPercentFilter = user.minPercentFilter != null ? Number(user.minPercentFilter) : null;
    const rows = await this.tipsService.getSummaryForUser(user.id, minPercentFilter);
    const planilhadas = rows.filter((r) => r.betId != null).length;
    const caiu = rows.filter((r) => r.betId == null && r.dismissalId != null).length;
    const pendentes = rows.filter((r) => r.betId == null && r.dismissalId == null);

    const header = `📊 Total: ${rows.length} | ✅ Planilhadas: ${planilhadas} | ❌ Caiu: ${caiu} | ⏳ Pendentes: ${pendentes.length}`;

    if (pendentes.length === 0) {
      return { text: `${header}\n\n🎉 Nada pendente!`, keyboard: undefined as any };
    }

    const pageSize = TelegramService.PENDENTES_PAGE_SIZE;
    const totalPages = Math.ceil(pendentes.length / pageSize);
    const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
    const pageItems = pendentes.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

    let listText = '';
    const keyboardRows: any[] = [];
    let lastDateLabel = '';
    for (const [i, tip] of pageItems.entries()) {
      const dateLabel = new Date(tip.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      if (dateLabel !== lastDateLabel) {
        listText += `\n<b>${dateLabel}</b>\n`;
        lastDateLabel = dateLabel;
      }
      const counter = currentPage * pageSize + i + 1;
      const time = new Date(tip.createdAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });
      const house = escapeHtml(extractHouseFromText(tip.text) ?? '?');
      const game = escapeHtml(extractGameFromText(tip.text) ?? '?');
      const market = extractMarketFromText(tip.text);
      const odd = extractOddFromText(tip.text);
      const link = extractLinkFromText(tip.text);
      const percentLabel = tip.percent !== null ? ` · ${Number(tip.percent).toFixed(2).replace('.', ',')}%` : '';
      const oddLabel = odd !== null ? ` · 🏷 ${odd.toFixed(2)}` : '';
      listText += `${counter}. ${time} · ${house} · ${game}${oddLabel}${percentLabel}\n`;
      if (market) listText += `   📌 ${escapeHtml(market)}\n`;
      // Link como texto curto clicável (não a URL crua) — evita poluir a
      // linha, e o link_preview_options: is_disabled no envio corta o card
      // de prévia gigante que o Telegram gera pra URL solta no texto.
      if (link) listText += `   🔗 <a href="${escapeHtml(link)}">Ver aposta</a>\n`;
      keyboardRows.push([
        { text: '✅ Planilhar', callback_data: `lista_planilhar:${tip.id}:${currentPage}` },
        { text: '❌ Caiu', callback_data: `lista_caiu:${tip.id}:${currentPage}` },
        { text: '✏️ Editar', callback_data: `lista_editar:${tip.id}:${currentPage}` },
      ]);
    }

    if (totalPages > 1) {
      keyboardRows.push([
        currentPage > 0
          ? { text: '◀️ Anterior', callback_data: `lista_pagina:${currentPage - 1}` }
          : { text: ' ', callback_data: 'noop' },
        { text: `${currentPage + 1}/${totalPages}`, callback_data: 'noop' },
        currentPage < totalPages - 1
          ? { text: 'Próxima ▶️', callback_data: `lista_pagina:${currentPage + 1}` }
          : { text: ' ', callback_data: 'noop' },
      ]);
    }

    return { text: `${header}\n${listText}`.trimEnd(), keyboard: { inline_keyboard: keyboardRows } };
  }

  // Reenvia uma única tip (a pedido do botão "✏️ Editar" da lista) como o
  // card completo de sempre — reaproveita sendTipCopyToUser, então ganha o
  // mesmo Planilhar/Editar/Aposta Caiu que a tip teria tido na hora que
  // chegou no grupo.
  private async resendTipCard(user: { id: number; telegramUserId: number | null }, tipId: number): Promise<boolean> {
    const tip = await this.tipsService.findById(tipId);
    if (!tip) return false;

    const { text: baseText, entities: baseEntities } = stripBoilerplateParagraphs(
      tip.text,
      tip.entities ?? undefined,
      TIP_BOILERPLATE_PATTERNS,
    );
    const limit = extractLimitFromText(tip.text);
    await this.sendTipCopyToUser(user, tip, tip.chatId, tip.messageId, tip.hasMedia, baseText, baseEntities, tip.text, limit);
    return true;
  }

  // Resposta (reply) a um prompt de "✏️ Editar": extrai a odd/limite novos e
  // o texto original (embutido no próprio prompt) e edita só essa mensagem.
  private async handleEditReply(ctx: any, promptText: string, headerMatch: RegExpMatchArray, replyText: string) {
    const originalMessageId = Number(headerMatch[1]);
    const isMedia = headerMatch[2] === 'p';
    const tipId = headerMatch[3] ? Number(headerMatch[3]) : undefined;
    const sepIndex = promptText.indexOf('\n\n');
    const originalText = sepIndex >= 0 ? promptText.slice(sepIndex + 2) : '';
    if (!originalText) {
      await ctx.reply('❌ Não consegui recuperar o texto original. Clica em Editar de novo.');
      return;
    }

    const raw = replyText.trim();
    const lower = raw.toLowerCase();
    let novaOdd: number | null = null;
    let novoLimite: number | null = null;
    let novaCasa: string | null = null;

    if (lower.startsWith('casa')) {
      novaCasa = raw.slice(4).trim();
    } else if (lower.startsWith('odd')) {
      novaOdd = parseFloat(raw.slice(3).trim().replace(',', '.'));
    } else if (lower.startsWith('limite') || lower.startsWith('limit')) {
      novoLimite = parseFloat(raw.replace(/^limite|^limit/i, '').trim().replace(',', '.'));
    } else {
      const parts = raw.split(/\s+/);
      if (parts.length >= 2) {
        novaOdd = parseFloat(parts[0].replace(',', '.'));
        novoLimite = parseFloat(parts[1].replace(',', '.'));
      } else if (parts.length === 1 && parts[0]) {
        novaOdd = parseFloat(parts[0].replace(',', '.'));
      }
    }

    if (novaOdd === null && novoLimite === null && !novaCasa) {
      await ctx.reply(`❌ Não entendi. ${EDIT_PROMPT_INSTRUCTIONS}`);
      return;
    }
    if (novaOdd !== null && (!Number.isFinite(novaOdd) || novaOdd <= 1)) {
      await ctx.reply('❌ Odd inválida.');
      return;
    }
    if (novoLimite !== null && !Number.isFinite(novoLimite)) {
      await ctx.reply('❌ Limite inválido.');
      return;
    }
    if (novaCasa !== null && !novaCasa) {
      await ctx.reply('❌ Nome da casa inválido.');
      return;
    }

    let novoTexto = originalText;
    if (novaOdd !== null) {
      novoTexto = novoTexto.replace(/🏷\s*([\d]+(?:[.,][\d]+)?)/, `🏷 ${novaOdd.toFixed(2)}`);
    }
    if (novoLimite !== null) {
      novoTexto = novoTexto.replace(/(🚦[^\n]*R\$\s*)([\d.,]+)/, `$1${novoLimite.toFixed(2)}`);
    }
    if (novaCasa) {
      novoTexto = novoTexto.replace(/^🏠\s*.*$/m, `🏠 ${novaCasa}`);
    }

    try {
      if (isMedia) {
        await ctx.telegram.editMessageCaption(ctx.chat.id, originalMessageId, undefined, novoTexto, {
          reply_markup: this.tipsCopyKeyboard(tipId),
        });
      } else {
        await ctx.telegram.editMessageText(ctx.chat.id, originalMessageId, undefined, novoTexto, {
          reply_markup: this.tipsCopyKeyboard(tipId),
        });
      }
      await ctx.reply('✅ Aposta atualizada!', { reply_parameters: { message_id: originalMessageId } });
    } catch (err) {
      console.error('❌ Erro ao editar aposta individual:', err);
      await ctx.reply('❌ Erro ao atualizar. Tenta de novo.');
    }
  }

  // Fan-out: dado o texto de uma tip postada no grupo Tips (chatId/messageId
  // dessa mensagem), extrai a %, e manda uma cópia com botão próprio de
  // Planilhar para cada usuário vinculado cujo filtro de % é satisfeito.
  // Mensagens de SOBRECARGA/AVISO passam mesmo sem % (mas sem recomendação,
  // já que não há % pra converter pela banca do usuário). Quando há %, cada
  // cópia leva sua própria "Recomendação de aposta" (banca do usuário × % da
  // tip, limitada pelo 🚦/limite do texto), em negrito. `entities` são os
  // links/formatação da mensagem original (ex.: "Clique AQUI" → text_link) —
  // sempre reconstruímos o texto (tira boilerplate, acrescenta recomendação),
  // então as entidades precisam ser realinhadas junto — senão a cópia perde
  // todo link/formatação.
  private async handleTipsMessage(text: string, chatId: number, messageId: number, hasMedia: boolean, entities?: any[]) {
    const percent = extractPercent(text);
    const isAviso = isAvisoMessage(text);
    console.log(`📨 handleTipsMessage: percent=${percent} isAviso=${isAviso} hasMedia=${hasMedia}`);
    if (percent === null && !isAviso) return;

    const tip = await this.tipsService.recordTip({
      chatId,
      messageId,
      text,
      percent,
      isAviso,
      hasMedia,
      entities: entities ?? null,
    });

    const users = await this.usersService.getUsersForTipsFanout();
    const limit = extractLimitFromText(text);
    const { text: baseText, entities: baseEntities } = stripBoilerplateParagraphs(text, entities, TIP_BOILERPLATE_PATTERNS);

    for (const user of users) {
      if (percent !== null && user.minPercentFilter !== null && percent < Number(user.minPercentFilter)) continue;

      const stillMember = await this.isTipsGroupMember(user.telegramUserId as number);
      if (!stillMember) continue;

      await this.sendTipCopyToUser(user, tip, chatId, messageId, hasMedia, baseText, baseEntities, text, limit);
    }
  }

  // Manda a cópia individual de uma tip (com recomendação de aposta calculada
  // pra banca/filtro do usuário) — usado tanto pelo fan-out ao vivo quanto
  // pelo reenvio avulso de um item do /pendentes (resendTipCard). `tip` só
  // precisa de id e percent; texto/casa/odd sempre vêm recalculados a partir
  // de baseText/originalText, nunca de campos extras da tip.
  private async sendTipCopyToUser(
    user: { id: number; telegramUserId: number | null },
    tip: { id: number; percent: number | null },
    chatId: number,
    messageId: number,
    hasMedia: boolean,
    baseText: string,
    baseEntities: any,
    originalText: string,
    limit: number | null,
  ) {
    let outgoingText = baseText;
    let outgoingEntities: any = baseEntities;
    // NUMERIC do Postgres volta como string via pg — mesmo pra uma tip que
    // acabou de ser inserida com um number — então normaliza antes de fazer
    // conta com isso (division/toFixed em cima de string não estoura, mas
    // .toFixed(2) e comparações mais adiante esperam number de verdade).
    const percent = tip.percent !== null ? Number(tip.percent) : null;
    try {
      if (percent !== null) {
        const userStake = await this.usersService.getUserStake(user.id);
        let recommendedStake = (percent / 100) * userStake;
        if (limit !== null) recommendedStake = Math.min(recommendedStake, limit);

        const recommendationValue = recommendedStake.toFixed(2).replace('.', ',');
        const recommendationLine = `🎯 Recomendação de aposta: R$ ${recommendationValue}`;
        outgoingEntities = [
          ...(baseEntities ?? []),
          { type: 'bold', offset: baseText.length + 2, length: recommendationLine.length },
        ];

        const odd = extractOddFromText(originalText);
        if (odd !== null) {
          const lucroValue = (recommendedStake * odd - recommendedStake).toFixed(2).replace('.', ',');
          const lucroLine = `💰 Lucro potencial: R$ ${lucroValue}`;
          outgoingText = `${baseText}\n\n${recommendationLine}\n${lucroLine}`;
          outgoingEntities.push({
            type: 'bold',
            offset: baseText.length + 2 + recommendationLine.length + 1,
            length: lucroLine.length,
          });
        } else {
          outgoingText = `${baseText}\n\n${recommendationLine}`;
        }
        console.log(
          `🎯 Recomendação calculada (userId=${user.id}, telegramUserId=${user.telegramUserId}): banca=${userStake} percent=${percent} limit=${limit} -> R$${recommendationValue}`,
        );
      }

      if (hasMedia) {
        await this.bot.telegram.copyMessage(user.telegramUserId as number, chatId, messageId, {
          caption: outgoingText,
          caption_entities: outgoingEntities,
          reply_markup: this.tipsCopyKeyboard(tip.id),
        });
      } else {
        await this.bot.telegram.sendMessage(user.telegramUserId as number, outgoingText, {
          entities: outgoingEntities,
          reply_markup: this.tipsCopyKeyboard(tip.id),
        });
      }
    } catch (err) {
      console.error(`⚠️ Não foi possível enviar tip para o usuário (telegramUserId=${user.telegramUserId}):`, err);
    }
  }

  // Só manda tip pra quem ainda está no grupo Tips — evita continuar mandando
  // DM pra quem já vinculou a conta um dia mas saiu do grupo depois.
  private async isTipsGroupMember(telegramUserId: number): Promise<boolean> {
    if (!this.tipsGroupChatId) return true;
    try {
      const member = await this.bot.telegram.getChatMember(this.tipsGroupChatId, telegramUserId);
      return member.status !== 'left' && member.status !== 'kicked';
    } catch (err) {
      console.error(`⚠️ Não foi possível checar membro do grupo Tips (telegramUserId=${telegramUserId}):`, err);
      return false;
    }
  }

  // Parsing + criação da aposta. Reaproveitado tanto pelo texto livre em DM
  // quanto pelo clique em "Enviar ao Planilhador" na cópia individual do
  // grupo Tips. Quando vem de um clique (replyToMessageId presente), a
  // confirmação sai como resposta à própria tip, em vez de mensagem solta.
  private async processBetText(ctx: any, userMessage: string, replyToMessageId?: number, tipId?: number) {
    try {
      const resolvedHouseId = await this.grokService.resolveHouseId(userMessage);
      const jsonResult = await this.grokService.parseBetMessage(userMessage, resolvedHouseId);

      const houseId = Number(jsonResult.houseId);
      const odd = Number(jsonResult.odd);
      const game = String(jsonResult.game ?? '').trim();
      const market = String(jsonResult.market ?? '').trim();
      const sport = String(jsonResult.sport ?? '').trim();

      const percent = extractPercent(userMessage);
      const user = await this.usersService.findByTelegramUserId(ctx.from.id);
      if (!user) throw new Error('UNLINKED');

      const userStake = await this.usersService.getUserStake(user.id);
      let stake = percent !== null ? (percent / 100) * userStake : Number(jsonResult.stake);

      const limit = extractLimitFromText(userMessage);
      if (limit !== null) stake = Math.min(stake, limit);

      if (!Number.isFinite(houseId) || houseId <= 0) throw new Error('CASA_INVALIDA');
      if (!Number.isFinite(stake) || stake <= 0) throw new Error('stake inválida');
      if (!Number.isFinite(odd) || odd <= 1) throw new Error('odd inválida');
      if (!game) throw new Error('game vazio');
      if (!market) throw new Error('mercado vazio');
      if (!sport) throw new Error('esporte vazio');

      const apostaData: CreateBetDto = {
        userId: user.id,
        game,
        stake: Number(stake.toFixed(2)),
        odd,
        houseId,
        market,
        sport,
      };

      const aposta = await this.apostaService.createBet(apostaData, tipId);

      let houseName = 'N/A';
      try {
        const houses = await this.houseService.getAllHouses();
        const house = houses.find((h) => h.id === aposta.houseId);
        if (house) houseName = house.name;
      } catch (err) {
        console.error('Erro ao buscar casa:', err);
      }

      const horario = new Date(aposta.betTime).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });

      await ctx.reply(
        `✅ Aposta salva!\n\n🎮 Jogo: ${aposta.game}\n🕐 Horário: ${horario}\n💰 Stake: R$ ${aposta.stake}\n📈 Odd: ${aposta.odd}\n🏆 Mercado: ${aposta.market}\n⚽ Esporte: ${aposta.sport}\n🏢 Casa: ${houseName}`,
        replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : undefined,
      );
    } catch (err) {
      console.error('❌ Erro ao processar aposta:', err);
      const extra = replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : undefined;
      if ((err as Error).message === 'UNLINKED') {
        await ctx.reply(UNLINKED_INSTRUCTIONS, extra);
      } else if ((err as Error).message === 'CASA_INVALIDA') {
        await ctx.reply(
          '❌ Erro ao ler a casa de aposta. Por favor, remande a aposta aqui no chat trocando a casa por uma parecida.',
          extra,
        );
      } else {
        await ctx.reply(`❌ Erro ao processar aposta.\n${(err as Error).message}`, extra);
      }
      throw err;
    }
  }
}

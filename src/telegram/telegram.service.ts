import { Injectable, OnModuleInit } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import { GrokService } from './grok.service';
import { ApostaService } from '../bet/bet.service';
import { CreateBetDto } from '../bet/dto/bet.dto';
import { UsersService } from '../users/users.service';
import { HouseService } from '../house/house.service';
import {
  EDIT_PROMPT_HEADER_RE,
  EDIT_PROMPT_INSTRUCTIONS,
  TIP_BOILERPLATE_PATTERNS,
  UNLINKED_INSTRUCTIONS,
  escapeHtml,
  extractHouseFromText,
  extractLimitFromText,
  extractOddFromText,
  extractPercent,
  isAvisoMessage,
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
          'Depois disso, as apostas do grupo Tips que baterem seu filtro chegam aqui, com um botão para planilhar.',
      );
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
    // mensagens postadas por outro bot.
    this.bot.on('message', async (ctx) => {
      if (this.tipsGroupChatId && ctx.chat.id === this.tipsGroupChatId) {
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

      if (query.data === 'planilhar') {
        if (!text) {
          await ctx.answerCbQuery('❌ Não consegui ler o texto da mensagem.');
          return;
        }
        try {
          await this.processBetText(ctx, text, msg.message_id);
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

      if (query.data === 'editar') {
        if (!text) {
          await ctx.answerCbQuery('❌ Não consegui ler o texto da mensagem.');
          return;
        }
        const currentOdd = extractOddFromText(text);
        const currentLimit = extractLimitFromText(text);
        const currentHouse = extractHouseFromText(text);
        const header = `✏️ Editar aposta #${msg.message_id}|${isMedia ? 'p' : 't'}`;
        const preamble = `${header}\nOdd atual: ${currentOdd ?? '?'} · Limite atual: ${currentLimit ?? '?'} · Casa atual: ${currentHouse ?? '?'}\n${EDIT_PROMPT_INSTRUCTIONS}\n\n`;
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

      if (query.data === 'aposta_caiu') {
        if (!text) {
          await ctx.answerCbQuery('❌ Não consegui ler o texto da mensagem.');
          return;
        }
        if (text.startsWith('❌ APOSTA CAIU')) {
          await ctx.answerCbQuery('Já marcado.');
          return;
        }
        const novoTexto = `❌ APOSTA CAIU\n\n${text}`;
        try {
          if (isMedia) await ctx.editMessageCaption(novoTexto, { reply_markup: { inline_keyboard: [[{ text: '↩️ Voltar', callback_data: 'voltar' }]] } });
          else await ctx.editMessageText(novoTexto, { reply_markup: { inline_keyboard: [[{ text: '↩️ Voltar', callback_data: 'voltar' }]] } });
          await ctx.answerCbQuery('❌ Marcado como aposta caiu!');
        } catch (err) {
          console.error('❌ Erro ao marcar aposta caiu:', err);
          await ctx.answerCbQuery('❌ Erro ao marcar.');
        }
        return;
      }

      if (query.data === 'voltar') {
        if (!text) {
          await ctx.answerCbQuery();
          return;
        }
        const restaurado = text.replace(/^❌ APOSTA CAIU\n\n/, '');
        try {
          if (isMedia) await ctx.editMessageCaption(restaurado, { reply_markup: this.tipsCopyKeyboard() });
          else await ctx.editMessageText(restaurado, { reply_markup: this.tipsCopyKeyboard() });
          await ctx.answerCbQuery('↩️ Voltando');
        } catch (err) {
          console.error('❌ Erro ao voltar:', err);
          await ctx.answerCbQuery('❌ Erro ao voltar.');
        }
        return;
      }
    });
  }

  private tipsCopyKeyboard() {
    return {
      inline_keyboard: [
        [{ text: '📊 Enviar ao Planilhador', callback_data: 'planilhar' }],
        [{ text: '✏️ Editar', callback_data: 'editar' }, { text: '❌ Aposta Caiu', callback_data: 'aposta_caiu' }],
      ],
    };
  }

  // Resposta (reply) a um prompt de "✏️ Editar": extrai a odd/limite novos e
  // o texto original (embutido no próprio prompt) e edita só essa mensagem.
  private async handleEditReply(ctx: any, promptText: string, headerMatch: RegExpMatchArray, replyText: string) {
    const originalMessageId = Number(headerMatch[1]);
    const isMedia = headerMatch[2] === 'p';
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
          reply_markup: this.tipsCopyKeyboard(),
        });
      } else {
        await ctx.telegram.editMessageText(ctx.chat.id, originalMessageId, undefined, novoTexto, {
          reply_markup: this.tipsCopyKeyboard(),
        });
      }
      await ctx.reply('✅ Aposta atualizada!');
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

    const users = await this.usersService.getUsersForTipsFanout();
    const limit = extractLimitFromText(text);
    const { text: baseText, entities: baseEntities } = stripBoilerplateParagraphs(text, entities, TIP_BOILERPLATE_PATTERNS);

    for (const user of users) {
      if (percent !== null && user.minPercentFilter !== null && percent < Number(user.minPercentFilter)) continue;

      const stillMember = await this.isTipsGroupMember(user.telegramUserId as number);
      if (!stillMember) continue;

      let outgoingText = baseText;
      let outgoingEntities: any = baseEntities;
      try {
        if (percent !== null) {
          const userStake = await this.usersService.getUserStake(user.id);
          let recommendedStake = (percent / 100) * userStake;
          if (limit !== null) recommendedStake = Math.min(recommendedStake, limit);

          const recommendationValue = recommendedStake.toFixed(2).replace('.', ',');
          const recommendationLine = `🎯 Recomendação de aposta: R$ ${recommendationValue}`;
          outgoingText = `${baseText}\n\n${recommendationLine}`;
          outgoingEntities = [
            ...(baseEntities ?? []),
            { type: 'bold', offset: baseText.length + 2, length: recommendationLine.length },
          ];
          console.log(
            `🎯 Recomendação calculada (userId=${user.id}, telegramUserId=${user.telegramUserId}): banca=${userStake} percent=${percent} limit=${limit} -> R$${recommendationValue}`,
          );
        }

        if (hasMedia) {
          await this.bot.telegram.copyMessage(user.telegramUserId as number, chatId, messageId, {
            caption: outgoingText,
            caption_entities: outgoingEntities,
            reply_markup: this.tipsCopyKeyboard(),
          });
        } else {
          await this.bot.telegram.sendMessage(user.telegramUserId as number, outgoingText, {
            entities: outgoingEntities,
            reply_markup: this.tipsCopyKeyboard(),
          });
        }
      } catch (err) {
        console.error(`⚠️ Não foi possível enviar tip para o usuário (telegramUserId=${user.telegramUserId}):`, err);
      }
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
  private async processBetText(ctx: any, userMessage: string, replyToMessageId?: number) {
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

      const aposta = await this.apostaService.createBet(apostaData);

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
        `✅ Aposta salva!\n\n🎮 Jogo: ${aposta.game}\n🕐 Horário: ${horario}\n💰 Stake: R$ ${aposta.stake}\n📈 Odd: ${aposta.odd}\n🏆 Mercado: ${aposta.market}\n⚽ Esporte: ${aposta.sport}\n🏢 Casa: ${houseName}\n👤 Usuário: ${user.username}`,
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

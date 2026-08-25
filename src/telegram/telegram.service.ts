import { Injectable, OnModuleInit } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import { GrokService } from './grok.service';
import { ApostaService } from '../bet/bet.service';
import { CreateBetDto } from '../bet/dto/bet.dto';
import { UsersService } from '../users/users.service';
import { HouseService } from '../house/house.service';

dotenv.config();

function extractLimitFromText(text: string): number | null {
  if (!text) return null;
  const limitEmojiRegex = /🚦[^0-9]{0,15}([\d.,]+)/i;
  const wordsRegex = /(limite|limit|max|máximo)[^0-9]{0,15}([\d.,]+)/i;
  const m1 = text.match(limitEmojiRegex);
  const m2 = text.match(wordsRegex);
  const raw = (m1?.[1] || m2?.[2] || '').trim();
  if (!raw) return null;
  
 
  const normalized = raw.includes(',') 
    ? raw.replace(/\./g, '').replace(',', '.') // Caso brasileiro
    : raw; // Caso internacional
  
  const val = Number(normalized);
  console.log(`Limite extraído: "${raw}" -> normalizado: "${normalized}" -> valor: ${val}`);
  return Number.isFinite(val) && val > 0 ? val : null;
}

function extractOddFromText(text: string): number | null {
  if (!text) return null;
  const m = text.match(/🏷\s*([\d]+(?:[.,][\d]+)?)/);
  if (!m) return null;
  const val = Number(m[1].replace(',', '.'));
  return Number.isFinite(val) && val > 1 ? val : null;
}

// Cabeçalho do prompt de "Editar" — carrega o messageId + tipo (texto/mídia)
// direto no texto da mensagem, sem precisar de estado em memória (o processo
// roda em serverless, então nada garante que a mesma instância trate o clique
// em Editar e a resposta com a nova odd).
const EDIT_PROMPT_HEADER_RE = /^✏️ Editar aposta #(\d+)\|(t|p)\n/;
const EDIT_PROMPT_DELIMITER = '———\n';

const UNLINKED_INSTRUCTIONS =
  '❌ Sua conta não está vinculada.\n\n' +
  'Pra vincular:\n' +
  '1️⃣ Entre em https://stsfront.vercel.app/login e faça login\n' +
  '2️⃣ Vá em Perfil → clique em "Vincular Telegram"\n' +
  '3️⃣ Copie o código que aparecer\n' +
  '4️⃣ Volte aqui e envie: /vincular CODIGO';

function extractPercentAfterStopEmoji(text: string): number | null {
  if (!text) return null;

  const percentRegex = /🛑[^0-9]{0,15}(\d{1,3}(?:[.,]\d{1,2})?)\s*%?/i;
  const m = text.match(percentRegex);
  if (!m) return null;
  
  const raw = m[1];
  const normalized = raw.includes(',') 
    ? raw.replace(/\./g, '').replace(',', '.') 
    : raw; 
  
  const val = Number(normalized);
  return Number.isFinite(val) && val >= 0 ? val : null;
}



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
    // Mensagens do grupo Tips: só chegam aqui porque o betbpbot tem Bot-to-Bot
    // Communication Mode ativado no BotFather (+ admin do grupo + Group
    // Privacy off) — sem isso o Telegram não entrega updates de mensagens
    // postadas por outro bot (é o bot.js quem posta lá).
    this.bot.on('message', async (ctx) => {
      if (this.tipsGroupChatId && ctx.chat.id === this.tipsGroupChatId) {
        const msg = ctx.message as any;
        const text = msg.text ?? msg.caption;
        if (text) await this.handleTipsMessage(text, ctx.chat.id, msg.message_id);
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

    // Cliques nos botões da cópia individual recebida em DM: Planilhar,
    // Editar e Aposta Caiu — cada um age só na mensagem de quem clicou.
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
          await this.processBetText(ctx, text);
          await ctx.editMessageReplyMarkup({
            inline_keyboard: [[{ text: '✅ Planilhado', callback_data: 'done' }]],
          });
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
        const prompt =
          `✏️ Editar aposta #${msg.message_id}|${isMedia ? 'p' : 't'}\n` +
          `Odd atual: ${currentOdd ?? '?'} · Limite atual: ${currentLimit ?? '?'}\n` +
          `Manda a nova odd e o novo limite nesse formato: 3.50 60\n` +
          EDIT_PROMPT_DELIMITER +
          text;
        await ctx.answerCbQuery();
        await ctx.reply(prompt, { reply_markup: { force_reply: true } });
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
        [{ text: '📊 Planilhar', callback_data: 'planilhar' }],
        [{ text: '✏️ Editar', callback_data: 'editar' }, { text: '❌ Aposta Caiu', callback_data: 'aposta_caiu' }],
      ],
    };
  }

  // Resposta (reply) a um prompt de "✏️ Editar": extrai a odd/limite novos e
  // o texto original (embutido no próprio prompt) e edita só essa mensagem.
  private async handleEditReply(ctx: any, promptText: string, headerMatch: RegExpMatchArray, replyText: string) {
    const originalMessageId = Number(headerMatch[1]);
    const isMedia = headerMatch[2] === 'p';
    const originalText = promptText.split(EDIT_PROMPT_DELIMITER)[1];
    if (!originalText) {
      await ctx.reply('❌ Não consegui recuperar o texto original. Clica em Editar de novo.');
      return;
    }

    const parts = replyText.trim().split(/\s+/);
    const novaOdd = parseFloat((parts[0] ?? '').replace(',', '.'));
    const novoLimite = parts[1] ? parseFloat(parts[1].replace(',', '.')) : null;

    if (!Number.isFinite(novaOdd) || novaOdd <= 1) {
      await ctx.reply('❌ Odd inválida. Manda: ODD LIMITE (ex.: 3.50 60)');
      return;
    }

    let novoTexto = originalText.replace(/🏷\s*([\d]+(?:[.,][\d]+)?)/, `🏷 ${novaOdd.toFixed(2)}`);
    if (novoLimite !== null && Number.isFinite(novoLimite)) {
      novoTexto = novoTexto.replace(/(🚦[^\n]*R\$\s*)([\d.,]+)/, `$1${novoLimite.toFixed(2)}`);
    }

    try {
      if (isMedia) {
        await ctx.telegram.editMessageCaption(ctx.chat.id, originalMessageId, undefined, novoTexto);
      } else {
        await ctx.telegram.editMessageText(ctx.chat.id, originalMessageId, undefined, novoTexto);
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
  private async handleTipsMessage(text: string, chatId: number, messageId: number) {
    const percent = extractPercentAfterStopEmoji(text);
    if (percent === null) return;

    const users = await this.usersService.getUsersForTipsFanout();

    for (const user of users) {
      if (user.minPercentFilter !== null && percent < Number(user.minPercentFilter)) continue;

      const stillMember = await this.isTipsGroupMember(user.telegramUserId as number);
      if (!stillMember) continue;

      try {
        await this.bot.telegram.copyMessage(user.telegramUserId as number, chatId, messageId, {
          reply_markup: this.tipsCopyKeyboard(),
        });
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
  // quanto pelo clique em "Planilhar" na cópia individual do grupo Tips.
  private async processBetText(ctx: any, userMessage: string) {
    try {
      const resolvedHouseId = await this.grokService.resolveHouseId(userMessage);
      const jsonResult = await this.grokService.parseBetMessage(userMessage, resolvedHouseId);

      const houseId = Number(jsonResult.houseId);
      const odd = Number(jsonResult.odd);
      const game = String(jsonResult.game ?? '').trim();
      const market = String(jsonResult.market ?? '').trim();
      const sport = String(jsonResult.sport ?? '').trim();

      const percent = extractPercentAfterStopEmoji(userMessage);
      const user = await this.usersService.findByTelegramUserId(ctx.from.id);
      if (!user) throw new Error('UNLINKED');

      const userStake = await this.usersService.getUserStake(user.id);
      let stake = percent !== null ? (percent / 100) * userStake : Number(jsonResult.stake);

      const limit = extractLimitFromText(userMessage);
      if (limit !== null) stake = Math.min(stake, limit);

      if (!Number.isFinite(houseId)) throw new Error('houseId inválido');
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
      );
    } catch (err) {
      console.error('❌ Erro ao processar aposta:', err);
      if ((err as Error).message === 'UNLINKED') {
        await ctx.reply(UNLINKED_INSTRUCTIONS);
      } else {
        await ctx.reply(`❌ Erro ao processar aposta.\n${(err as Error).message}`);
      }
      throw err;
    }
  }
}

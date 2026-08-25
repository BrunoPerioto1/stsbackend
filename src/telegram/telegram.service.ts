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
          '1️⃣ Vincule sua conta: /vincular SEU_CODIGO (gerado no site)\n' +
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
          await ctx.reply('❌ Usuário não vinculado. Use o comando /vincular primeiro.');
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
          await ctx.reply('❌ Usuário não vinculado. Use o comando /vincular primeiro.');
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

    // Mensagens do grupo Tips: fan-out por usuário conforme filtro de %
    // DMs livres: processa como aposta direto (fluxo original)
    this.bot.on('message', async (ctx) => {
      if (this.tipsGroupChatId && ctx.chat.id === this.tipsGroupChatId) {
        await this.handleTipsGroupMessage(ctx);
        return;
      }

      const msg = ctx.message as any;
      const userMessage = msg.text ?? msg.caption;
      if (!userMessage) return;

      await this.processBetText(ctx, userMessage);
    });

    // Clique em "📊 Planilhar" na cópia individual recebida em DM
    this.bot.on('callback_query', async (ctx) => {
      const query = ctx.callbackQuery as any;
      if (query.data !== 'planilhar') return;

      const text = query.message?.text ?? query.message?.caption;
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
    });
  }

  // Fan-out: pega a mensagem postada no grupo Tips, extrai a %, e manda uma
  // cópia com botão próprio de Planilhar para cada usuário vinculado cujo
  // filtro de porcentagem mínima é satisfeito.
  private async handleTipsGroupMessage(ctx: any) {
    const msg = ctx.message;
    const text = msg.text ?? msg.caption;
    if (!text) return;

    const percent = extractPercentAfterStopEmoji(text);
    if (percent === null) return;

    const users = await this.usersService.getUsersForTipsFanout();

    for (const user of users) {
      if (user.minPercentFilter !== null && percent < Number(user.minPercentFilter)) continue;

      try {
        await ctx.telegram.copyMessage(user.telegramUserId, ctx.chat.id, msg.message_id, {
          reply_markup: {
            inline_keyboard: [[{ text: '📊 Planilhar', callback_data: 'planilhar' }]],
          },
        });
      } catch (err) {
        console.error(`⚠️ Não foi possível enviar tip para o usuário (telegramUserId=${user.telegramUserId}):`, err);
      }
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
      if (!user) throw new Error('Usuário não vinculado. Use /vincular primeiro.');

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
      await ctx.reply(`❌ Erro ao processar aposta.\n${(err as Error).message}`);
      throw err;
    }
  }
}

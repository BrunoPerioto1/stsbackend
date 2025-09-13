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
  const normalized = raw.replace(/\./g, '').replace(/,/g, '.');
  const val = Number(normalized);
  return Number.isFinite(val) && val > 0 ? val : null;
}

function extractPercentAfterStopEmoji(text: string): number | null {
  if (!text) return null;

  const percentRegex = /🛑[^0-9]{0,15}(\d{1,3}(?:[.,]\d{1,2})?)\s*%?/i;
  const m = text.match(percentRegex);
  if (!m) return null;


  const normalized = m[1].replace(',', '.');
  const val = Number(normalized);

  return Number.isFinite(val) && val >= 0 ? val : null;
}



@Injectable()
export class TelegramService implements OnModuleInit {
  public bot: Telegraf;

  constructor(
    private readonly grokService: GrokService,
    private readonly apostaService: ApostaService,
    private readonly usersService: UsersService,
    private readonly houseService: HouseService,
  ) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('❌ TELEGRAM_BOT_TOKEN não definido no .env');

    this.bot = new Telegraf(token);
  }

  async onModuleInit() {
    this.registerCommands();

    const url = `${process.env.APP_URL}/telegram/${process.env.TELEGRAM_BOT_TOKEN}`;
    await this.bot.telegram.setWebhook(url);

    console.log(`🤖 Telegram bot iniciado em webhook: ${url}`);
  }

  private registerCommands() {
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

    // Processamento de aposta (mensagens comuns)
    this.bot.on('message', async (ctx) => {
      const msg = ctx.message as any;
      const userMessage = msg.text ?? msg.caption;
      if (!userMessage) return;

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

        await ctx.reply(
          `✅ Aposta salva!\n\n🎮 Jogo: ${aposta.game}\n💰 Stake: R$ ${aposta.stake}\n📈 Odd: ${aposta.odd}\n🏆 Mercado: ${aposta.market}\n⚽ Esporte: ${aposta.sport}\n🏢 Casa: ${houseName}\n👤 Usuário: ${user.username}`,
        );
      } catch (err) {
        console.error('❌ Erro ao processar aposta:', err);
        await ctx.reply(
          `❌ Erro ao processar aposta.\n${(err as Error).message}`,
        );
      }
    });
  }
}

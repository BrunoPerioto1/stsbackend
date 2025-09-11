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
  const percentRegex = /🛑[^0-9]{0,15}([\d]{1,3}(?:[.,][\d]{1,2})?)\s*%?/i;
  const m = text.match(percentRegex);
  if (!m) return null;
  const normalized = m[1].replace(/\./g, '').replace(/,/g, '.');
  const val = Number(normalized);
  return Number.isFinite(val) && val >= 0 ? val : null;
}

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: Telegraf;

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

  onModuleInit() {
    // Comando /stake para definir a banca do usuário
    this.bot.command('stake', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length !== 2) {
        await ctx.reply(
          '❌ Formato incorreto. Use: /stake VALOR\n' +
          'Exemplo: /stake 2000\n' +
          'O valor será usado como sua banca para calcular as stakes em porcentagem.'
        );
        return;
      }

      const value = Number(args[1].replace(/[.,]/g, ''));
      if (!Number.isFinite(value) || value <= 0) {
        await ctx.reply('❌ Por favor, forneça um valor válido maior que zero.');
        return;
      }

      try {
        // Primeiro precisamos encontrar o usuário pelo telegram_user_id
        const user = await this.usersService.findByTelegramUserId(ctx.from.id);
        if (!user) {
          await ctx.reply('❌ Usuário não vinculado. Use o comando /vincular primeiro.');
          return;
        }

        // Atualiza a stake do usuário
        await this.usersService.updateUserStake(user.id, value);
        
        await ctx.reply(
          `✅ Banca definida com sucesso!\n` +
          `💰 Sua banca atual: R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
          `\nAgora quando você usar 🛑 50% em suas apostas, será calculado ${(value * 0.5).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        );
      } catch (error) {
        console.error('Erro ao atualizar stake:', error);
        await ctx.reply('❌ Erro ao atualizar sua banca. Por favor, tente novamente.');
      }
    });

    // Comando /vincular
    this.bot.command('vincular', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length !== 2) {
        await ctx.reply(
          '❌ Formato incorreto. Use: /vincular SEU_CODIGO\n' +
          'Para obter o código, acesse o sistema web e clique em "Vincular Telegram".',
        );
        return;
      }

      const code = args[1];
      const telegramUserId = ctx.from.id;

      try {
        console.log('🔄 Tentando vincular conta com código:', code, 'e telegramUserId:', telegramUserId);
        
        const url = `${process.env.API_URL || 'http://localhost:4000'}/auth/link-telegram/confirm`;
        console.log('📡 URL da requisição:', url);
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code,
            telegramUserId,
          }),
        });

        if (!response.ok) {
          throw new Error(`Erro HTTP: ${response.status} - ${response.statusText}`);
        }

        const result = await response.json() as {
          success: boolean;
          message: string;
          userId?: number;
          telegramUserId?: number;
        };

        if (result.success) {
          await ctx.reply(
            '✅ Conta vinculada com sucesso!\n' +
            'Agora você pode enviar suas apostas diretamente pelo Telegram.',
          );
        } else {
          await ctx.reply(
            '❌ Erro ao vincular conta: ' + result.message + '\n' +
            'Verifique se o código está correto e tente novamente.',
          );
        }
      } catch (error) {
        console.error('Erro ao confirmar vinculação:', error);
        await ctx.reply(
          '❌ Erro ao processar sua solicitação.\n' +
          'Por favor, tente novamente mais tarde.',
        );
      }
    });

    this.bot.on('message', async (ctx) => {
      const msg = ctx.message as any;
      const isForwarded = !!msg.forward_from || !!msg.forward_from_chat;
      const userMessage = msg.text ?? msg.caption;

      if (!userMessage) return;

      if (isForwarded) {
        console.log('Mensagem encaminhada detectada:', userMessage);
      }

      try {
        const resolvedHouseId = await this.grokService.resolveHouseId(userMessage);
        const jsonResult = await this.grokService.parseBetMessage(userMessage, resolvedHouseId);

        // Normalização e validação
        const houseId = Number(jsonResult.houseId);
        const odd = Number(jsonResult.odd);
        const game = String(jsonResult.game ?? '').trim();
        const market = String(jsonResult.market ?? '').trim();
        const sport = String(jsonResult.sport ?? '').trim();

        // Calcular stake a partir do 🛑 % usando a banca do usuário
        const percent = extractPercentAfterStopEmoji(userMessage);
        const user = await this.usersService.findByTelegramUserId(ctx.from.id);
        if (!user) {
          throw new Error('Usuário não vinculado. Use o comando /vincular primeiro.');
        }
        const userStake = await this.usersService.getUserStake(user.id);
        let stake = percent !== null ? (percent / 100) * userStake : Number(jsonResult.stake);

        // Aplicar limite 🚦 da mensagem, se houver
        const limit = extractLimitFromText(userMessage);
        if (Number.isFinite(limit as number)) {
          stake = Math.min(stake, limit as number);
        }

        console.log('💰 Cálculo da stake:', {
          percentagem: percent,
          bancaUsuario: userStake,
          stakeCalculada: stake,
          limite: limit
        });

        // Ignorar qualquer valor de 💰 para stake (não altera stake, apenas garantimos)
        // Se desejar, poderíamos logar se houver 💰 na mensagem

        if (!Number.isFinite(houseId)) {
          throw new Error('houseId inválido ou não mapeado');
        }
        if (!Number.isFinite(stake) || stake <= 0) {
          throw new Error('stake inválida');
        }
        if (!Number.isFinite(odd) || odd <= 1) {
          throw new Error('odd inválida');
        }
        if (!game) {
          throw new Error('game is empty ');
        }
        if (!market) {
          throw new Error('mercado vazio');
        }
        if (!game) {
          throw new Error('esporte vazio');
        }

        console.log('🔍 Procurando usuário com telegramUserId:', ctx.from.id);
        // O usuário já foi buscado anteriormente, reutilizando a variável user
        console.log('👤 Usuário encontrado:', user);

        if (!user) {
          throw new Error('Usuário não vinculado. Use o comando /vincular para vincular sua conta.');
        }

        console.log('📝 Criando aposta com userId:', user.id);
        const apostaData: CreateBetDto = {
          userId: user.id,
          game,
          stake: Number(stake.toFixed(2)),
          odd,
          houseId,
          market,
          sport,
        };
        
        console.log('📊 Dados da aposta:', apostaData);

        const aposta = await this.apostaService.createBet(apostaData);
        let houseName = 'N/A';
        
        if (aposta.houseId) {
          try {
            const houses = await this.houseService.getAllHouses();
            const house = houses.find(h => h.id === aposta.houseId);
            if (house) {
              houseName = house.name;
            }
          } catch (error) {
            console.error('Erro ao buscar nome da casa:', error);
          }
        }

        await ctx.reply(
          `✅ Aposta salva com sucesso!\n\n🎮 Jogo: ${aposta.game}\n💰 Stake: R$ ${aposta.stake}\n📈 Odd: ${aposta.odd}\n🏆 Mercado: ${aposta.market}\n⚽ Esporte: ${aposta.sport}\n🏢 Casa: ${houseName}\n👤 Usuário: ${user.username}`,
          { parse_mode: 'Markdown' },
        );
      } catch (err) {
        console.error('❌ Erro ao processar a mensagem:', err);
        await ctx.reply(
          `❌ Erro ao processar sua aposta.\n\nDetalhe: ${
            (err as Error).message || 'verifique o formato da mensagem'
          }`,
        );
      }
    });

    this.bot.launch();
    console.log('🤖 Telegram bot iniciado...');
  }
}

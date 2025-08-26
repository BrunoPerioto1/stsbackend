import { Injectable, OnModuleInit } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import { GrokService } from './grok.service';
import { ApostaService } from '../aposta/aposta.service';
import { CreateApostaDto } from '../aposta/dto/create-aposta.dto';
dotenv.config();

const CASAS_BY_ID: Record<number, string> = {
  2: '4Play',
  3: '7KBet',
  4: 'ApostaGanha',
  5: 'ApostaTudo',
  6: 'Bateu',
  7: 'Bet Vera',
  8: 'Bet365',
  9: 'Betano',
  10: 'Betao',
  11: 'BETesporte',
  12: 'Betfair',
  13: 'Betfast',
  14: 'Betnacional',
  15: 'BetPix365',
  16: 'Bolsa De Aposta',
  17: 'Brasil Da Sorte',
  18: 'BravoBet',
  19: 'BRBET',
  20: 'CasadeApostas',
  21: 'Cassino',
  22: 'Esportiva',
  23: 'EstrelaBet',
  24: 'F12',
  25: 'FullTBet',
  26: 'GoldBet',
  27: 'HiperBet',
  28: 'Jogo de Ouro',
  29: 'Lotogreen',
  30: 'MC Games',
  31: 'MMABet',
  32: 'Mr. Jack',
  33: 'MultiBet',
  34: 'Novibet',
  35: 'Pagol',
  36: 'Pixbet',
  37: 'Rei do Pitaco',
  38: 'SportingBet',
  39: 'Superbet',
  40: 'VBet',
  41: 'Vaidebet',
  42: 'VeraBet',
  43: 'XP Bet',
};

function extractLimitFromText(text: string): number | null {
  if (!text) return null;
  // Busca por 🚦 seguido de valor; aceita R$, . e ,
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
  // Pega número após 🛑, com ou sem %, com , ou .
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
  ) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('❌ TELEGRAM_BOT_TOKEN não definido no .env');

    this.bot = new Telegraf(token);
  }

  onModuleInit() {
    this.bot.on('message', async (ctx) => {
      const msg = ctx.message as any;
      const isForwarded = !!msg.forward_from || !!msg.forward_from_chat;
      const userMessage = msg.text ?? msg.caption;

      if (!userMessage) return;

      if (isForwarded) {
        console.log('Mensagem encaminhada detectada:', userMessage);
      }

      try {
        const jsonResult = await this.grokService.parseBetMessage(userMessage);

        // Normalização e validação
        const casa_id = Number(jsonResult.casa_id);
        const odd = Number(jsonResult.odd);
        const jogo = String(jsonResult.jogo ?? '').trim();
        const mercado = String(jsonResult.mercado ?? '').trim();
        const esporte = String(jsonResult.esporte ?? '').trim();

        // Calcular stake a partir do 🛑 % de uma banca fixa de 2000
        const percent = extractPercentAfterStopEmoji(userMessage);
        let stake = percent !== null ? (percent / 100) * 2000 : Number(jsonResult.stake);

        // Aplicar limite 🚦 da mensagem, se houver
        const limit = extractLimitFromText(userMessage);
        if (Number.isFinite(limit as number)) {
          stake = Math.min(stake, limit as number);
        }

        // Ignorar qualquer valor de 💰 para stake (não altera stake, apenas garantimos)
        // Se desejar, poderíamos logar se houver 💰 na mensagem

        if (!Number.isFinite(casa_id) || !CASAS_BY_ID[casa_id]) {
          throw new Error('casa_id inválido ou não mapeado');
        }
        if (!Number.isFinite(stake) || stake <= 0) {
          throw new Error('stake inválida');
        }
        if (!Number.isFinite(odd) || odd <= 1) {
          throw new Error('odd inválida');
        }
        if (!jogo) {
          throw new Error('jogo vazio');
        }
        if (!mercado) {
          throw new Error('mercado vazio');
        }
        if (!esporte) {
          throw new Error('esporte vazio');
        }

        const apostaData: CreateApostaDto = {
          jogo,
          stake: Number(stake.toFixed(2)),
          odd,
          casa_id,
          mercado,
          esporte,
        };

        const aposta = await this.apostaService.criarAposta(apostaData);

        await ctx.reply(
          `✅ Aposta salva no DB!\n\n📊 JSON:\n\`\`\`json\n${JSON.stringify(
            aposta,
            null,
            2,
          )}\n\`\`\``,
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

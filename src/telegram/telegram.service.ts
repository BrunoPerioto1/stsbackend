import { Injectable, OnModuleInit } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import { GrokService } from './grok.service';
import { ApostaService } from '../bet/bet.service';
import { CreateBetDto } from '../bet/dto/bet.dto';
dotenv.config();

const HOUSE_BY_ID: Record<number, string> = {
  1: '1 PRA 1',
  2: '1XBET',
  3: '4PLAY',
  4: '4WIN',
  5: '5G',
  6: '6R',
  7: '6Z',
  8: '7GAMES',
  9: '7K',
  10: '9D',
  11: '9F',
  12: 'A247',
  13: 'AFUN',
  14: 'AI',
  15: 'ALFA BET',
  16: 'APOSTA GANHA',
  17: 'APOSTA BET',
  18: 'APOSTA1',
  19: 'APOSTAMAX',
  20: 'APOSTATUDO',
  21: 'APOSTAR',
  22: 'APOSTOU',
  23: 'ARENAPLUS',
  24: 'AVIAOBET',
  25: 'B1 BET',
  26: 'B2XBET',
  27: 'BACANAPLAY',
  28: 'BANDBET',
  29: 'BATEU BET',
  30: 'BAU BINGO',
  31: 'BET AKI',
  32: 'BET APP',
  33: 'BET DA SORTE',
  34: 'BET DO MILHÃO',
  35: 'BET GORILLAS',
  36: 'BET SUL',
  37: 'BET VIP',
  38: 'BET.BET',
  39: 'BET365',
  40: 'BET4',
  41: 'BETBOO',
  42: 'BETBOOM',
  43: 'BETBRA',
  44: 'BETBUFFALOS',
  45: 'BETCAIXA',
  46: 'BETCOPA',
  47: 'BETESPECIAL',
  48: 'BETESPORTE',
  49: 'BETFALCONS',
  50: 'BETFAST',
  51: 'BETFAIR',
  52: 'BETFUSION',
  53: 'BETMGM',
  54: 'BETNACIONAL',
  55: 'BETOU',
  56: 'BETPARK',
  57: 'BETANO',
  58: 'BETSSON',
  59: 'BETWARRIOR',
  60: 'BIG',
  61: 'BINGOPLUS',
  62: 'BLAZE',
  63: 'BOLSA DE APOSTA',
  64: 'BRASIL BET',
  65: 'BRASIL DA SORTE',
  66: 'BRAVO',
  67: 'BRAZINO 777',
  68: 'BRBET',
  69: 'BR4BET',
  70: 'BRXBET',
  71: 'BULLSBET',
  72: 'CASA DE APOSTAS',
  73: 'CASSINO',
  74: 'CAESARS',
  75: 'CBESPORTES',
  76: 'CGG',
  77: 'DONALDBET',
  78: 'DONOSDABOLA',
  79: 'ENERGIA',
  80: 'ESPORTES DA SORTE',
  81: 'ESPORTE 365',
  82: 'ESPORTIVA BET',
  83: 'ESPORTIVAVIP',
  84: 'ESTRELABET',
  85: 'F12.BET',
  86: 'FAZ O BET',
  87: 'FAZ1BET',
  88: 'FANBIT',
  89: 'FLABET',
  90: 'FOG0777',
  91: 'FULLTBET',
  92: 'FYBET',
  93: 'GALERA.BET',
  94: 'GAMEPLUS',
  95: 'GERALBET',
  96: 'GINGABET',
  97: 'GOL DE BET',
  98: 'H2 BET',
  99: 'HILGARDO',
  100: 'HILGARDO GAMING',
  101: 'HIPERBET',
  102: 'JOGA LIMPO',
  103: 'JOGÃO',
  104: 'JOGO',
  105: 'JOGO DE OURO',
  106: 'JOGO ONLINE',
  107: 'JOGOS',
  108: 'JONBET',
  109: 'KBET',
  110: 'KING PANDA',
  111: 'KTO',
  112: 'LANCE DE SORTE',
  113: 'LÍDERBET',
  114: 'LOTTOLAND',
  115: 'LOTTU',
  116: 'LOTOGREEN',
  117: 'LUCK.BET',
  118: 'LUVA.BET',
  119: 'MAGICJACKPOT',
  120: 'MATCHBOOK',
  121: 'MAXIMABET',
  122: 'MCGAMES',
  123: 'MEGABET',
  124: 'MEGAPOSTA',
  125: 'MERIDIAN',
  126: 'MGM',
  127: 'MMA',
  128: 'MONTECARLOS',
  129: 'MONTECARLOSBET',
  130: 'MULTIBET',
  131: 'NETPIX',
  132: 'NOSSABET',
  133: 'NOVIBET',
  134: 'ONABET',
  135: 'OLEYBET',
  136: 'P9',
  137: 'PAGOL',
  138: 'PAPIGAMES',
  139: 'PIN',
  140: 'PINNACLE',
  141: 'PITACO',
  142: 'PIXBET',
  143: 'PLAYUZU',
  144: 'PQ777',
  145: 'QGBET',
  146: 'R7',
  147: 'RDP',
  148: 'REALS',
  149: 'REI DO PITACO',
  150: 'RICOBET',
  151: 'RIVALO',
  152: 'SEGURO BET',
  153: 'SEUBET',
  154: 'SORTE ONLINE',
  155: 'SORTENABET',
  156: 'SPIN',
  157: 'SPORTINGBET',
  158: 'SPORTYBET',
  159: 'STAKE',
  160: 'STARTBET',
  161: 'SUPER',
  162: 'SUPERBET',
  163: 'SUPREMABET',
  164: 'TELE SENA BET',
  165: 'TIGER',
  166: 'TIVOBET',
  167: 'TRADICIONAL',
  168: 'ULTRABET',
  169: 'UPBETBR',
  170: 'UX',
  171: 'VBET',
  172: 'VERA',
  173: 'VERSUSBET',
  174: 'VERTBET',
  175: 'VIVARO',
  176: 'VIVASORTE',
  177: 'VS-VERSUS',
  178: 'VUPI',
  179: 'WJCASINO',
  180: 'XBET CAIXA',
  181: 'BETPIX365',
  182: 'VAIDEBET',
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
        const houseId = Number(jsonResult.houseId);
        const odd = Number(jsonResult.odd);
        const game = String(jsonResult.game ?? '').trim();
        const market = String(jsonResult.market ?? '').trim();
        const sport = String(jsonResult.sport ?? '').trim();

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

        if (!Number.isFinite(houseId) || !HOUSE_BY_ID[houseId]) {
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

        const apostaData: CreateBetDto = {
          game,
          stake: Number(stake.toFixed(2)),
          odd,
          houseId,
          market,
          sport,
        };

        const aposta = await this.apostaService.createBet(apostaData);

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

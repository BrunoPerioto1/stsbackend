import { Injectable } from '@nestjs/common';
import { GrokService } from './grok.service';
import { BetService } from '../bet/bet.service';
import { CreateBetDto } from '../bet/dto/bet.dto';
import { UsersService } from '../users/users.service';
import { HouseService } from '../house/house.service';
import { TipFanoutService } from './tip-fanout.service';
import {
  EDIT_PROMPT_INSTRUCTIONS,
  UNLINKED_INSTRUCTIONS,
} from './messages.const';
import {
  extractLimitFromText,
  extractPercent,
  parseBetLocal,
} from './utils/tip-extractors.util';

// Transforma texto livre (DM ou tip) numa aposta salva, e trata o fluxo de
// edição de odd/limite/casa que acontece antes disso (prompt de "✏️ Editar").
@Injectable()
export class BetTextService {
  constructor(
    private readonly grokService: GrokService,
    private readonly betService: BetService,
    private readonly usersService: UsersService,
    private readonly houseService: HouseService,
    private readonly tipFanoutService: TipFanoutService,
  ) {}

  // Parsing + criação da aposta. Reaproveitado tanto pelo texto livre em DM
  // quanto pelo clique em "Enviar ao Planilhador" na cópia individual do
  // grupo Tips. Quando vem de um clique (replyToMessageId presente), a
  // confirmação sai como resposta à própria tip, em vez de mensagem solta.
  async processBetText(
    ctx: any,
    userMessage: string,
    replyToMessageId?: number,
    tipId?: number,
  ) {
    // ponytail: timing temporário pra achar o gargalo do clique em Planilhar
    // em prod. Tira depois de medir.
    const t0 = Date.now();
    const marks: string[] = [];
    let last = t0;
    const mark = (label: string) => {
      const now = Date.now();
      marks.push(`${label}=${now - last}ms`);
      last = now;
    };

    try {
      const resolvedHouseId =
        await this.grokService.resolveHouseId(userMessage);
      mark('resolveHouse');

      // Caminho rápido: os dois formatos conhecidos (emoji e SOBRECARGA/
      // AVISO) são posicionais, então dá pra extrair tudo com regex e pular
      // a ida na IA. O Groq fica só de fallback pra texto fora do padrão.
      const local = parseBetLocal(userMessage);
      const jsonResult = local
        ? { ...local, houseId: resolvedHouseId }
        : await this.grokService.parseBetMessage(userMessage, resolvedHouseId);
      mark(local ? 'parseLocal' : 'parseGROQ');

      const houseId = Number(jsonResult.houseId);
      const odd = Number(jsonResult.odd);
      const game = String(jsonResult.game ?? '').trim();
      const market = String(jsonResult.market ?? '').trim();
      const sport = String(jsonResult.sport ?? '').trim();

      const percent = extractPercent(userMessage);
      const user = await this.usersService.findByTelegramUserId(ctx.from.id);
      if (!user) throw new Error('UNLINKED');
      mark('findUser');

      const userStake = await this.usersService.getUserStake(user.id);
      mark('getUserStake');
      let stake =
        percent !== null
          ? (percent / 100) * userStake
          : Number(jsonResult.stake);

      const limit = extractLimitFromText(userMessage);
      if (limit !== null) stake = Math.min(stake, limit);

      if (!Number.isFinite(houseId) || houseId <= 0)
        throw new Error('CASA_INVALIDA');
      if (!Number.isFinite(stake) || stake <= 0)
        throw new Error('stake inválida');
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

      const aposta = await this.betService.createBet(apostaData, tipId);
      mark('createBet');

      let houseName = 'N/A';
      try {
        const houses = await this.houseService.getAllHouses();
        const house = houses.find((h) => h.id === aposta.houseId);
        if (house) houseName = house.name;
      } catch (err) {
        console.error('Erro ao buscar casa:', err);
      }
      mark('getHouseName');

      const horario = new Date(aposta.betTime).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });

      await ctx.reply(
        `✅ Aposta salva!\n\n🎮 Jogo: ${aposta.game}\n🕐 Horário: ${horario}\n💰 Stake: R$ ${aposta.stake}\n📈 Odd: ${aposta.odd}\n🏆 Mercado: ${aposta.market}\n⚽ Esporte: ${aposta.sport}\n🏢 Casa: ${houseName}`,
        replyToMessageId
          ? { reply_parameters: { message_id: replyToMessageId } }
          : undefined,
      );
      mark('ctxReply');
      console.log(
        `⏱ planilhar TOTAL=${Date.now() - t0}ms | ${marks.join(' ')}`,
      );
    } catch (err) {
      console.log(
        `⏱ planilhar FALHOU TOTAL=${Date.now() - t0}ms | ${marks.join(' ')}`,
      );
      console.error('❌ Erro ao processar aposta:', err);
      const extra = replyToMessageId
        ? { reply_parameters: { message_id: replyToMessageId } }
        : undefined;
      if ((err as Error).message === 'UNLINKED') {
        await ctx.reply(UNLINKED_INSTRUCTIONS, extra);
      } else if ((err as Error).message === 'CASA_INVALIDA') {
        await ctx.reply(
          '❌ Erro ao ler a casa de aposta. Por favor, remande a aposta aqui no chat trocando a casa por uma parecida.',
          extra,
        );
      } else {
        await ctx.reply(
          `❌ Erro ao processar aposta.\n${(err as Error).message}`,
          extra,
        );
      }
      throw err;
    }
  }

  // Resposta (reply) a um prompt de "✏️ Editar": extrai a odd/limite novos e
  // o texto original (embutido no próprio prompt) e edita só essa mensagem.
  async handleEditReply(
    ctx: any,
    promptText: string,
    headerMatch: RegExpMatchArray,
    replyText: string,
  ) {
    const originalMessageId = Number(headerMatch[1]);
    const isMedia = headerMatch[2] === 'p';
    const tipId = headerMatch[3] ? Number(headerMatch[3]) : undefined;
    const sepIndex = promptText.indexOf('\n\n');
    const originalText = sepIndex >= 0 ? promptText.slice(sepIndex + 2) : '';
    if (!originalText) {
      await ctx.reply(
        '❌ Não consegui recuperar o texto original. Clica em Editar de novo.',
      );
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
      novoLimite = parseFloat(
        raw
          .replace(/^limite|^limit/i, '')
          .trim()
          .replace(',', '.'),
      );
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
      novoTexto = novoTexto.replace(
        /🏷\s*([\d]+(?:[.,][\d]+)?)/,
        `🏷 ${novaOdd.toFixed(2)}`,
      );
    }
    if (novoLimite !== null) {
      novoTexto = novoTexto.replace(
        /(🚦[^\n]*R\$\s*)([\d.,]+)/,
        `$1${novoLimite.toFixed(2)}`,
      );
    }
    if (novaCasa) {
      novoTexto = novoTexto.replace(/^🏠\s*.*$/m, `🏠 ${novaCasa}`);
    }

    try {
      if (isMedia) {
        await ctx.telegram.editMessageCaption(
          ctx.chat.id,
          originalMessageId,
          undefined,
          novoTexto,
          {
            reply_markup: this.tipFanoutService.tipsCopyKeyboard(tipId),
          },
        );
      } else {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          originalMessageId,
          undefined,
          novoTexto,
          {
            reply_markup: this.tipFanoutService.tipsCopyKeyboard(tipId),
          },
        );
      }
      await ctx.reply('✅ Aposta atualizada!', {
        reply_parameters: { message_id: originalMessageId },
      });
    } catch (err) {
      console.error('❌ Erro ao editar aposta individual:', err);
      await ctx.reply('❌ Erro ao atualizar. Tenta de novo.');
    }
  }
}

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
  extractStakeFromText,
  parseBetLocal,
} from './utils/tip-extractors.util';
import { BetImageService } from './bet-image.service';
import { BetAudioService, MAX_AUDIO_BYTES } from './bet-audio.service';
import { buildBetPreview, missingBetFields } from './utils/bet-preview.util';
import type { Context } from 'telegraf';
import type { Message } from 'telegraf/types';

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
    private readonly betImageService: BetImageService,
    private readonly betAudioService: BetAudioService,
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
    betTime?: Date,
  ) {
    try {
      const resolvedHouseId =
        await this.grokService.resolveHouseId(userMessage);

      // Caminho rápido: os dois formatos conhecidos (emoji e SOBRECARGA/
      // AVISO) são posicionais, então dá pra extrair tudo com regex e pular
      // a ida na IA. O Groq fica só de fallback pra texto fora do padrão.
      const local = parseBetLocal(userMessage);
      const jsonResult = local
        ? { ...local, houseId: resolvedHouseId }
        : await this.grokService.parseBetMessage(userMessage, resolvedHouseId);

      const houseId = Number(jsonResult.houseId);
      const odd = Number(jsonResult.odd);
      const game = String(jsonResult.game ?? '').trim();
      const market = String(jsonResult.market ?? '').trim();
      const sport = String(jsonResult.sport ?? '').trim();

      const percent = extractPercent(userMessage);
      const user = await this.usersService.findByTelegramUserId(ctx.from.id);
      if (!user) throw new Error('UNLINKED');

      const userStake = await this.usersService.getUserStake(user.id);
      let stake =
        percent !== null
          ? (percent / 100) * userStake
          : Number(jsonResult.stake);

      // Card vindo de print: não tem % pra converter pela banca, o valor
      // apostado já está no texto ("💰 Stake: R$ 14,83").
      if (!Number.isFinite(stake))
        stake = extractStakeFromText(userMessage) ?? NaN;

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
        // Só o fluxo de imagem passa isso (horário da mensagem original no
        // Telegram). Sem betTime o banco segue usando o default de sempre.
        ...(betTime ? { betTime: betTime.toISOString() } : {}),
      };

      const aposta = await this.betService.createBet(apostaData, tipId);

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
        replyToMessageId
          ? { reply_parameters: { message_id: replyToMessageId } }
          : undefined,
      );
    } catch (err) {
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

  // Print de bilhete + legenda com o nome da casa. A IA só extrai os dados —
  // quem planilha continua sendo o botão "Enviar ao Planilhador" de sempre.
  // O truque pra não duplicar nada: em vez de inventar um estado novo entre
  // preview e clique, monta o MESMO card de texto emoji que o callback de
  // planilhar já sabe reler (🏠/🆚/⚽/📌/🏷 + 💰 Stake). Nada é gravado aqui.
  async handleDeepBetPhoto(ctx: any) {
    const preview = ctx.callbackQuery?.message;
    const photo = preview?.reply_to_message;
    if (!photo?.photo?.length || !photo.caption || !photo.date) {
      await ctx.answerCbQuery(
        'Não encontrei a foto original. Envie novamente com a legenda.',
      );
      return;
    }
    if (photo.from?.id !== ctx.from?.id) {
      await ctx.answerCbQuery(
        'Somente quem enviou a foto pode revisar esta aposta.',
      );
      return;
    }
    const keyboard = preview.reply_markup;
    if (
      !keyboard?.inline_keyboard?.some((row: any[]) =>
        row.some((button) => button.callback_data === 'bet_image_deep'),
      )
    ) {
      await ctx.answerCbQuery('Esta análise já foi solicitada.');
      return;
    }
    await ctx.answerCbQuery('Analisando a foto novamente…');
    try {
      // Remove Planilhar enquanto a revisão está em andamento.
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [[{ text: '⏳ Analisando…', callback_data: 'noop' }]],
      });
    } catch {
      // Outro clique pode já ter colocado a mensagem no mesmo estado.
      return;
    }
    try {
      await this.handleBetPhoto(ctx, photo, true);
    } catch (err) {
      console.error('❌ Erro na análise profunda:', (err as Error).message);
      await ctx.editMessageReplyMarkup(keyboard);
      await ctx.reply(
        '⚠️ A análise profunda não conseguiu concluir a leitura. O preview anterior foi mantido. Tente novamente ou envie um print mais legível.',
        { reply_parameters: { message_id: preview.message_id } },
      );
    }
  }

  async handleBetPhoto(ctx: any, msg: any, deep = false) {
    const caption = String(msg.caption ?? '').trim();
    if (!caption) {
      await ctx.reply(
        '📸 Informe o nome da casa na legenda da imagem. Ex.: Ginga',
        { reply_parameters: { message_id: msg.message_id } },
      );
      return;
    }

    const startedAt = performance.now();
    const timings: Record<string, number> = {};
    let status = 'error';
    const measure = async <T>(
      stage: string,
      operation: () => Promise<T>,
    ): Promise<T> => {
      const start = performance.now();
      try {
        return await operation();
      } finally {
        timings[stage] = Math.round(performance.now() - start);
      }
    };
    let feedback: { message_id: number } | null = null;
    const extra = { reply_parameters: { message_id: msg.message_id } };
    const deepButton = [
      { text: '🔎 Análise profunda', callback_data: 'bet_image_deep' },
    ];
    const retryExtra = {
      ...extra,
      reply_markup: { inline_keyboard: [deepButton] },
    };

    const reply = async (text: string, options: any = {}) =>
      measure('preview', async () => {
        const { reply_parameters: _replyParameters, ...editOptions } = options;
        if (deep) return ctx.editMessageText(text, editOptions);
        if (feedback)
          return ctx.telegram.editMessageText(
            ctx.chat.id,
            feedback.message_id,
            undefined,
            text,
            editOptions,
          );
        return ctx.reply(text, { ...extra, ...editOptions });
      });

    try {
      // Feedback, consulta da casa e download começam juntos. A IA só roda com casa válida.
      const [notice, house, photo] = await Promise.allSettled([
        deep
          ? Promise.resolve(null)
          : measure('feedback', () =>
              ctx.reply('⏳ Analisando a foto…', extra),
            ),
        measure('house', () =>
          this.grokService.resolveHouseId(`🏠 ${caption}`),
        ),
        (async () => {
          const fileId = msg.photo[msg.photo.length - 1].file_id;
          const link: any = await measure('get_file', () =>
            ctx.telegram.getFileLink(fileId),
          );
          const url = link.href ?? String(link);
          const imageBuffer = await measure('download', async () => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`download ${res.status}`);
            return Buffer.from(await res.arrayBuffer());
          });
          return {
            imageBuffer,
            mimeType: /\.png($|\?)/i.test(url) ? 'image/png' : 'image/jpeg',
          };
        })(),
      ]);
      if (notice.status === 'fulfilled')
        feedback = notice.value as { message_id: number } | null;
      else console.warn('[BET_IMAGE_FLOW] feedback_failed=true');

      let extracted: Awaited<
        ReturnType<typeof this.betImageService.extractBetFromImage>
      >;
      try {
        if (house.status === 'rejected') throw house.reason;
        if (!house.value) {
          status = 'invalid_house';
          if (deep) throw new Error('CASA_INVALIDA');
          await reply(
            '❌ Erro ao ler a casa de aposta. Por favor, remande a aposta aqui no chat trocando a casa por uma parecida.',
          );
          return;
        }
        if (photo.status === 'rejected') throw photo.reason;
        extracted = await measure('ai', () =>
          this.betImageService.extractBetFromImage({ ...photo.value, deep }),
        );
      } catch (err) {
        const reason = (err as Error).message;
        console.error(
          `❌ Erro ao reconhecer print (chatId=${ctx.chat?.id} messageId=${msg.message_id}):`,
          reason,
        );
        if (deep) throw err;
        await reply(
          reason === 'OPENAI_API_KEY_AUSENTE'
            ? '❌ Reconhecimento por imagem não está configurado no servidor.'
            : '❌ Não consegui ler esse print agora. Tenta de novo em instantes.',
          retryExtra,
        );
        return;
      }

      const faltando = missingBetFields(extracted);

      if (faltando.length) {
        status = 'incomplete';
        if (deep) throw new Error(`CAMPOS_AUSENTES: ${faltando.join(', ')}`);
        await reply(
          `⚠️ Não consegui identificar completamente esta aposta.\n\nNão identificado:\n${faltando
            .map((f) => `• ${f}`)
            .join(
              '\n',
            )}\n\nTente a análise profunda ou envie outro print mostrando o bilhete completo.`,
          retryExtra,
        );
        return;
      }

      const preview = buildBetPreview(extracted, caption, msg.date as number, {
        deep,
        allowDeep: !deep,
      });
      await reply(preview.text, { reply_markup: preview.reply_markup });
      status = 'ok';
    } finally {
      console.log(
        `[BET_IMAGE_FLOW] chat_id=${ctx.chat?.id} message_id=${msg.message_id} mode=${deep ? 'deep' : 'standard'} status=${status} ` +
          Object.entries(timings)
            .map(([stage, duration]) => `${stage}_ms=${duration}`)
            .join(' ') +
          ` total_ms=${Math.round(performance.now() - startedAt)}`,
      );
    }
  }

  async handleBetAudio(
    ctx: Context,
    msg: Message.VoiceMessage | Message.AudioMessage,
  ) {
    const startedAt = performance.now();
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    const audio = 'voice' in msg ? msg.voice : msg.audio;
    const extra = { reply_parameters: { message_id: msg.message_id } };
    let feedback: Message.TextMessage | undefined;
    let status = 'error';
    const reply = async (
      text: string,
      replyMarkup?: ReturnType<typeof buildBetPreview>['reply_markup'],
    ) => {
      if (feedback)
        return ctx.telegram.editMessageText(
          chatId,
          feedback.message_id,
          undefined,
          text,
          { reply_markup: replyMarkup },
        );
      return ctx.reply(text, { ...extra, reply_markup: replyMarkup });
    };
    try {
      if ((audio.file_size ?? 0) > MAX_AUDIO_BYTES)
        throw new Error('AUDIO_MUITO_GRANDE');
      try {
        feedback = await ctx.reply('⏳ Analisando o áudio…', extra);
      } catch {
        console.warn('[BET_AUDIO_TOTAL] feedback_failed=true');
      }

      const downloadStart = performance.now();
      let audioBuffer: Buffer;
      let filename: string;
      try {
        const link = await ctx.telegram.getFileLink(audio.file_id);
        filename =
          'voice' in msg
            ? 'voice.ogg'
            : (msg.audio.file_name ??
              link.pathname.split('/').pop() ??
              'audio');
        const response = await fetch(link.href, {
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok || !response.body)
          throw new Error('AUDIO_DOWNLOAD_FALHOU');
        if (Number(response.headers.get('content-length')) > MAX_AUDIO_BYTES) {
          await response.body.cancel();
          throw new Error('AUDIO_MUITO_GRANDE');
        }
        // Limita também os bytes reais, mesmo se Telegram não informar file_size/Content-Length.
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            const value = chunk.value as Uint8Array;
            size += value.byteLength;
            if (size > MAX_AUDIO_BYTES) {
              await reader.cancel();
              throw new Error('AUDIO_MUITO_GRANDE');
            }
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
        audioBuffer = Buffer.concat(chunks);
      } finally {
        console.log(
          `[BET_AUDIO_DOWNLOAD] message_id=${msg.message_id} duration_ms=${Math.round(performance.now() - downloadStart)}`,
        );
      }
      const transcript = await this.betAudioService.transcribeBetAudio({
        audioBuffer,
        filename,
        mimeType: audio.mime_type,
        durationSeconds: audio.duration,
      });
      const extracted =
        await this.betAudioService.extractBetFromTranscript(transcript);
      const faltando = missingBetFields(extracted);
      const houseId = extracted.casa
        ? await this.grokService.resolveHouseId(`🏠 ${extracted.casa}`)
        : null;
      if (!houseId) faltando.unshift('Casa');
      if (faltando.length) {
        status = 'incomplete';
        await reply(
          `⚠️ Não consegui identificar completamente a aposta.\n\nFaltando:\n${faltando.map((f) => `• ${f}`).join('\n')}\n\nEnvie outro áudio incluindo esses dados.`,
        );
        return;
      }
      const preview = buildBetPreview(extracted, extracted.casa!, msg.date);
      await reply(preview.text, preview.reply_markup);
      status = 'ok';
    } catch (error) {
      console.error(
        `[BET_AUDIO_ERROR] message_id=${msg.message_id} type=${error instanceof Error ? error.name : 'unknown'}`,
      );
      await reply(
        error instanceof Error && error.message === 'AUDIO_MUITO_GRANDE'
          ? '⚠️ Áudio muito grande. Envie um arquivo de até 20 MB.'
          : 'Não consegui entender este áudio. Tente enviar novamente falando os dados da aposta.',
      );
    } finally {
      console.log(
        `[BET_AUDIO_TOTAL] message_id=${msg.message_id} status=${status} duration_ms=${Math.round(performance.now() - startedAt)}`,
      );
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

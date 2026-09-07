import type { Message } from 'telegraf/types';
import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { TipsService } from '../tips/tips.service';
import { BetTextService } from './bet-text.service';
import { TipFanoutService } from './tip-fanout.service';
import { PendentesService } from './pendentes.service';
import { BetService } from '../bet/bet.service';
import { EDIT_PROMPT_INSTRUCTIONS } from './messages.const';
import { escapeHtml } from './utils/tip-text.util';
import {
  extractGameFromText,
  extractHouseFromText,
  extractLimitFromText,
  extractOddFromText,
} from './utils/tip-extractors.util';
import { parseCallbackAction } from './utils/callback-parsing.util';

// Não existe rota por aposta no front — o botão leva pra lista de apostas.
const BETS_URL = 'https://stsfront.vercel.app/bets';

// Dispatcher de callback_query: os botões da cópia individual (Planilhar /
// Editar / Aposta Caiu / Voltar) e os da lista compacta do /pendentes
// (lista_planilhar / lista_caiu / lista_editar / lista_pagina).
@Injectable()
export class TelegramCallbackService {
  // Clique duplo no mesmo botao dispara dois callbacks antes do primeiro
  // gravar a aposta — a checagem no banco nao ve nada ainda e as duas passam.
  // Este lock cobre a corrida; a checagem de estado logo abaixo cobre o
  // clique tardio (mensagem antiga, item ja resolvido).
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly usersService: UsersService,
    private readonly tipsService: TipsService,
    private readonly betTextService: BetTextService,
    private readonly tipFanoutService: TipFanoutService,
    private readonly pendentesService: PendentesService,
    private readonly betService: BetService,
  ) {}

  // Redesenha a mensagem-lista no lugar. `editMessageText` reclama quando o
  // conteudo nao mudou — nesse caso nao ha o que corrigir, so ignora.
  private async refreshList(
    ctx: any,
    user: { id: number; minPercentFilter?: number | null },
    page: number,
    undo?: Parameters<PendentesService['buildMessage']>[2],
  ) {
    try {
      const { text, keyboard } = await this.pendentesService.buildMessage(
        user,
        page,
        undo,
      );
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: keyboard,
      });
    } catch (err) {
      if (!String(err).includes('message is not modified'))
        console.error('❌ Erro ao atualizar lista de pendentes:', err);
    }
  }

  async handle(ctx: any) {
    const query = ctx.callbackQuery;
    const msg = query.message;
    const text: string | undefined = msg?.text ?? msg?.caption;
    const isMedia = !!msg?.photo;
    const { action, args } = parseCallbackAction(query.data as string);
    const tipId = args[0] ?? null;

    if (action === 'noop') {
      await ctx.answerCbQuery();
      return;
    }

    if (action === 'bet_image_deep') {
      await this.betTextService.handleDeepBetPhoto(ctx);
      return;
    }

    // planilhar_ts é o mesmo Planilhar, só que o arg não é tipId e sim o
    // horário (unix) da mensagem que originou o card — usado pelo fluxo de
    // print, onde a aposta deve ficar com a hora da foto e não a do clique.
    if (action === 'planilhar' || action === 'planilhar_ts') {
      if (!text) {
        await ctx.answerCbQuery('❌ Não consegui ler o texto da mensagem.');
        return;
      }
      const isTs = action === 'planilhar_ts';
      // No card de print o args[0] é o timestamp da foto; o tipId (quando o
      // usuário confirmou que é a mesma aposta de uma pendência) vem em
      // args[2]. No card de tip o tipId continua sendo o args[0].
      const linkTipId = isTs ? (args[2] ?? undefined) : (tipId ?? undefined);
      const previewMessage = msg as Message.TextMessage;
      const original = previewMessage.reply_to_message;
      const isAudio = original && ('voice' in original || 'audio' in original);
      // Clique duplo no mesmo card criaria duas apostas: a checagem por tip
      // ainda não vê nada gravado quando o segundo callback entra.
      const lock = `planilhar:${previewMessage.chat.id}:${msg.message_id}`;
      if (this.inFlight.has(lock)) {
        await ctx.answerCbQuery('⏳ Já estou planilhando essa aposta.');
        return;
      }
      this.inFlight.add(lock);
      try {
        if (isTs && linkTipId) {
          const user = await this.usersService.findByTelegramUserId(
            ctx.from.id,
          );
          const existing =
            user && (await this.betService.findBetByTip(linkTipId, user.id));
          if (existing) {
            await ctx.answerCbQuery('✅ Essa pendência já está planilhada.');
            return;
          }
        }
        await this.betTextService.processBetText(
          ctx,
          text,
          msg.message_id,
          linkTipId,
          isTs && tipId ? new Date(tipId * 1000) : undefined,
          {
            source: 'telegram',
            sourceType: isTs
              ? args[1] === 2 || isAudio
                ? 'audio'
                : 'image'
              : 'text',
            telegramMessageId:
              (isTs ? original?.message_id : undefined) ??
              previewMessage.message_id,
            telegramChatId: String(previewMessage.chat.id),
          },
        );
        // Só o caminho "print vinculado a uma pendência" ganha Ver aposta /
        // Desfazer — é o único onde a confirmação do usuário tirou algo do
        // /pendentes e pode precisar ser revertida.
        const vinculado = isTs && !!linkTipId;
        const novoTexto = vinculado
          ? `✅ PLANILHADO (pendência vinculada)\n\n${text}`
          : `✅ PLANILHADO\n\n${text}`;
        const doneKeyboard = vinculado
          ? {
              inline_keyboard: [
                [{ text: '📊 Ver aposta', url: BETS_URL }],
                [
                  {
                    text: '↩️ Desfazer',
                    callback_data: `img_desfazer:${tipId ?? 0}:${args[1] ?? 1}:${linkTipId}`,
                  },
                ],
              ],
            }
          : {
              inline_keyboard: [
                [{ text: '✅ Planilhado', callback_data: 'done' }],
              ],
            };
        if (isMedia)
          await ctx.editMessageCaption(novoTexto, {
            reply_markup: doneKeyboard,
          });
        else
          await ctx.editMessageText(novoTexto, { reply_markup: doneKeyboard });
        await ctx.answerCbQuery('✅ Planilhado!');
      } catch (err) {
        console.error('❌ Erro ao planilhar via callback:', err);
        await ctx.answerCbQuery(
          '❌ Erro ao planilhar. Veja o chat para detalhes.',
        );
      } finally {
        this.inFlight.delete(lock);
      }
      return;
    }

    // Desfazer do card de print vinculado: apaga a aposta criada, a tip volta
    // pro /pendentes e o card volta a oferecer as duas opções.
    if (action === 'img_desfazer') {
      const [timestamp, sourceType, linkTipId] = args;
      if (!linkTipId || !text) {
        await ctx.answerCbQuery('❌ Referência inválida.');
        return;
      }
      const user = await this.usersService.findByTelegramUserId(ctx.from.id);
      if (!user) {
        await ctx.answerCbQuery('❌ Conta não vinculada.');
        return;
      }
      const lock = `img_desfazer:${msg.chat.id}:${msg.message_id}`;
      if (this.inFlight.has(lock)) {
        await ctx.answerCbQuery('⏳ Já estou desfazendo.');
        return;
      }
      this.inFlight.add(lock);
      try {
        const removed = await this.betService.deleteBetByTip(
          linkTipId,
          user.id,
        );
        const restaurado = text.replace(/^✅ PLANILHADO[^\n]*\n\n/, '');
        const keyboard = {
          inline_keyboard: [
            [
              {
                text: '🔁 Sim — vincular à pendência',
                callback_data: `planilhar_ts:${timestamp}:${sourceType}:${linkTipId}`,
              },
            ],
            [
              {
                text: '🆕 Não — planilhar como nova',
                callback_data: `planilhar_ts:${timestamp}:${sourceType}`,
              },
            ],
          ],
        };
        if (isMedia)
          await ctx.editMessageCaption(restaurado, { reply_markup: keyboard });
        else await ctx.editMessageText(restaurado, { reply_markup: keyboard });
        await ctx.answerCbQuery(
          removed
            ? '↩️ Aposta removida e pendência de volta.'
            : '❌ A aposta não está mais lá — talvez já tenha sido apagada.',
        );
      } catch (err) {
        console.error('❌ Erro ao desfazer print vinculado:', err);
        await ctx.answerCbQuery('❌ Não deu pra desfazer.');
      } finally {
        this.inFlight.delete(lock);
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
        await ctx.reply(
          `${preamble}<blockquote expandable>${escapeHtml(text)}</blockquote>`,
          {
            parse_mode: 'HTML',
            reply_markup: { force_reply: true },
            link_preview_options: { is_disabled: true },
          },
        );
      } catch (err) {
        console.error(
          '⚠️ Falha ao mandar prompt de edição com blockquote, caindo pra texto simples:',
          err,
        );
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
        if (isMedia)
          await ctx.editMessageCaption(novoTexto, {
            reply_markup: {
              inline_keyboard: [
                [{ text: '↩️ Voltar', callback_data: voltarData }],
              ],
            },
          });
        else
          await ctx.editMessageText(novoTexto, {
            reply_markup: {
              inline_keyboard: [
                [{ text: '↩️ Voltar', callback_data: voltarData }],
              ],
            },
          });
        if (tipId !== null) {
          const user = await this.usersService.findByTelegramUserId(
            ctx.from.id,
          );
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
        if (isMedia)
          await ctx.editMessageCaption(restaurado, {
            reply_markup: this.tipFanoutService.tipsCopyKeyboard(
              tipId ?? undefined,
            ),
          });
        else
          await ctx.editMessageText(restaurado, {
            reply_markup: this.tipFanoutService.tipsCopyKeyboard(
              tipId ?? undefined,
            ),
          });
        if (tipId !== null) {
          const user = await this.usersService.findByTelegramUserId(
            ctx.from.id,
          );
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
        const { text: summaryText, keyboard } =
          await this.pendentesService.buildMessage(user, page);
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
    if (
      action === 'lista_planilhar' ||
      action === 'lista_caiu' ||
      action === 'lista_editar'
    ) {
      if (tipId === null || !Number.isInteger(tipId) || tipId <= 0) {
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
        const sent = await this.tipFanoutService.resendTipCard(user, tipId);
        await ctx.answerCbQuery(
          sent ? '📤 Reenviado! Edita por lá.' : '❌ Tip não encontrada.',
        );
        return;
      }

      const lock = `${user.id}:${tipId}`;
      if (this.inFlight.has(lock)) {
        await ctx.answerCbQuery('⏳ Já estou processando esse item.');
        return;
      }
      this.inFlight.add(lock);
      let undo: Parameters<PendentesService['buildMessage']>[2];
      try {
        const tip = await this.tipsService.findById(tipId);
        if (!tip) {
          await ctx.answerCbQuery('❌ Tip não encontrada.');
          return;
        }
        const label = extractGameFromText(tip.text) ?? `#${tipId}`;

        // Item ja resolvido (clique numa lista antiga, ou segundo clique
        // depois do commit): nao cria nada de novo, so recarrega a lista.
        const existing = await this.betService.findBetByTip(tipId, user.id);
        if (existing) {
          await ctx.answerCbQuery(`✅ ${label} já está planilhada.`);
          await this.refreshList(ctx, user, page);
          return;
        }

        if (action === 'lista_caiu') {
          const marked = await this.tipsService.dismissTip(tipId, user.id);
          await this.tipFanoutService.markDeliveredMessage(user, tipId, 'caiu');
          await ctx.answerCbQuery(
            marked ? `❌ ${label}: marcada como caiu.` : 'Já estava marcada.',
          );
          if (marked) undo = { tipId, kind: 'caiu', label };
        } else {
          try {
            // msg aqui é a mensagem-lista do /pendentes, não a tip entregue no
            // DM do usuário — usa o messageId salvo em saveDelivery (a cópia
            // individual que o usuário recebeu) pra confirmação sair como
            // reply da aposta, e não da lista. Sem delivery salva (tip antiga),
            // cai pro comportamento anterior em vez de não responder nada.
            const delivery = await this.tipsService.findDelivery(
              tipId,
              user.id,
            );
            await this.betTextService.processBetText(
              ctx,
              tip.text,
              delivery?.messageId ?? msg.message_id,
              tipId,
            );
            await this.tipFanoutService.markDeliveredMessage(
              user,
              tipId,
              'planilhado',
            );
            await ctx.answerCbQuery(`✅ ${label} planilhada!`);
            undo = { tipId, kind: 'planilhar', label };
          } catch (err) {
            // processBetText ja respondeu no chat com o motivo; o toast so
            // aponta pra la, mas o log guarda a causa.
            console.error('❌ Erro ao planilhar do /pendentes:', err);
            await ctx.answerCbQuery(
              `❌ ${label}: não deu pra planilhar. Veja a resposta no chat.`,
            );
            return;
          }
        }
      } finally {
        this.inFlight.delete(lock);
      }

      await this.refreshList(ctx, user, page, undo);
      return;
    }

    // Desfazer da ultima acao da lista: apaga a aposta criada ou remove a
    // marcacao de caiu — nos dois casos a tip volta a aparecer em /pendentes.
    if (action === 'lista_desfazer') {
      if (tipId === null || !Number.isInteger(tipId) || tipId <= 0) {
        await ctx.answerCbQuery('❌ Referência inválida.');
        return;
      }
      const page = args[1] ?? 0;
      const wasCaiu = args[2] === 1;
      const user = await this.usersService.findByTelegramUserId(ctx.from.id);
      if (!user) {
        await ctx.answerCbQuery('❌ Conta não vinculada.');
        return;
      }
      const lock = `${user.id}:${tipId}`;
      if (this.inFlight.has(lock)) {
        await ctx.answerCbQuery('⏳ Já estou processando esse item.');
        return;
      }
      this.inFlight.add(lock);
      try {
        if (wasCaiu) {
          await this.tipsService.undismissTip(tipId, user.id);
          await ctx.answerCbQuery('↩️ Voltou pra pendentes.');
        } else {
          const removed = await this.betService.deleteBetByTip(tipId, user.id);
          await ctx.answerCbQuery(
            removed
              ? '↩️ Aposta removida e tip de volta em pendentes.'
              : '❌ A aposta não está mais lá — talvez já tenha sido apagada.',
          );
        }
      } catch (err) {
        console.error('❌ Erro ao desfazer:', err);
        await ctx.answerCbQuery('❌ Não deu pra desfazer.');
      } finally {
        this.inFlight.delete(lock);
      }
      await this.refreshList(ctx, user, page);
      return;
    }
  }
}

import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { TipsService } from '../tips/tips.service';
import { BetTextService } from './bet-text.service';
import { TipFanoutService } from './tip-fanout.service';
import { PendentesService } from './pendentes.service';
import {
  EDIT_PROMPT_INSTRUCTIONS,
  escapeHtml,
  extractHouseFromText,
  extractLimitFromText,
  extractOddFromText,
  parseCallbackAction,
} from './tip-parsing.util';

// Dispatcher de callback_query: os botões da cópia individual (Planilhar /
// Editar / Aposta Caiu / Voltar) e os da lista compacta do /pendentes
// (lista_planilhar / lista_caiu / lista_editar / lista_pagina).
@Injectable()
export class TelegramCallbackService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tipsService: TipsService,
    private readonly betTextService: BetTextService,
    private readonly tipFanoutService: TipFanoutService,
    private readonly pendentesService: PendentesService,
  ) {}

  async handle(ctx: any) {
    const query = ctx.callbackQuery as any;
    const msg = query.message;
    const text: string | undefined = msg?.text ?? msg?.caption;
    const isMedia = !!msg?.photo;
    const { action, args } = parseCallbackAction(query.data as string);
    const tipId = args[0] ?? null;

    if (action === 'noop') {
      await ctx.answerCbQuery();
      return;
    }

    if (action === 'planilhar') {
      if (!text) {
        await ctx.answerCbQuery('❌ Não consegui ler o texto da mensagem.');
        return;
      }
      try {
        await this.betTextService.processBetText(ctx, text, msg.message_id, tipId ?? undefined);
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
        if (isMedia) await ctx.editMessageCaption(novoTexto, { reply_markup: { inline_keyboard: [[{ text: '↩️ Voltar', callback_data: voltarData }]] } });
        else await ctx.editMessageText(novoTexto, { reply_markup: { inline_keyboard: [[{ text: '↩️ Voltar', callback_data: voltarData }]] } });
        if (tipId !== null) {
          const user = await this.usersService.findByTelegramUserId(ctx.from.id);
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
        if (isMedia) await ctx.editMessageCaption(restaurado, { reply_markup: this.tipFanoutService.tipsCopyKeyboard(tipId ?? undefined) });
        else await ctx.editMessageText(restaurado, { reply_markup: this.tipFanoutService.tipsCopyKeyboard(tipId ?? undefined) });
        if (tipId !== null) {
          const user = await this.usersService.findByTelegramUserId(ctx.from.id);
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
        const { text: summaryText, keyboard } = await this.pendentesService.buildMessage(user, page);
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
    if (action === 'lista_planilhar' || action === 'lista_caiu' || action === 'lista_editar') {
      if (tipId === null) {
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
        await ctx.answerCbQuery(sent ? '📤 Reenviado! Edita por lá.' : '❌ Tip não encontrada.');
        return;
      }

      if (action === 'lista_caiu') {
        await this.tipsService.dismissTip(tipId, user.id);
        await this.tipFanoutService.markDeliveredMessage(user, tipId, 'caiu');
        await ctx.answerCbQuery('❌ Marcado como caiu.');
      } else {
        const tip = await this.tipsService.findById(tipId);
        if (!tip) {
          await ctx.answerCbQuery('❌ Tip não encontrada.');
          return;
        }
        try {
          await this.betTextService.processBetText(ctx, tip.text, msg.message_id, tipId);
          await this.tipFanoutService.markDeliveredMessage(user, tipId, 'planilhado');
          await ctx.answerCbQuery('✅ Planilhado!');
        } catch {
          await ctx.answerCbQuery('❌ Erro ao planilhar. Veja a mensagem no chat.');
          return;
        }
      }

      try {
        const { text: summaryText, keyboard } = await this.pendentesService.buildMessage(user, page);
        await ctx.editMessageText(summaryText, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          reply_markup: keyboard,
        });
      } catch (err) {
        console.error('❌ Erro ao atualizar lista de pendentes:', err);
      }
      return;
    }
  }
}

import type { Context } from 'telegraf';
import type { InlineKeyboardMarkup, Message } from 'telegraf/types';

// O contexto do Telegraf é uma união de todo tipo de update. Os handlers do
// bot eram `ctx: any`, e qualquer erro de nome de campo só aparecia em
// produção. Estes helpers fazem o estreitamento num lugar só.
export type BotContext = Context;

/** Texto da mensagem que disparou o update ('' quando não há texto). */
export function messageText(ctx: Context): string {
  const message = ctx.message;
  return message && 'text' in message ? message.text : '';
}

/** Argumentos de um comando: "/stake 1500" → ["1500"]. */
export function commandArgs(ctx: Context): string[] {
  return messageText(ctx).trim().split(/\s+/).slice(1);
}

/** callback_data do botão clicado (undefined fora de callback_query). */
export function callbackData(ctx: Context): string | undefined {
  const query = ctx.callbackQuery;
  return query && 'data' in query ? query.data : undefined;
}

/**
 * Id do Telegram de quem mandou. Os handlers só rodam pra update de usuário
 * (comando, mensagem, botão), que sempre traz `from`.
 */
export function senderId(ctx: Context): number {
  if (!ctx.from) throw new Error('Update sem remetente');
  return ctx.from.id;
}

/**
 * A mensagem onde está o botão clicado, com os campos que os handlers leem.
 * O Telegraf tipa como "talvez inacessível" (mensagem antiga demais); pro
 * bot, sem mensagem é o mesmo que sem texto.
 */
export interface CallbackMessage {
  message_id: number;
  date: number;
  chat: { id: number };
  text?: string;
  caption?: string;
  photo?: unknown[];
  reply_to_message?: Message & { voice?: unknown; audio?: unknown; photo?: unknown[]; caption?: string; from?: { id: number } };
  reply_markup?: InlineKeyboardMarkup;
}

export function callbackMessage(ctx: Context): CallbackMessage | undefined {
  const query = ctx.callbackQuery;
  if (!query || !('message' in query) || !query.message || query.message.date === 0) return undefined;
  return query.message as unknown as CallbackMessage;
}

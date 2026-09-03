import { Telegraf } from 'telegraf';

export const TELEGRAM_BOT = 'TELEGRAM_BOT';

export function createTelegramBot(): Telegraf {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('❌ TELEGRAM_BOT_TOKEN não definido no .env');
  return new Telegraf(token);
}

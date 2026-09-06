// Execute após disponibilizar a URL pública, nunca em cada cold start/preview build.
require('dotenv').config();
const { Telegram } = require('telegraf');

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.APP_URL;
  if (!token || !appUrl)
    throw new Error('Defina TELEGRAM_BOT_TOKEN e APP_URL.');
  const url = new URL(appUrl);
  if (url.protocol !== 'https:') throw new Error('APP_URL precisa usar HTTPS.');
  const startedAt = performance.now();
  await new Telegram(token).setWebhook(
    `${appUrl.replace(/\/$/, '')}/telegram/${token}`,
  );
  console.log(
    `[TELEGRAM_SETUP] webhook_registered=true duration_ms=${Math.round(performance.now() - startedAt)}`,
  );
}

main().catch((error) => {
  // Não imprimir URL/objeto do erro: ambos podem conter o token do bot.
  console.error(
    'Falha ao registrar webhook:',
    error?.response?.description ?? 'Verifique configuração e conectividade.',
  );
  process.exitCode = 1;
});

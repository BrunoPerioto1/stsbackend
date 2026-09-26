// Execute após disponibilizar a URL pública, nunca em cada cold start/preview build.
require('dotenv').config();
const { Telegram } = require('telegraf');

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.APP_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !appUrl || !secret)
    throw new Error('Defina TELEGRAM_BOT_TOKEN, APP_URL e TELEGRAM_WEBHOOK_SECRET.');
  // O Telegram só aceita 1-256 caracteres de A-Z, a-z, 0-9, _ e -.
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(secret))
    throw new Error('TELEGRAM_WEBHOOK_SECRET: 16 a 256 caracteres, só letras, números, _ e -.');
  const url = new URL(appUrl);
  if (url.protocol !== 'https:') throw new Error('APP_URL precisa usar HTTPS.');
  const startedAt = performance.now();
  // O token do bot não vai mais na URL (aparecia nos logs da Vercel): quem
  // autentica o update é o secret_token, que o Telegram manda em header.
  await new Telegram(token).setWebhook(`${appUrl.replace(/\/$/, '')}/telegram`, {
    secret_token: secret,
  });
  console.log(
    `[TELEGRAM_SETUP] webhook_registered=true duration_ms=${Math.round(performance.now() - startedAt)}`,
  );
}

main().catch((error) => {
  // Não imprimir URL/objeto do erro: podem conter token ou segredo.
  console.error(
    'Falha ao registrar webhook:',
    error?.response?.description ?? error?.message ?? 'Verifique configuração e conectividade.',
  );
  process.exitCode = 1;
});

import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { pixBrCode, pixTxid } from './pix';
import { createPayToken } from './pay-token';

type AccessFields = {
  isActive: boolean | null;
  accessUntil: Date | null;
  // Opcionais: só quem tem a linha inteira do usuário (login, JWT) manda. É o
  // que deixa a tela diferenciar conta nova de acesso vencido e gerar o PIX.
  id?: number;
  createdAt?: Date | null;
};

const DAY_MS = 86_400_000;

/**
 * 'new' = nunca teve acesso pago: o vencimento ainda é o da criação (com
 * TRIAL_DAYS=0 a conta já nasce vencida). A tela dizia "Seu acesso venceu" a
 * quem acabou de se cadastrar; o certo é "Ative sua conta".
 */
export function accessStatus(user: AccessFields): 'new' | 'expired' {
  if (!user.accessUntil || !user.createdAt) return 'expired';
  const trialEnd =
    new Date(user.createdAt).getTime() + Number(process.env.TRIAL_DAYS ?? 0) * DAY_MS;
  return new Date(user.accessUntil).getTime() <= trialEnd + 60_000 ? 'new' : 'expired';
}

// Cobrança é PIX manual: o admin confere o pagamento e empurra o vencimento.
// Aqui só se lê a coluna — quem venceu fica de fora até o próximo "+30 dias".
export function assertAccess(user: AccessFields): void {
  if (user.isActive === false) {
    throw new ForbiddenException('Conta desativada');
  }
  if (user.accessUntil && new Date(user.accessUntil).getTime() <= Date.now()) {
    const status = accessStatus(user);
    throw new HttpException(
      {
        message:
          status === 'new'
            ? 'Ative sua conta pelo PIX para começar.'
            : 'Seu acesso venceu. Renove pelo PIX para continuar.',
        code: 'ACCESS_EXPIRED',
        status,
        accessUntil: new Date(user.accessUntil).toISOString(),
        // A tela de renovação não tem sessão: é com isto que ela pede o PIX
        // desta conta e avisa "Já paguei".
        payToken: user.id ? createPayToken(user.id) : undefined,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

export function hasAccess(user: AccessFields): boolean {
  try {
    assertAccess(user);
    return true;
  } catch {
    return false;
  }
}

// Vencido conta a partir de agora; em dia, soma no vencimento atual — quem paga
// adiantado não perde os dias que ainda tinha.
export function extendAccess(current: Date | null, days: number): Date {
  const base =
    current && new Date(current).getTime() > Date.now()
      ? new Date(current)
      : new Date();
  return new Date(base.getTime() + days * 86_400_000);
}

const spDate = (d: Date) =>
  d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// Dias de calendário (fuso SP) entre hoje e o vencimento: 0 = vence hoje.
export function daysUntil(date: Date, now = new Date()): number {
  return Math.round(
    (Date.parse(spDate(new Date(date))) - Date.parse(spDate(now))) / 86_400_000,
  );
}

/**
 * Chave e preço; com o usuário, também o PIX copia-e-cola com valor e o txid
 * dele — o pagamento chega identificado em vez de o admin adivinhar pelo nome.
 */
export function billingInfo(userId?: number) {
  const pixKey = process.env.PIX_KEY || null;
  const price = process.env.ACCESS_PRICE ? Number(process.env.ACCESS_PRICE) : null;
  const txid = userId ? pixTxid(userId) : null;
  return {
    pixKey,
    price,
    txid,
    pixCode:
      pixKey && txid
        ? pixBrCode({
            key: pixKey,
            amount: price,
            txid,
            merchantName: process.env.PIX_MERCHANT_NAME || 'SportsBet Manager',
            merchantCity: process.env.PIX_MERCHANT_CITY || 'Sao Paulo',
          })
        : null,
  };
}

// Valor + chave + como volta: vai no lembrete do cron e na resposta do bot a
// quem está vencido. Markdown (a chave vai em `code` pra copiar com um toque).
export function billingPayLine(userId?: number): string {
  const { pixKey, price, txid } = billingInfo(userId);
  return [
    price ? `Valor: R$ ${price.toFixed(2).replace('.', ',')}` : null,
    pixKey ? `PIX: \`${pixKey}\`` : null,
    txid ? `Identificador: \`${txid}\` (já vai no PIX copia e cola)` : null,
    'O acesso é liberado assim que o pagamento for confirmado. Pagou? Toque em "Já paguei".',
  ]
    .filter(Boolean)
    .join('\n');
}

// Callback do "Já paguei" no bot. O porteiro de acesso deixa passar: é
// justamente quem está vencido que aperta.
export const PAYMENT_CLAIM_CALLBACK = 'ja_paguei';

export function pixKeyboard(userId?: number) {
  const { pixKey, pixCode } = billingInfo(userId);
  if (!pixKey) return undefined;
  const rows: any[][] = [];
  if (pixCode) rows.push([{ text: '📋 Copiar PIX copia e cola', copy_text: { text: pixCode } }]);
  rows.push([{ text: '🔑 Copiar chave PIX', copy_text: { text: pixKey } }]);
  if (userId) rows.push([{ text: '✅ Já paguei', callback_data: PAYMENT_CLAIM_CALLBACK }]);
  return { inline_keyboard: rows };
}

export type AccessBlock = 'inactive' | 'expired' | null;

// Motivo do bloqueio sem exceção HTTP — o bot responde diferente para cada um.
export function accessBlock(user: AccessFields): AccessBlock {
  if (user.isActive === false) return 'inactive';
  if (user.accessUntil && new Date(user.accessUntil).getTime() <= Date.now())
    return 'expired';
  return null;
}

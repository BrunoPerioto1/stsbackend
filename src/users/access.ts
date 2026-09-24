import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';

type AccessFields = { isActive: boolean | null; accessUntil: Date | null };

// Cobrança é PIX manual: o admin confere o pagamento e empurra o vencimento.
// Aqui só se lê a coluna — quem venceu fica de fora até o próximo "+30 dias".
export function assertAccess(user: AccessFields): void {
  if (user.isActive === false) {
    throw new ForbiddenException('Conta desativada');
  }
  if (user.accessUntil && new Date(user.accessUntil).getTime() <= Date.now()) {
    throw new HttpException(
      {
        message: 'Seu acesso venceu. Renove pelo PIX para continuar.',
        code: 'ACCESS_EXPIRED',
        accessUntil: new Date(user.accessUntil).toISOString(),
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

export function billingInfo() {
  return {
    pixKey: process.env.PIX_KEY ?? null,
    price: process.env.ACCESS_PRICE ? Number(process.env.ACCESS_PRICE) : null,
  };
}

// Valor + chave + como volta: vai no lembrete do cron e na resposta do bot a
// quem está vencido. Markdown (a chave vai em `code` pra copiar com um toque).
export function billingPayLine(): string {
  const { pixKey, price } = billingInfo();
  return [
    price ? `Valor: R$ ${price.toFixed(2).replace('.', ',')}` : null,
    pixKey ? `PIX: \`${pixKey}\`` : null,
    'O acesso é liberado assim que o pagamento for confirmado.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function pixKeyboard() {
  const { pixKey } = billingInfo();
  return pixKey
    ? {
        inline_keyboard: [
          [{ text: '📋 Copiar PIX', copy_text: { text: pixKey } } as any],
        ],
      }
    : undefined;
}

export type AccessBlock = 'inactive' | 'expired' | null;

// Motivo do bloqueio sem exceção HTTP — o bot responde diferente para cada um.
export function accessBlock(user: AccessFields): AccessBlock {
  if (user.isActive === false) return 'inactive';
  if (user.accessUntil && new Date(user.accessUntil).getTime() <= Date.now())
    return 'expired';
  return null;
}

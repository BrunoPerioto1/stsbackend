import { BadRequestException } from '@nestjs/common';

/**
 * Link do site de uma casa. Só entra domínio `.bet.br`: é o domínio que a
 * SPA/MF reserva pras casas com autorização federal — "betano.com" ou
 * "vbet.bet" seriam sites fora da regulamentação (ou golpe se passando por ela).
 *
 * Aceita digitar sem protocolo ("betano.bet.br") e sempre grava https.
 * Vazio/null devolve null, que apaga o link.
 */
export function normalizeFederalHouseUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new BadRequestException('Link inválido');
  }

  const host = url.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(url.protocol) || !host.endsWith('.bet.br') || host === 'bet.br') {
    throw new BadRequestException('Só casas federais: o link precisa ser um domínio .bet.br');
  }

  url.protocol = 'https:';
  const path = url.pathname === '/' ? '' : url.pathname;
  return `${url.protocol}//${url.host}${path}${url.search}`;
}

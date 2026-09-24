import { BadRequestException } from '@nestjs/common';

/**
 * Casas que operam por decisão judicial em vez de portaria: a SPA/MF dá a elas
 * os mesmos direitos de uma autorizada, mas elas não recebem domínio .bet.br.
 * Lista fechada de propósito — liberar qualquer domínio abriria espaço pra site
 * clone. Entra aqui só domínio conferido à mão.
 */
export const JUDICIAL_HOUSE_HOSTS = ['zeroum.bet', 'www.zeroum.bet'];

/**
 * Link do site de uma casa. Só entra domínio `.bet.br`: é o domínio que a
 * SPA/MF reserva pras casas com autorização federal — "betano.com" ou
 * "vbet.bet" seriam sites fora da regulamentação (ou golpe se passando por ela).
 * A exceção são as casas de JUDICIAL_HOUSE_HOSTS.
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
  const federal = host.endsWith('.bet.br') && host !== 'bet.br';
  if (!['http:', 'https:'].includes(url.protocol) || !(federal || JUDICIAL_HOUSE_HOSTS.includes(host))) {
    throw new BadRequestException('Só casas federais: o link precisa ser um domínio .bet.br');
  }

  url.protocol = 'https:';
  const path = url.pathname === '/' ? '' : url.pathname;
  return `${url.protocol}//${url.host}${path}${url.search}`;
}

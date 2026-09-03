import { ResultIdEnum } from '../../bet/dto/result-id.enum';

export function calculateProfit(
  resultId: ResultIdEnum,
  stake: number,
  odd: number,
  cashoutValue?: number,
): number {
  switch (resultId) {
    case ResultIdEnum.WON:
      return stake * (odd - 1);
    case ResultIdEnum.LOST:
      return -stake;
    case ResultIdEnum.HALF_WON:
      return (stake / 2) * (odd - 1);
    case ResultIdEnum.HALF_LOST:
      return -(stake / 2);
    case ResultIdEnum.CASHOUT:
      return (cashoutValue ?? 0) - stake;
    case ResultIdEnum.CANCELED:
    case ResultIdEnum.PENDING:
      return 0;
    default:
      return 0;
  }
}

const BR_UTC_OFFSET_HOURS = 3; // America/Sao_Paulo is fixed at UTC-3 (no DST since 2019)

/**
 * Given a Date representing a calendar day (as parsed from a "yyyy-MM-dd"
 * string, i.e. UTC midnight of that day), returns 00:00 America/Sao_Paulo
 * of that same civil day. Use with `>=` so 31/08 21:00–23:59 BRT is not
 * pulled into a "September" filter.
 */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(BR_UTC_OFFSET_HOURS, 0, 0, 0);
  return d;
}

/**
 * Given a Date representing a calendar day (as parsed from a "yyyy-MM-dd"
 * string, i.e. UTC midnight of that day), returns the UTC instant of the
 * start of the *next* day in America/Sao_Paulo. Use with an exclusive `<`
 * comparison so the whole day — including bets placed late at night in
 * Brazil time — is included in an "up to endDate" filter.
 */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(BR_UTC_OFFSET_HOURS, 0, 0, 0);
  return d;
}

export function formatPeriod(startDate?: string, endDate?: string): string {
  if (!startDate && !endDate) {
    return 'Todo o período';
  }
  if (startDate && endDate) {
    const start = new Date(startDate).toLocaleDateString('pt-BR');
    const end = new Date(endDate).toLocaleDateString('pt-BR');
    return `${start} a ${end}`;
  }
  if (startDate) {
    const start = new Date(startDate).toLocaleDateString('pt-BR');
    return `A partir de ${start}`;
  }
  if (endDate) {
    const end = new Date(endDate).toLocaleDateString('pt-BR');
    return `Até ${end}`;
  }
  return 'Período não especificado';
}

export function normalizeName(name?: string): string {
  const value = (name ?? '').toString();
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .trim()
    .toUpperCase();
}
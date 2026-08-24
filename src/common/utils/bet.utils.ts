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

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
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
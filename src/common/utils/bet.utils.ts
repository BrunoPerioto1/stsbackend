import { ResultIdEnum } from '../../bet/dto/result-id.enum';

export function calculateProfit(
  resultId: ResultIdEnum,
  stake: number,
  odd: number,
): number {
  switch (resultId) {
    case ResultIdEnum.WON:
      return stake * (odd - 1);
    case ResultIdEnum.LOST:
      return -stake;
    case ResultIdEnum.CANCELED:
    case ResultIdEnum.PENDING:
      return 0;
    default:
      return 0;
  }
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

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

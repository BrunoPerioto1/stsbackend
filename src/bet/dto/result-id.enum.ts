export enum ResultIdEnum {
  WON = 1,
  LOST = 2,
  CANCELED = 3,
  HALF_WON = 4,
  HALF_LOST = 5,
  CASHOUT = 6,
  PENDING = 9,
}

// Grupos usados nas metricas (dashboard, casas, ranking). CASHOUT e' liquidada
// mas nao entra em ganha/perdida: a taxa de acerto e' ganhas / (ganhas + perdidas).
export const WON_RESULT_IDS = [ResultIdEnum.WON, ResultIdEnum.HALF_WON];
export const LOST_RESULT_IDS = [ResultIdEnum.LOST, ResultIdEnum.HALF_LOST];
export const SETTLED_RESULT_IDS = [...WON_RESULT_IDS, ...LOST_RESULT_IDS, ResultIdEnum.CASHOUT];

import type { ColumnType, Insertable, Selectable } from 'kysely';
import type { BetId } from './Bet';

// Um evento por confronto de uma múltipla de vários jogos, na ordem do mercado.
// Confronto que não casou não tem linha. Ver migrations/20260915_bet_events.sql.
export default interface BetEventsTable {
  betId: ColumnType<BetId, BetId, never>;
  position: ColumnType<number, number, never>;
  confronto: string;
  provider: string;
  externalId: string;
  startAt: Date;
  // NUMERIC chega do pg como string.
  matchConfidence: ColumnType<string, number, number>;
}

export type BetEvent = Selectable<BetEventsTable>;
export type NewBetEvent = Insertable<BetEventsTable>;

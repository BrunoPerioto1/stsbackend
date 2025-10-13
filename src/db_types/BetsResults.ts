import type { ColumnType, Insertable, Selectable, Updateable } from "kysely";
import type { BetId } from "./Bet";
import type { ResultId } from "./Results";

export type BetResultId = number & { __type: 'BetResultId' };

export default interface BetResultsTable {
  id: ColumnType<BetResultId, BetResultId | undefined, never>;
  bet_id: ColumnType<BetId, BetId, BetId>;
  result_id: ColumnType<ResultId, ResultId | undefined, ResultId>; // DEFAULT 9 = PENDING
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type BetResult = Selectable<BetResultsTable>;      // SELECT
export type NewBetResult = Insertable<BetResultsTable>;   // INSERT
export type UpdateBetResult = Updateable<BetResultsTable>; // UPDATE
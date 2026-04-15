import type { ColumnType, Insertable, Selectable, Updateable } from "kysely";
import type { BetId } from "./Bet";
import type { ResultId } from "./Results";

export type BetResultId = number & { __type: 'BetResultId' };

export default interface BetResultsTable {
  id: ColumnType<BetResultId, BetResultId | undefined, never>;
  betId: ColumnType<BetId, BetId, BetId>;
  resultId: ColumnType<ResultId, ResultId | undefined, ResultId>; // DEFAULT 9 = PENDING
  createdAt: ColumnType<Date, Date | undefined, never>;
  updatedAt: ColumnType<Date, Date | undefined, Date>;
}

export type BetResult = Selectable<BetResultsTable>;      // SELECT
export type NewBetResult = Insertable<BetResultsTable>;   // INSERT
export type UpdateBetResult = Updateable<BetResultsTable>; // UPDATE
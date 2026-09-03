import type { ColumnType, Insertable, Selectable, Updateable } from "kysely";
import type { TipId } from "./Tips";
import type { UserId } from "./Users";

export type TipDismissalId = number & { __type: "TipDismissalId" };

export default interface TipDismissalsTable {
  id: ColumnType<TipDismissalId, TipDismissalId | undefined, never>;
  tipId: ColumnType<TipId, TipId, never>;
  userId: ColumnType<UserId, UserId, never>;
  createdAt: ColumnType<Date, Date | undefined, never>;
}

export type TipDismissal = Selectable<TipDismissalsTable>;
export type NewTipDismissal = Insertable<TipDismissalsTable>;
export type UpdateTipDismissal = Updateable<TipDismissalsTable>;

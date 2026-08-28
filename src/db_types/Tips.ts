import type { ColumnType, Insertable, Selectable, Updateable } from "kysely";

export type TipId = number & { __type: "TipId" };

export interface TipEntity {
  type: string;
  offset: number;
  length: number;
  [key: string]: any;
}

export default interface TipsTable {
  id: ColumnType<TipId, TipId | undefined, never>;
  chatId: ColumnType<number, number, never>;
  messageId: ColumnType<number, number, never>;
  text: ColumnType<string, string, never>;
  percent: ColumnType<number | null, number | null, never>;
  isAviso: ColumnType<boolean, boolean, never>;
  hasMedia: ColumnType<boolean, boolean, never>;
  entities: ColumnType<TipEntity[] | null, string | null, never>;
  createdAt: ColumnType<Date, Date | undefined, never>;
}

export type Tip = Selectable<TipsTable>;
export type NewTip = Insertable<TipsTable>;
export type UpdateTip = Updateable<TipsTable>;

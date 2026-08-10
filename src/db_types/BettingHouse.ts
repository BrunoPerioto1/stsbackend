import type { ColumnType, Insertable, Selectable, Updateable } from "kysely";

export type BettingHouseId = number & { __type: 'BettingHouseId' };

export default interface BettingHousesTable {
  id: ColumnType<BettingHouseId, BettingHouseId | undefined, never>;
  name: ColumnType<string, string, string>;
  isActive: ColumnType<boolean, boolean | undefined, boolean>;
  createdAt: ColumnType<Date, Date | undefined, never>;
  updatedAt: ColumnType<Date, Date | undefined, Date>;
}

export type BettingHouse = Selectable<BettingHousesTable>;   // SELECT
export type NewBettingHouse = Insertable<BettingHousesTable>; // INSERT
export type UpdateBettingHouse = Updateable<BettingHousesTable>; // UPDATE

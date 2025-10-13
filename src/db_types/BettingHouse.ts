import type { ColumnType, Insertable, Selectable, Updateable } from "kysely";

export type BettingHouseId = number & { __type: 'BettingHouseId' };

export default interface BettingHousesTable {
  id: ColumnType<BettingHouseId, BettingHouseId | undefined, never>;
  name: ColumnType<string, string, string>;
  is_active: ColumnType<boolean, boolean | undefined, boolean>;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type BettingHouse = Selectable<BettingHousesTable>;   // SELECT
export type NewBettingHouse = Insertable<BettingHousesTable>; // INSERT
export type UpdateBettingHouse = Updateable<BettingHousesTable>; // UPDATE

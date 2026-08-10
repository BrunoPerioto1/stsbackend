import type { ColumnType, Insertable, Selectable, Updateable } from "kysely";
import type { BettingHouseId } from "./BettingHouse";
import type { UserId } from "./Users";

export type HouseBalanceId = number & { __type: "HouseBalanceId" };

export default interface HouseBalancesTable {
  id: ColumnType<HouseBalanceId, HouseBalanceId | undefined, never>;
  houseId: ColumnType<BettingHouseId, BettingHouseId, BettingHouseId>;
  userId: ColumnType<UserId, UserId, UserId>;
  value: ColumnType<number, number | undefined, number>;
  updatedAt: ColumnType<Date, Date | undefined, Date>;
}

export type HouseBalance = Selectable<HouseBalancesTable>;
export type NewHouseBalance = Insertable<HouseBalancesTable>;
export type UpdateHouseBalance = Updateable<HouseBalancesTable>;
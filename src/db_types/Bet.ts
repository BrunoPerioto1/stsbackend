import type { ColumnType, Insertable, Selectable, Updateable } from "kysely";
import type { BettingHouseId } from "./BettingHouse";
import type { UserId } from "./Users";

export type BetId = number & { __type: "BetId" };

export default interface BetsTable {
  id: ColumnType<BetId, BetId | undefined, never>;
  game: ColumnType<string, string, string>;
  stake: ColumnType<number, number, number>; // DECIMAL(10,2)
  odd: ColumnType<number, number, number>;   // DECIMAL(5,2)
  houseId: ColumnType<BettingHouseId | null, BettingHouseId | null, BettingHouseId | null>;
  market: ColumnType<string, string, string>;
  sport: ColumnType<string, string, string>;
  profit: ColumnType<number | null, number | null, number | null>;
  userId: ColumnType<UserId | null, UserId | null | undefined, UserId | null>;
  betTime: ColumnType<Date, Date | undefined, Date>;
  createdAt: ColumnType<Date, Date | undefined, never>;
  updatedAt: ColumnType<Date, Date | undefined, Date>;
}

export type Bet = Selectable<BetsTable>;
export type NewBet = Insertable<BetsTable>;
export type UpdateBet = Updateable<BetsTable>;

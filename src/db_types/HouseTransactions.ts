import type { ColumnType, Insertable, Selectable, Updateable } from "kysely";
import type { BettingHouseId } from "./BettingHouse";
import type { UserId } from "./Users";
import type { TransactionTypeId } from "./TransactionsTypes";

export type HouseTransactionId = number & { __type: "HouseTransactionId" };

export default interface HouseTransactionsTable {
  id: ColumnType<HouseTransactionId, HouseTransactionId | undefined, never>;
  houseId: ColumnType<BettingHouseId, BettingHouseId, BettingHouseId>;
  userId: ColumnType<UserId, UserId, UserId>;
  transactionTypeId: ColumnType<TransactionTypeId, TransactionTypeId, TransactionTypeId>;
  value: ColumnType<number, number, number>;
  description: ColumnType<string, string, string>;
  createdAt: ColumnType<Date, Date | undefined, never>;
  updatedAt: ColumnType<Date, Date | undefined, Date>;
}

export type HouseTransaction = Selectable<HouseTransactionsTable>;
export type NewHouseTransaction = Insertable<HouseTransactionsTable>;
export type UpdateHouseTransaction = Updateable<HouseTransactionsTable>;
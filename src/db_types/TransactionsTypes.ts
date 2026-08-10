import type { ColumnType, Insertable, Selectable, Updateable } from "kysely";

export type TransactionTypeId = number & { __type: 'TransactionTypeId' };

export default interface TransactionTypesTable {
  id: ColumnType<TransactionTypeId, TransactionTypeId | undefined, never>;
  name: ColumnType<string, string, string>;
}

export type TransactionType = Selectable<TransactionTypesTable>;      // SELECT
export type NewTransactionType = Insertable<TransactionTypesTable>;   // INSERT  
export type UpdateTransactionType = Updateable<TransactionTypesTable>; // UPDATE

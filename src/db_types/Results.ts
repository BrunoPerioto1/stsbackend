import type { ColumnType, Insertable, Selectable, Updateable } from "kysely";

export type ResultId = number & { __type: 'ResultId' };

export default interface ResultsTable {
  id: ColumnType<ResultId, ResultId | undefined, never>;
  name: ColumnType<string, string, string>;
}


export type Results = Selectable<ResultsTable>;      // SELECT
export type NewResults = Insertable<ResultsTable>;   // INSERT
export type UpdateResults = Updateable<ResultsTable>; // UPDATE

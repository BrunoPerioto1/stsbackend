import type { ColumnType, Selectable } from "kysely";

export type SportId = number & { __type: "SportId" };

export default interface SportsTable {
  id: ColumnType<SportId, SportId | undefined, never>;
  name: ColumnType<string, string, string>;
  aliases: ColumnType<string[], string[] | undefined, string[]>;
}

export type Sport = Selectable<SportsTable>;

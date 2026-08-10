import type { ColumnType, Insertable, Selectable, Updateable } from "kysely";

export type RoleId = number & { __type: 'RoleId' };

export default interface RolesTable {
  id: ColumnType<RoleId, RoleId | undefined, never>;
  name: ColumnType<string, string, string>;
  description: ColumnType<string | null, string | null, string | null>;
  permissions: ColumnType<string[] | null, string[] | null, string[] | null>; // JSONB como array de strings
  createdAt: ColumnType<Date, Date | undefined, never>;
  updatedAt: ColumnType<Date, Date | undefined, Date>;
}

export type Role = Selectable<RolesTable>;      // SELECT
export type NewRole = Insertable<RolesTable>;   // INSERT
export type UpdateRole = Updateable<RolesTable>; // UPDATE
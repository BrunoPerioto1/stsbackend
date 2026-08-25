import type { ColumnType, Insertable, Selectable, Updateable } from "kysely";
import type { RoleId } from "./Roles";

export type UserId = number & { __type: 'UserId' };

export default interface UsersTable {
  id: ColumnType<UserId, UserId | undefined, never>;
  username: ColumnType<string, string, string>;
  email: ColumnType<string, string, string>;
  passwordHash: ColumnType<string, string, string>;
  fullName: ColumnType<string | null, string | null, string | null>;
  isActive: ColumnType<boolean | null, boolean | null, boolean | null>;
  roleId: ColumnType<RoleId, RoleId, RoleId>;
  createdAt: ColumnType<Date, Date | undefined, never>;
  updatedAt: ColumnType<Date, Date | undefined, Date>;
  lastLogin: ColumnType<Date | null, Date | null, Date | null>;
  telegramUserId: ColumnType<number | null, number | null, number | null>; // bigint como number
  stake: ColumnType<number | null, number | null, number | null>; // NUMERIC como number
  minPercentFilter: ColumnType<number | null, number | null, number | null>; // NUMERIC; null = sem filtro
}

export type User = Selectable<UsersTable>;      // SELECT
export type NewUser = Insertable<UsersTable>;   // INSERT
export type UpdateUser = Updateable<UsersTable>; // UPDATE

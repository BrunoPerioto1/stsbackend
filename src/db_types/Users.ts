import type { ColumnType, Insertable, Selectable, Updateable } from "kysely";
import type { RoleId } from "./Roles";

export type UserId = number & { __type: 'UserId' };

export default interface UsersTable {
  id: ColumnType<UserId, UserId | undefined, never>;
  username: ColumnType<string, string, string>;
  email: ColumnType<string, string, string>;
  password_hash: ColumnType<string, string, string>;
  full_name: ColumnType<string | null, string | null, string | null>;
  is_active: ColumnType<boolean | null, boolean | null, boolean | null>;
  role_id: ColumnType<RoleId, RoleId, RoleId>;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date>;
  last_login: ColumnType<Date | null, Date | null, Date | null>;
  telegram_user_id: ColumnType<number | null, number | null, number | null>; // bigint como number
  stake: ColumnType<number | null, number | null, number | null>; // NUMERIC como number
}

export type User = Selectable<UsersTable>;      // SELECT
export type NewUser = Insertable<UsersTable>;   // INSERT
export type UpdateUser = Updateable<UsersTable>; // UPDATE

import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export type SportId = number & { __type: 'SportId' };

// Catálogo canônico de esportes. `aliases` guarda as variações que o parser
// devolve ("Soccer", "futebol", "NFL") e é o que casa o texto da aposta/tip
// com a linha certa — mesmo papel do aliases de betting_houses.
export default interface SportsTable {
  id: ColumnType<SportId, SportId | undefined, never>;
  name: ColumnType<string, string, string>;
  aliases: ColumnType<string[], string[] | undefined, string[]>;
  isActive: ColumnType<boolean, boolean | undefined, boolean>;
  createdAt: ColumnType<Date, Date | undefined, never>;
  updatedAt: ColumnType<Date, Date | undefined, Date>;
}

export type Sport = Selectable<SportsTable>;
export type NewSport = Insertable<SportsTable>;
export type UpdateSport = Updateable<SportsTable>;

import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export type SportEventId = number & { __type: 'SportEventId' };

// Cache de jogos futuros vindo do provider externo. Escrito pelo job em
// jobs/sofascore, so lido pela API. `provider` existe pra que trocar de fonte
// seja trocar o job, sem tocar no backend.
export default interface SportEventsTable {
  id: ColumnType<SportEventId, SportEventId | undefined, never>;
  provider: ColumnType<string, string, string>;
  externalId: ColumnType<string, string, never>;
  sport: ColumnType<string, string, string>;
  tournamentName: ColumnType<string | null, string | null, string | null>;
  // name/short/code sao os apelidos do proprio provider ("Manchester City",
  // "Man City", "MCI") — o matcher pontua contra os tres.
  homeName: ColumnType<string, string, string>;
  homeShort: ColumnType<string | null, string | null, string | null>;
  homeCode: ColumnType<string | null, string | null, string | null>;
  awayName: ColumnType<string, string, string>;
  awayShort: ColumnType<string | null, string | null, string | null>;
  awayCode: ColumnType<string | null, string | null, string | null>;
  startAt: ColumnType<Date, Date, Date>;
  status: ColumnType<string | null, string | null, string | null>;
  fetchedAt: ColumnType<Date, Date | undefined, Date>;
}

export type SportEvent = Selectable<SportEventsTable>;
export type NewSportEvent = Insertable<SportEventsTable>;
export type UpdateSportEvent = Updateable<SportEventsTable>;

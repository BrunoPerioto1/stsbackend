import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

// Placar de jogo terminado. Escrito pelo job em jobs/sofascore, so lido pela
// API. Separado de sport_events porque aquele e' cache de jogos futuros e se
// apaga 2 dias depois do jogo; o placar tem que durar enquanto houver aposta
// apontando pra ele.
export default interface EventResultsTable {
  provider: ColumnType<string, string, never>;
  externalId: ColumnType<string, string, never>;
  // Tempo normal (90min), nao o placar com prorrogacao.
  homeScore: ColumnType<number, number, number>;
  awayScore: ColumnType<number, number, number>;
  status: ColumnType<string, string, string>;
  fetchedAt: ColumnType<Date, Date | undefined, Date>;
}

export type EventResult = Selectable<EventResultsTable>;
export type NewEventResult = Insertable<EventResultsTable>;
export type UpdateEventResult = Updateable<EventResultsTable>;

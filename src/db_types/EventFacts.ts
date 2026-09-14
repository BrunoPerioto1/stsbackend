import type { ColumnType } from 'kysely';
export default interface EventFactsTable {
  provider: string;
  externalId: string;
  formatVersion: number;
  dataJson: ColumnType<unknown, string, string>;
  fetchedAt: ColumnType<Date, Date | undefined, Date>;
}

import type { ColumnType } from 'kysely';

// Contador por janela de tempo (ver migrations/20260926_rate_limit_hits.sql).
export default interface RateLimitHitsTable {
  bucket: ColumnType<string, string, string>;
  windowStart: ColumnType<Date, Date, Date>;
  hits: ColumnType<number, number | undefined, number>;
}

import type { ColumnType, Selectable } from 'kysely';
import type { TipTemplate } from '../tip-sources/tip-template';

export type TipSourceId = number & { __type: 'TipSourceId' };

// Fontes de tips e o modelo de cada uma. A tela /admin/sources escreve; o
// fan-out lê a cada mensagem do grupo Tips. Ver migrations/20261008_tip_sources.sql.
export default interface TipSourcesTable {
  id: ColumnType<TipSourceId, never, never>;
  name: ColumnType<string, string, string>;
  // JSONB: o pg devolve objeto; na escrita vai como string (JSON.stringify).
  template: ColumnType<TipTemplate, string, string>;
  sampleText: ColumnType<string | null, string | null | undefined, string | null>;
  isActive: ColumnType<boolean, boolean | undefined, boolean>;
  createdAt: ColumnType<Date, never, never>;
  // Só a API grava, sem trigger (mesma regra do scanner).
  updatedAt: ColumnType<Date, never, Date>;
}

export type TipSource = Selectable<TipSourcesTable>;

import type { ColumnType, Selectable } from 'kysely';
import type { SportId } from './Sports';

// O que o scanner do SofaScore acompanha e busca. A tela /admin/scanner escreve,
// os jobs em jobs/sofascore leem. Ver docs/scanner.md.
export default interface ScannerTournamentsTable {
  // Id do unique-tournament no SofaScore, digitado na tela: não é serial.
  id: ColumnType<number, number, never>;
  name: ColumnType<string, string, never>;
  sportId: ColumnType<SportId, SportId, never>;
  isActive: ColumnType<boolean, boolean | undefined, boolean>;
  statistics: ColumnType<boolean, boolean | undefined, boolean>;
  incidents: ColumnType<boolean, boolean | undefined, boolean>;
  lineups: ColumnType<boolean, boolean | undefined, boolean>;
  // Escritos só pelo collect.py.
  lastEvents: ColumnType<number | null, never, never>;
  lastEventsAt: ColumnType<Date | null, never, never>;
  lastCheckAt: ColumnType<Date | null, never, never>;
  lastCheckStatus: ColumnType<'ok' | 'invalid_id' | 'blocked' | 'error' | null, never, never>;
  // Resumo do último jogo encerrado, escrito por jobs/sofascore/amostra.py.
  sample: ColumnType<unknown, never, never>;
  sampleAt: ColumnType<Date | null, never, never>;
  createdAt: ColumnType<Date, never, never>;
  // Só a API grava, sem trigger: o coletor não pode mexer nele.
  updatedAt: ColumnType<Date, never, Date>;
}

export type ScannerTournament = Selectable<ScannerTournamentsTable>;

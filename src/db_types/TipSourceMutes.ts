import type { ColumnType } from 'kysely';
import type { TipSourceId } from './TipSources';
import type { UserId } from './Users';

// Fonte que o usuário desligou. Sem linha = recebe (fonte nova chega pra todos).
export default interface TipSourceMutesTable {
  userId: ColumnType<UserId, UserId, never>;
  sourceId: ColumnType<TipSourceId, TipSourceId, never>;
  createdAt: ColumnType<Date, never, never>;
}

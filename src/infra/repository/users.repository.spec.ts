import { UsersRepository } from './users.repository';
import type { UserId } from '../../db_types/Users';

// Transação falsa que só anota de que tabela cada DELETE saiu, na ordem.
function fakeDb() {
  const deletes: { table: string; where: unknown[] }[] = [];
  const trx = {
    deleteFrom: (table: string) => ({
      where: (...where: unknown[]) => ({
        execute: () => {
          deletes.push({ table, where });
          return Promise.resolve([]);
        },
      }),
    }),
  };
  const db = {
    transaction: () => ({
      execute: (fn: (t: typeof trx) => Promise<void>) => fn(trx),
    }),
  };
  return { db, deletes };
}

describe('UsersRepository.deleteUserAndData', () => {
  // As FKs que apontam pra `users` em produção, todas sem ON DELETE CASCADE
  // (catálogo conferido em 2026-10-01). Faltando uma delas, o DELETE do
  // usuário bate na FK e a exclusão de conta dá 500 — era o caso de
  // tip_deliveries e tip_dismissals pra quem já tinha recebido uma tip.
  const TABELAS_DO_USUARIO = [
    'bets',
    'houseTransactions',
    'tipDeliveries',
    'tipDismissals',
  ];

  it('apaga cada tabela que aponta pro usuário antes do próprio usuário', async () => {
    const { db, deletes } = fakeDb();
    await new UsersRepository(db as any, db as any).deleteUserAndData(
      42 as UserId,
    );

    const tabelas = deletes.map((d) => d.table);
    expect(tabelas[tabelas.length - 1]).toBe('users');
    expect(tabelas.slice(0, -1).sort()).toEqual([...TABELAS_DO_USUARIO].sort());
  });

  it('só apaga linhas desse usuário', async () => {
    const { db, deletes } = fakeDb();
    await new UsersRepository(db as any, db as any).deleteUserAndData(
      42 as UserId,
    );

    for (const { table, where } of deletes) {
      expect(where).toEqual([table === 'users' ? 'id' : 'userId', '=', 42]);
    }
  });
});

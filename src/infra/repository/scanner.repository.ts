import { Inject, Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import type { Database } from '../db/database.types';
import { DATABASE_READ_CONNECTION, DATABASE_WRITE_CONNECTION } from '../db/db.module';
import type { SportId } from '../../db_types/Sports';

export interface ScannerFlags {
  isActive?: boolean;
  statistics?: boolean;
  incidents?: boolean;
  lineups?: boolean;
}

/**
 * Tabela `scanner_tournaments`: o que o scanner do SofaScore acompanha. A tela
 * de admin escreve só as flags; as colunas `last_*` são do collect.py.
 */
@Injectable()
export class ScannerRepository {
  constructor(
    @Inject(DATABASE_READ_CONNECTION)
    private readonly dbRead: Kysely<Database>,
    @Inject(DATABASE_WRITE_CONNECTION)
    private readonly dbWrite: Kysely<Database>,
  ) {}

  // Sem a amostra: ~3 KB por linha, só sai na rota dela (botão "Dados").
  list() {
    return this.dbRead
      .selectFrom('scannerTournaments as t')
      .innerJoin('sports as s', 's.id', 't.sportId')
      .select([
        't.id', 't.name', 't.sportId', 't.isActive', 't.statistics', 't.incidents', 't.lineups',
        't.lastEvents', 't.lastEventsAt', 't.lastCheckAt', 't.lastCheckStatus', 't.sampleAt', 't.updatedAt',
        's.name as sportName',
        // Só o necessário pro ⚠ da linha; a amostra inteira fica na rota dela.
        sql<boolean>`jsonb_typeof(t.sample->'statistics') = 'array' AND jsonb_array_length(t.sample->'statistics') > 0`.as('hasStats'),
        sql<boolean>`(t.sample->'lineups'->>'confirmed')::boolean IS TRUE AND jsonb_array_length(t.sample->'lineups'->'keys') > 0`.as('hasLineups'),
        sql<boolean>`jsonb_typeof(t.sample->'event') = 'object'`.as('hasSampleEvent'),
      ])
      .orderBy('s.name')
      .orderBy('t.name')
      .execute();
  }

  sample(id: number) {
    return this.dbRead
      .selectFrom('scannerTournaments')
      .select(['sample', 'sampleAt'])
      .where('id', '=', id)
      .executeTakeFirst();
  }

  create(row: { id: number; name: string; sportId: SportId }) {
    return this.dbWrite.insertInto('scannerTournaments').values(row).returningAll().executeTakeFirstOrThrow();
  }

  /** Uma competição (`id`) ou todas de um esporte (`sportId`). */
  update(where: { id: number } | { sportId: SportId }, flags: ScannerFlags) {
    // CURRENT_TIMESTAMP do banco, como as colunas last_* do coletor: um
    // new Date() do Node cairia no fuso de quem roda a API.
    const query = this.dbWrite
      .updateTable('scannerTournaments')
      .set({ ...flags, updatedAt: sql<Date>`CURRENT_TIMESTAMP` });
    return ('id' in where ? query.where('id', '=', where.id) : query.where('sportId', '=', where.sportId))
      .returningAll()
      .execute();
  }

  async delete(id: number) {
    const result = await this.dbWrite.deleteFrom('scannerTournaments').where('id', '=', id).executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}

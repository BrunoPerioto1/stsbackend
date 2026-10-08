import { Inject, Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import type { Database } from '../db/database.types';
import { DATABASE_READ_CONNECTION, DATABASE_WRITE_CONNECTION } from '../db/db.module';
import type { TipSourceId } from '../../db_types/TipSources';
import type { UserId } from '../../db_types/Users';
import type { TipTemplate } from '../../tip-sources/tip-template';

export interface TipSourceWrite {
  name?: string;
  template?: TipTemplate;
  sampleText?: string | null;
  isActive?: boolean;
}

const RECENT_DAYS = 7;

/**
 * Tabelas `tip_sources` (fontes e modelos, escritas pelo admin) e
 * `tip_source_mutes` (fonte que cada usuário desligou).
 */
@Injectable()
export class TipSourcesRepository {
  constructor(
    @Inject(DATABASE_READ_CONNECTION)
    private readonly dbRead: Kysely<Database>,
    @Inject(DATABASE_WRITE_CONNECTION)
    private readonly dbWrite: Kysely<Database>,
  ) {}

  /** Lista do admin: com o que cada fonte rendeu na semana e quantos a desligaram. */
  list() {
    const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
    return this.dbRead
      .selectFrom('tipSources as s')
      .select((eb) => [
        's.id',
        's.name',
        's.template',
        's.sampleText',
        's.isActive',
        's.updatedAt',
        eb
          .selectFrom('tips as t')
          .whereRef('t.sourceId', '=', 's.id')
          .where('t.createdAt', '>=', since)
          .select((sub) => sub.fn.countAll<string>().as('n'))
          .as('recentTips'),
        eb
          .selectFrom('tips as t')
          .whereRef('t.sourceId', '=', 's.id')
          .select((sub) => sub.fn.max('t.createdAt').as('m'))
          .as('lastTipAt'),
        eb
          .selectFrom('tipSourceMutes as m')
          .whereRef('m.sourceId', '=', 's.id')
          .select((sub) => sub.fn.countAll<string>().as('n'))
          .as('mutedBy'),
      ])
      .orderBy('s.name')
      .execute();
  }

  /**
   * O que o fan-out tenta a cada mensagem do grupo Tips. Writer: fonte recém
   * ativada tem que valer na próxima tip, não depois do lag da réplica.
   */
  listActive() {
    return this.dbWrite
      .selectFrom('tipSources')
      .select(['id', 'name', 'template'])
      .where('isActive', '=', true)
      .orderBy('id')
      .execute();
  }

  create(row: { name: string; template: TipTemplate; sampleText: string | null; isActive: boolean }) {
    return this.dbWrite
      .insertInto('tipSources')
      .values({ ...row, template: JSON.stringify(row.template) })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  update(id: TipSourceId, set: TipSourceWrite) {
    const { template, ...rest } = set;
    return this.dbWrite
      .updateTable('tipSources')
      .set({
        ...rest,
        ...(template ? { template: JSON.stringify(template) } : {}),
        updatedAt: sql<Date>`CURRENT_TIMESTAMP`,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async delete(id: TipSourceId) {
    const result = await this.dbWrite.deleteFrom('tipSources').where('id', '=', id).executeTakeFirst();
    return Number(result.numDeletedRows);
  }

  /**
   * Teste de conflito do modelo: mensagens recentes que não são da fonte
   * `excludeId` (formato padrão e outras fontes), como chegaram — tip de
   * fonte tem o card em `text` e a mensagem do tipster em `originalText`.
   */
  recentTextsOutside(excludeId: TipSourceId | null, limit: number) {
    return this.dbRead
      .selectFrom('tips')
      .select((eb) => eb.fn.coalesce('originalText', 'text').as('text'))
      .$if(excludeId !== null, (qb) =>
        qb.where((eb) => eb.or([eb('sourceId', 'is', null), eb('sourceId', '!=', excludeId!)])),
      )
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute();
  }

  /** Fontes ativas com o liga/desliga do usuário. */
  listForUser(userId: UserId) {
    return this.dbRead
      .selectFrom('tipSources as s')
      .leftJoin('tipSourceMutes as m', (join) => join.onRef('m.sourceId', '=', 's.id').on('m.userId', '=', userId))
      .select(['s.id', 's.name', sql<boolean>`m.user_id IS NULL`.as('enabled')])
      .where('s.isActive', '=', true)
      .orderBy('s.name')
      .execute();
  }

  async setMuted(userId: UserId, sourceId: TipSourceId, muted: boolean) {
    if (muted) {
      await this.dbWrite
        .insertInto('tipSourceMutes')
        .values({ userId, sourceId })
        .onConflict((oc) => oc.columns(['userId', 'sourceId']).doNothing())
        .execute();
    } else {
      await this.dbWrite
        .deleteFrom('tipSourceMutes')
        .where('userId', '=', userId)
        .where('sourceId', '=', sourceId)
        .execute();
    }
  }

  async exists(id: TipSourceId) {
    const row = await this.dbRead.selectFrom('tipSources').select('id').where('id', '=', id).executeTakeFirst();
    return !!row;
  }

  async mutedUserIds(sourceId: TipSourceId): Promise<Set<number>> {
    const rows = await this.dbWrite
      .selectFrom('tipSourceMutes')
      .select('userId')
      .where('sourceId', '=', sourceId)
      .execute();
    return new Set(rows.map((r) => Number(r.userId)));
  }
}

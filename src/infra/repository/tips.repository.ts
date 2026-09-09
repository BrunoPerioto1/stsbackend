import { Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import {
  DATABASE_READ_CONNECTION,
  DATABASE_WRITE_CONNECTION,
} from '../db/db.module';
import type { Database } from '../db/database.types';
import type { NewTip, TipId } from '../../db_types/Tips';
import type { NewTipDelivery } from '../../db_types/TipDeliveries';
import type { UserId } from '../../db_types/Users';

@Injectable()
export class TipsRepository {
  constructor(
    @Inject(DATABASE_WRITE_CONNECTION)
    private readonly dbWrite: Kysely<Database>,
    @Inject(DATABASE_READ_CONNECTION)
    private readonly dbRead: Kysely<Database>,
  ) {}

  // Idempotente por (chatId, messageId): o Telegram pode reentregar o mesmo
  // update de webhook, e handleTipsMessage não pode acabar criando duas tips
  // pra mesma mensagem do grupo.
  async create(tip: NewTip) {
    const inserted = await this.dbWrite
      .insertInto('tips')
      .values(tip)
      .onConflict((oc) => oc.columns(['chatId', 'messageId']).doNothing())
      .returningAll()
      .executeTakeFirst();

    if (inserted) return inserted;

    return this.dbRead
      .selectFrom('tips')
      .selectAll()
      .where('chatId', '=', tip.chatId)
      .where('messageId', '=', tip.messageId)
      .executeTakeFirstOrThrow();
  }

  async findById(tipId: TipId) {
    return this.dbRead
      .selectFrom('tips')
      .selectAll()
      .where('id', '=', tipId)
      .executeTakeFirst();
  }

  // Todas as tips relevantes pro filtro de % do usuário, com o id da aposta
  // (se já planilhou) e o id do dismissal (se marcou "aposta caiu") — quem
  // chama decide o que é "pendente" a partir desses dois campos.
  async findSummaryForUser(
    userId: UserId,
    minPercentFilter: number | null,
    // Só o matching de print usa: ele já descarta candidato de mais de 24h,
    // então não faz sentido varrer o histórico inteiro de tips por isso. O
    // /pendentes continua sem janela (uma tip antiga não pode sumir da lista).
    since?: Date,
  ) {
    // Writer, nao a replica: a lista e reconstruida no mesmo clique que criou
    // a aposta, e com lag de replicacao o item recem-planilhado reaparecia.
    // E um comando manual, entao o custo extra no writer e desprezivel.
    return this.dbWrite
      .selectFrom('tips as t')
      .leftJoin('bets as b', (join) =>
        join.onRef('b.tipId', '=', 't.id').on('b.userId', '=', userId),
      )
      .leftJoin('tipDismissals as d', (join) =>
        join.onRef('d.tipId', '=', 't.id').on('d.userId', '=', userId),
      )
      // A cópia que o fan-out mandou pra ESTE usuário: é só nela que existe a
      // "🎯 Recomendação de aposta" (banca do usuário × % da tip). O texto da
      // tabela `tips` é a mensagem crua do canal, igual pra todo mundo.
      .leftJoin('tipDeliveries as td', (join) =>
        join.onRef('td.tipId', '=', 't.id').on('td.userId', '=', userId),
      )
      .select([
        't.id',
        't.text',
        't.chatId',
        't.messageId',
        't.hasMedia',
        't.percent',
        't.isAviso',
        't.createdAt',
        'b.id as betId',
        'd.id as dismissalId',
        'td.text as deliveryText',
      ])
      .where('t.percent', 'is not', null)
      .$if(since !== undefined, (qb) => qb.where('t.createdAt', '>=', since!))
      .$if(minPercentFilter !== null, (qb) =>
        qb.where('t.percent', '>=', minPercentFilter as number),
      )
      .orderBy('t.createdAt', 'asc')
      .execute();
  }

  async dismiss(tipId: TipId, userId: UserId) {
    const dismissed = await this.dbWrite
      .insertInto('tipDismissals')
      .values({ tipId, userId })
      .onConflict((oc) => oc.columns(['tipId', 'userId']).doNothing())
      .returningAll()
      .executeTakeFirst();
    return !!dismissed;
  }

  async undismiss(tipId: TipId, userId: UserId) {
    await this.dbWrite
      .deleteFrom('tipDismissals')
      .where('tipId', '=', tipId)
      .where('userId', '=', userId)
      .execute();
  }

  // Guarda só a última cópia de DM mandada pra esse (tip, usuário) — se a tip
  // for reenviada (botão Editar da lista), o registro anterior é substituído,
  // já que só a cópia mais recente é a que ainda está visível pro usuário.
  async upsertDelivery(delivery: NewTipDelivery) {
    await this.dbWrite
      .insertInto('tipDeliveries')
      .values(delivery)
      .onConflict((oc) =>
        oc.columns(['tipId', 'userId']).doUpdateSet({
          messageId: delivery.messageId,
          hasMedia: delivery.hasMedia,
          text: delivery.text,
          entities: delivery.entities,
        }),
      )
      .execute();
  }

  async findDelivery(tipId: TipId, userId: UserId) {
    return this.dbRead
      .selectFrom('tipDeliveries')
      .selectAll()
      .where('tipId', '=', tipId)
      .where('userId', '=', userId)
      .executeTakeFirst();
  }
}

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

  // Tip que ninguém encostou envelhece: o jogo já aconteceu e ela só engorda a
  // lista. Fora desta janela só entra tip já planilhada ou marcada como
  // "caiu" — essas são histórico e não somem nunca.
  //
  // É isto que impede o baque ao mexer na % do filtro: baixar o mínimo
  // ressuscitava toda tip do passado que passou a caber no novo corte.
  static readonly UNTOUCHED_WINDOW_MS = 48 * 60 * 60 * 1000;

  // Todas as tips relevantes pro filtro de % do usuário, com o id da aposta
  // (se já planilhou) e o id do dismissal (se marcou "aposta caiu") — quem
  // chama decide o que é "pendente" a partir desses dois campos.
  async findSummaryForUser(
    userId: UserId,
    minPercentFilter: number | null,
    // Só o matching de print usa: ele já descarta candidato de mais de 24h,
    // então não faz sentido varrer o histórico inteiro de tips por isso —
    // janela própria, mais apertada, no lugar da de 48h.
    since?: Date,
  ) {
    const untouchedSince = new Date(
      Date.now() - TipsRepository.UNTOUCHED_WINDOW_MS,
    );
    // Writer, nao a replica: a lista e reconstruida no mesmo clique que criou
    // a aposta, e com lag de replicacao o item recem-planilhado reaparecia.
    // E um comando manual, entao o custo extra no writer e desprezivel.
    return this.dbWrite
      .selectFrom('tips as t')
      .leftJoin('bets as b', (join) =>
        join.onRef('b.tipId', '=', 't.id').on('b.userId', '=', userId).on('b.deletedAt', 'is', null),
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
        // A URL do "Odd mudou? ... calcule quanto vale" é um text_link: só
        // existe aqui, não no texto da mensagem.
        't.entities',
        't.createdAt',
        'b.id as betId',
        // A aposta ja casou o evento quando foi criada, com a janela cheia. A
        // lista reaproveita esse valor em vez de recasar contra uma janela que
        // pode ja ter perdido o jogo.
        'b.eventStartAt as betEventStartAt',
        'd.id as dismissalId',
        'td.text as deliveryText',
      ])
      .where('t.percent', 'is not', null)
      .$if(since !== undefined, (qb) => qb.where('t.createdAt', '>=', since!))
      // Sem janela explícita do chamador vale a de 48h — mas só pra tip que o
      // usuário nunca tocou.
      .$if(since === undefined, (qb) =>
        qb.where((eb) =>
          eb.or([
            eb('t.createdAt', '>=', untouchedSince),
            eb('b.id', 'is not', null),
            eb('d.id', 'is not', null),
          ]),
        ),
      )
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

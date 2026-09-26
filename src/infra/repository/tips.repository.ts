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

export interface TipListFilter {
  status?: 'pending' | 'planilhada' | 'caiu';
  q?: string;
}

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
  // pra mesma mensagem do grupo. `created` diz se esta chamada inseriu — a
  // reentrega não pode refazer o fan-out e mandar a DM de novo.
  async create(tip: NewTip) {
    const inserted = await this.dbWrite
      .insertInto('tips')
      .values(tip)
      .onConflict((oc) => oc.columns(['chatId', 'messageId']).doNothing())
      .returningAll()
      .executeTakeFirst();

    if (inserted) return { tip: inserted, created: true };

    // Writer: a outra entrega pode ter acabado de inserir, e a réplica ainda
    // não ter a linha.
    const existing = await this.dbWrite
      .selectFrom('tips')
      .selectAll()
      .where('chatId', '=', tip.chatId)
      .where('messageId', '=', tip.messageId)
      .executeTakeFirstOrThrow();
    return { tip: existing, created: false };
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

  // Mesma base da findSummaryForUser (joins, janela de 48h pra tip não
  // tocada, filtro de %), sem o SELECT: cada consulta da tela escolhe o seu.
  private listBase(userId: UserId, minPercentFilter: number | null) {
    const untouchedSince = new Date(Date.now() - TipsRepository.UNTOUCHED_WINDOW_MS);
    return this.dbWrite
      .selectFrom('tips as t')
      .leftJoin('bets as b', (join) =>
        join.onRef('b.tipId', '=', 't.id').on('b.userId', '=', userId).on('b.deletedAt', 'is', null),
      )
      .leftJoin('tipDismissals as d', (join) => join.onRef('d.tipId', '=', 't.id').on('d.userId', '=', userId))
      .leftJoin('tipDeliveries as td', (join) => join.onRef('td.tipId', '=', 't.id').on('td.userId', '=', userId))
      .where('t.percent', 'is not', null)
      .where((eb) =>
        eb.or([eb('t.createdAt', '>=', untouchedSince), eb('b.id', 'is not', null), eb('d.id', 'is not', null)]),
      )
      .$if(minPercentFilter !== null, (qb) => qb.where('t.percent', '>=', minPercentFilter as number));
  }

  // Status e busca no SQL. A tela de Tips carregava o histórico inteiro (toda
  // tip planilhada ou "caiu" fica pra sempre) e paginava em memória.
  private listFiltered(userId: UserId, minPercentFilter: number | null, filter: TipListFilter) {
    const termo = filter.q?.trim();
    return this.listBase(userId, minPercentFilter)
      .$if(filter.status === 'planilhada', (qb) => qb.where('b.id', 'is not', null))
      .$if(filter.status === 'caiu', (qb) => qb.where('b.id', 'is', null).where('d.id', 'is not', null))
      .$if(filter.status === 'pending', (qb) => qb.where('b.id', 'is', null).where('d.id', 'is', null))
      // Busca no texto da mensagem (jogo, mercado, casa). Curinga do LIKE
      // digitado pelo usuário vale como letra.
      .$if(!!termo, (qb) => qb.where('t.text', 'ilike', `%${termo!.replace(/[\\%_]/g, (c) => '\\' + c)}%`));
  }

  /** Página da lista (mais recente primeiro). Sem `page`, devolve tudo que casa com o filtro. */
  async findListRows(
    userId: UserId,
    minPercentFilter: number | null,
    filter: TipListFilter,
    page?: { limit: number; offset: number },
  ) {
    return this.listFiltered(userId, minPercentFilter, filter)
      .select([
        't.id',
        't.text',
        't.percent',
        't.isAviso',
        't.entities',
        't.createdAt',
        'b.id as betId',
        'b.eventStartAt as betEventStartAt',
        'd.id as dismissalId',
        'td.text as deliveryText',
      ])
      .orderBy('t.createdAt', 'desc')
      .orderBy('t.id', 'desc')
      .$if(!!page, (qb) => qb.limit(page!.limit).offset(page!.offset))
      .execute();
  }

  async countListRows(userId: UserId, minPercentFilter: number | null, filter: TipListFilter) {
    const row = await this.listFiltered(userId, minPercentFilter, filter)
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();
    return Number(row.total);
  }

  /** Contadores das abas: ignoram busca e casa, como sempre fizeram. */
  async countByStatus(userId: UserId, minPercentFilter: number | null) {
    const row = await this.listBase(userId, minPercentFilter)
      .select((eb) => [
        eb.fn.countAll<string>().filterWhere('b.id', 'is not', null).as('planilhadas'),
        eb.fn
          .countAll<string>()
          .filterWhere((fb) => fb.and([fb('b.id', 'is', null), fb('d.id', 'is not', null)]))
          .as('caidas'),
        eb.fn
          .countAll<string>()
          .filterWhere((fb) => fb.and([fb('b.id', 'is', null), fb('d.id', 'is', null)]))
          .as('pending'),
      ])
      .executeTakeFirstOrThrow();
    return {
      pending: Number(row.pending),
      planilhadas: Number(row.planilhadas),
      caidas: Number(row.caidas),
    };
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

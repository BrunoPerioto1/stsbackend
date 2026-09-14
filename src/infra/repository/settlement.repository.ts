import { Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import {
  DATABASE_READ_CONNECTION,
  DATABASE_WRITE_CONNECTION,
} from '../db/db.module';
import type { Database } from '../db/database.types';
import { BetId } from '../../db_types/Bet';
import { UserId } from '../../db_types/Users';
import { ResultId } from '../../db_types/Results';
import { ResultIdEnum } from '../../bet/dto/result-id.enum';
import { ENGINE_VERSION } from '../../settlement/settle';

export interface SettleableBet {
  id: BetId;
  game: string;
  market: string;
  homeName: string | null;
  awayName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  eventStatus: string | null;
  sport: string | null;
  eventSport: string | null;
  scoreScope: string | null;
  facts: unknown;
}

@Injectable()
export class SettlementRepository {
  constructor(
    @Inject(DATABASE_WRITE_CONNECTION)
    private readonly dbWrite: Kysely<Database>,
    @Inject(DATABASE_READ_CONNECTION)
    private readonly dbRead: Kysely<Database>,
  ) {}

  /**
   * Apostas ainda pendentes cujo jogo ja' terminou, ja' tem placar coletado e
   * cuja sugestao esta' desatualizada — ou seja, so' o que mudou desde a ultima
   * recomputacao.
   *
   * A sugestao vale enquanto as duas entradas que a geraram nao mudarem: o
   * placar (`event_results.fetched_at`, que o provider pode corrigir) e a
   * propria aposta (`bets.updated_at`, quando o usuario arruma o texto do
   * mercado). Se `computed_at` e' mais novo que ambos, recalcular daria
   * exatamente a mesma frase. Sem esse filtro, toda abertura da tela
   * reprocessava o historico inteiro do usuario e reescrevia as mesmas linhas.
   * Com ele, o `limit` vira lote: o que sobrou continua sendo candidato na
   * proxima chamada, e o mais antigo vem primeiro pra fila drenar em ordem em
   * vez de ficar preso atras dos recentes.
   *
   * Sugestao recusada nao volta pra ca': ela ja' esta' invisivel na tela e o
   * upsert nao ressuscita `dismissed_at`, entao recalcular seria trabalho jogado
   * fora.
   *
   * Os nomes dos times vem de sport_events quando o cache ainda tem o jogo;
   * quando ja' expirou, caem pro texto do proprio `game`, que o avaliador
   * consegue quebrar. Nao e' motivo pra deixar de liquidar.
   */
  /**
   * Contadores da fila. A tela precisa deles no load: hoje esses numeros so'
   * existem na resposta do ultimo `compute`, entao um F5 apaga tanto o aviso de
   * fila restante quanto o de aposta sem proposta.
   *
   * `undecided` sao as apostas que o bot analisou e nao soube resolver. Elas
   * seguem pendentes e nunca entram na lista de propostas — sem esse numero,
   * virariam silencio na tela.
   */
  async queue(userId: UserId): Promise<{
    pending: number;
    settleable: number;
    suggestions: number;
    undecided: number;
  }> {
    const [bets, suggestions] = await Promise.all([
      this.dbRead
        .selectFrom('bets')
        .innerJoin('betResults', 'betResults.betId', 'bets.id')
        // left join: aposta pendente sem placar coletado ainda conta em
        // `pending`, so' nao entra em `settleable`.
        .leftJoin('eventResults', (join) =>
          join
            .onRef('eventResults.provider', '=', 'bets.eventProvider')
            .onRef('eventResults.externalId', '=', 'bets.eventExternalId'),
        )
        .leftJoin('betSettlementSuggestions as s', 's.betId', 'bets.id')
        .where('bets.userId', '=', userId)
        .where('betResults.resultId', '=', ResultIdEnum.PENDING as ResultId)
        .select((eb) => [
          eb.fn.countAll<string>().as('pending'),
          eb.fn
            .count<string>('bets.id')
            // Mesmo filtro de findSettleable: o que entraria no proximo lote.
            // Se um mudar, o outro tem que mudar junto.
            .filterWhere((fb) =>
              fb.and([
                fb('eventResults.externalId', 'is not', null),
                fb.or([
                  fb('s.betId', 'is', null),
                  fb.and([
                    fb('s.dismissedAt', 'is', null),
                    fb.or([
                      fb('s.engineVersion', 'is', null),
                      fb('s.engineVersion', '!=', ENGINE_VERSION),
                      fb('s.computedAt', '<', fb.ref('eventResults.fetchedAt')),
                      fb('s.computedAt', '<', fb.ref('bets.updatedAt')),
                    ]),
                  ]),
                ]),
              ]),
            )
            .as('settleable'),
        ])
        .executeTakeFirstOrThrow(),
      this.dbRead
        .selectFrom('betSettlementSuggestions as s')
        .innerJoin('bets', 'bets.id', 's.betId')
        .innerJoin('betResults', 'betResults.betId', 'bets.id')
        .innerJoin('eventResults as er', (join) =>
          join
            .onRef('er.provider', '=', 'bets.eventProvider')
            .onRef('er.externalId', '=', 'bets.eventExternalId'),
        )
        .where('bets.userId', '=', userId)
        .where('betResults.resultId', '=', ResultIdEnum.PENDING as ResultId)
        .where('s.dismissedAt', 'is', null)
        .where('s.engineVersion', '=', ENGINE_VERSION)
        // Mesma cerca de frescor de findPendingSuggestions: o contador tem que
        // bater com a lista que a tela mostra, nao com o que ficou no banco.
        .whereRef('s.computedAt', '>=', 'bets.updatedAt')
        .whereRef('s.computedAt', '>=', 'er.fetchedAt')
        .select((eb) => [
          eb.fn
            .count<string>('s.betId')
            .filterWhere('s.suggestedResultId', 'is not', null)
            .as('suggestions'),
          eb.fn
            .count<string>('s.betId')
            .filterWhere('s.suggestedResultId', 'is', null)
            .as('undecided'),
        ])
        .executeTakeFirstOrThrow(),
    ]);

    return {
      pending: Number(bets.pending),
      settleable: Number(bets.settleable),
      suggestions: Number(suggestions.suggestions),
      undecided: Number(suggestions.undecided),
    };
  }

  async findSettleable(userId: UserId, limit = 200): Promise<SettleableBet[]> {
    const rows = await this.dbRead
      .selectFrom('bets')
      .innerJoin('betResults', 'betResults.betId', 'bets.id')
      .innerJoin('eventResults', (join) =>
        join
          .onRef('eventResults.provider', '=', 'bets.eventProvider')
          .onRef('eventResults.externalId', '=', 'bets.eventExternalId'),
      )
      .leftJoin('sportEvents', (join) =>
        join
          .onRef('sportEvents.provider', '=', 'bets.eventProvider')
          .onRef('sportEvents.externalId', '=', 'bets.eventExternalId'),
      )
      .leftJoin('betSettlementSuggestions as s', 's.betId', 'bets.id')
      .leftJoin('eventFacts as f', (join) => join
        .onRef('f.provider', '=', 'eventResults.provider')
        .onRef('f.externalId', '=', 'eventResults.externalId')
        .onRef('f.fetchedAt', '=', 'eventResults.fetchedAt')
        .on('f.formatVersion', '=', 1))
      .where('bets.userId', '=', userId)
      .where('betResults.resultId', '=', ResultIdEnum.PENDING as ResultId)
      .where((eb) =>
        eb.or([
          eb('s.betId', 'is', null),
          eb.and([
            eb('s.dismissedAt', 'is', null),
            eb.or([
              eb('s.engineVersion', 'is', null),
              eb('s.engineVersion', '!=', ENGINE_VERSION),
              eb('s.computedAt', '<', eb.ref('eventResults.fetchedAt')),
              eb('s.computedAt', '<', eb.ref('bets.updatedAt')),
            ]),
          ]),
        ]),
      )
      .select([
        'bets.id as id',
        'bets.game as game',
        'bets.market as market',
        'eventResults.homeName as homeName',
        'eventResults.awayName as awayName',
        'bets.sport as sport',
        'eventResults.sport as eventSport',
        'eventResults.scoreScope as scoreScope',
        'f.dataJson as facts',
        'eventResults.homeScore as homeScore',
        'eventResults.awayScore as awayScore',
        'eventResults.status as eventStatus',
      ])
      .orderBy('bets.eventStartAt', 'asc')
      .limit(limit)
      .execute();

    return rows as unknown as SettleableBet[];
  }

  async saveSuggestions(
    suggestions: {
      betId: BetId;
      suggestedResultId: number | null;
      reason: string | null;
      explanation: string;
      homeScore: number | null;
      awayScore: number | null;
    }[],
  ) {
    if (!suggestions.length) return;
    await this.dbWrite
      .insertInto('betSettlementSuggestions')
      .values(
        suggestions.map((s) => ({
          ...s,
          computedAt: new Date(),
          engineVersion: ENGINE_VERSION,
          dismissedAt: null,
        })),
      )
      // Recomputar e' idempotente: o placar pode ter sido corrigido pelo
      // provider. `dismissedAt` nao entra no update pra nao ressuscitar
      // sugestao que o usuario ja' recusou.
      .onConflict((oc) =>
        oc.column('betId').doUpdateSet((eb) => ({
          suggestedResultId: eb.ref('excluded.suggestedResultId'),
          reason: eb.ref('excluded.reason'),
          explanation: eb.ref('excluded.explanation'),
          homeScore: eb.ref('excluded.homeScore'),
          awayScore: eb.ref('excluded.awayScore'),
          computedAt: eb.ref('excluded.computedAt'),
          engineVersion: eb.ref('excluded.engineVersion'),
        })),
      )
      .execute();
  }

  /**
   * Sugestoes decididas e ainda nao recusadas, prontas pra tela.
   *
   * `betIds` restringe ao que o usuario marcou — e' o que a confirmacao usa pra
   * nao trazer a lista inteira do banco so' pra descartar quase tudo em memoria.
   */
  async findPendingSuggestions(userId: UserId, betIds?: BetId[], review = false) {
    // `in ()` nao e' SQL valido; lista vazia nao tem o que buscar.
    if (betIds && !betIds.length) return [];

    let query = this.dbRead
      .selectFrom('betSettlementSuggestions as s')
      .innerJoin('bets', 'bets.id', 's.betId')
      .innerJoin('betResults', 'betResults.betId', 'bets.id')
      .innerJoin('eventResults as er', (join) => join
        .onRef('er.provider', '=', 'bets.eventProvider')
        .onRef('er.externalId', '=', 'bets.eventExternalId'))
      .where('bets.userId', '=', userId)
      .where('betResults.resultId', '=', ResultIdEnum.PENDING as ResultId)
      .where('s.dismissedAt', 'is', null)
      .where('s.engineVersion', '=', ENGINE_VERSION)
      .whereRef('s.computedAt', '>=', 'bets.updatedAt')
      .whereRef('s.computedAt', '>=', 'er.fetchedAt');

    query = review ? query.where('s.suggestedResultId', 'is', null) : query.where('s.suggestedResultId', 'is not', null);

    if (betIds) query = query.where('s.betId', 'in', betIds);

    return query
      .select([
        's.betId as betId',
        's.suggestedResultId as suggestedResultId',
        's.explanation as explanation',
        's.reason as reason',
        's.homeScore as homeScore',
        's.awayScore as awayScore',
        's.computedAt as computedAt',
        'bets.game as game',
        'bets.market as market',
        'bets.stake as stake',
        'bets.odd as odd',
        'bets.eventStartAt as eventStartAt',
      ])
      .orderBy('bets.eventStartAt', 'desc')
      .execute();
  }

  /** -> quantas sugestoes a recusa realmente atingiu (id de outro usuario nao conta). */
  async dismiss(betIds: BetId[], userId: UserId): Promise<number> {
    if (!betIds.length) return 0;
    const result = await this.dbWrite
      .updateTable('betSettlementSuggestions')
      .set({ dismissedAt: new Date() })
      .where('betId', 'in', betIds)
      // Cerca de dono: sem isso um id de outro usuario seria recusado aqui.
      .where((eb) =>
        eb(
          'betId',
          'in',
          eb.selectFrom('bets').select('id').where('userId', '=', userId),
        ),
      )
      .executeTakeFirst();

    return Number(result?.numUpdatedRows ?? 0);
  }
}

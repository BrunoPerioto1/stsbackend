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

export interface SettleableBet {
  id: BetId;
  game: string;
  market: string;
  homeName: string | null;
  awayName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  eventStatus: string | null;
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
   * Apostas ainda pendentes cujo jogo ja' terminou e ja' tem placar coletado.
   *
   * Os nomes dos times vem de sport_events quando o cache ainda tem o jogo;
   * quando ja' expirou, caem pro texto do proprio `game`, que o avaliador
   * consegue quebrar. Nao e' motivo pra deixar de liquidar.
   */
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
      .where('bets.userId', '=', userId)
      .where('betResults.resultId', '=', ResultIdEnum.PENDING as ResultId)
      .select([
        'bets.id as id',
        'bets.game as game',
        'bets.market as market',
        'sportEvents.homeName as homeName',
        'sportEvents.awayName as awayName',
        'eventResults.homeScore as homeScore',
        'eventResults.awayScore as awayScore',
        'eventResults.status as eventStatus',
      ])
      .orderBy('bets.eventStartAt', 'desc')
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
        })),
      )
      .execute();
  }

  /** Sugestoes decididas e ainda nao recusadas, prontas pra tela. */
  async findPendingSuggestions(userId: UserId) {
    return this.dbRead
      .selectFrom('betSettlementSuggestions as s')
      .innerJoin('bets', 'bets.id', 's.betId')
      .innerJoin('betResults', 'betResults.betId', 'bets.id')
      .where('bets.userId', '=', userId)
      .where('betResults.resultId', '=', ResultIdEnum.PENDING as ResultId)
      .where('s.dismissedAt', 'is', null)
      .where('s.suggestedResultId', 'is not', null)
      .select([
        's.betId as betId',
        's.suggestedResultId as suggestedResultId',
        's.explanation as explanation',
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

  async dismiss(betIds: BetId[], userId: UserId) {
    if (!betIds.length) return;
    await this.dbWrite
      .updateTable('betSettlementSuggestions')
      .set({ dismissedAt: new Date() })
      .where('betId', 'in', betIds)
      .where(({ eb, selectFrom }) =>
        eb(
          'betId',
          'in',
          selectFrom('bets').select('id').where('userId', '=', userId),
        ),
      )
      .execute();
  }
}

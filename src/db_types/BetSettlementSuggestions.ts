import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';
import type { BetId } from './Bet';

// Resultado proposto pela liquidacao automatica, aguardando confirmacao na
// tela de conferencia. Nada aqui vira lucro: so' o usuario move pra
// bet_results, via o fluxo de finalizacao que ja existe.
export default interface BetSettlementSuggestionsTable {
  betId: ColumnType<BetId, BetId, never>;
  // 1=WON, 2=LOST. NULL quando nao deu pra decidir — `reason` diz por que.
  suggestedResultId: ColumnType<number | null, number | null, number | null>;
  reason: ColumnType<string | null, string | null, string | null>;
  // Frase mostrada na tela: "3 gols no jogo, mais de 2.5".
  explanation: ColumnType<string | null, string | null, string | null>;
  homeScore: ColumnType<number | null, number | null, number | null>;
  awayScore: ColumnType<number | null, number | null, number | null>;
  computedAt: ColumnType<Date, Date | undefined, Date>;
  dismissedAt: ColumnType<Date | null, Date | null, Date | null>;
}

export type BetSettlementSuggestion =
  Selectable<BetSettlementSuggestionsTable>;
export type NewBetSettlementSuggestion =
  Insertable<BetSettlementSuggestionsTable>;
export type UpdateBetSettlementSuggestion =
  Updateable<BetSettlementSuggestionsTable>;

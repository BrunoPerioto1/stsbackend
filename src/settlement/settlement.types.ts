export type Capability = 'SCORE_FULL_TIME' | 'SCORE_PERIODS' | 'TEAM_STATS' | 'INCIDENTS' | 'PLAYER_STATS' | 'SPORT_SPECIFIC_STATS';
export type Scope = 'REGULATION' | 'FIRST_HALF' | 'SECOND_HALF';
export type Side = 'HOME' | 'AWAY';
export type Pick = Side | 'DRAW' | 'NONE';
export interface Teams { home: string; away: string }
export interface FinalScore { home: number; away: number }
export type Reason = 'MERCADO_NAO_RECONHECIDO' | 'OUTRA_CATEGORIA' | 'TEMPO_PARCIAL' | 'GOLS_DE_UM_TIME' | 'VARIOS_JOGOS' | 'CONDICAO_ALTERNATIVA' | 'COMBINADA_NAO_SEPARADA' | 'DADO_INDISPONIVEL' | 'ESPORTE_FORA_ESCOPO' | 'ESCOPO_NAO_SUPORTADO' | 'REGRA_NAO_SUPORTADA' | 'PERNA_ANULADA' | 'JOGO_NAO_FINALIZADO' | 'SEM_PLACAR' | 'MERCADO_TRUNCADO';
export interface Condition {
  normalizedMarket: string;
  scope: Scope;
  operator?: 'OVER' | 'UNDER' | 'AT_LEAST';
  line?: number;
  side?: Side;
  pick?: Pick;
  picks?: Pick[];
  expected?: boolean;
  home?: number;
  away?: number;
  metric?: string;
  participant?: string;
  ordinal?: number;
}
export type ParseResult = { ok: true; conditions: Condition[] } | { ok: false; reason: Reason; detail: string };
export interface Stat { scope: Scope; metric: string; home: number; away: number }
export interface Incident { type: 'GOAL' | 'PENALTY_AWARDED' | 'RED_CARD'; scope: Scope; side: Side; sequence: number; elapsedSeconds?: number }
export interface PlayerStat { scope: Scope; name: string; participantId: string; played: boolean; metric: string; value: number }
// Somente snapshots completos podem provar ausência (zero gols/cartões/etc.).
export interface Facts {
  periods?: Partial<Record<'FIRST_HALF' | 'SECOND_HALF', FinalScore>>;
  teamStats?: Stat[];
  incidents?: { complete: boolean; items: Incident[] };
  playerStats?: { complete: boolean; items: PlayerStat[] };
}
export interface SettlementContext extends Facts {
  sport: string | null;
  scoreScope: 'REGULATION' | 'EXTRA_TIME' | 'UNKNOWN';
  // Regra da casa resolvida externamente; nunca inferida do placar/provedor.
  // RED_COUNTS_TWO: amarelo 1, vermelho 2 — regra da casa informada pelo usuário.
  cardCounting?: 'RED_COUNTS_TWO';
}
export interface EvaluationContext extends SettlementContext { score: FinalScore | null; teams: Teams }
export type Evaluation = { outcome: 'WON' | 'LOST' | 'VOID'; text: string } | { outcome: 'UNKNOWN'; reason: Reason; text: string };
export interface MarketDefinition {
  normalizedMarket: string;
  aliases: readonly string[];
  requiredData: readonly Capability[];
  confidence: 'HIGH';
  unsupportedReason: Reason;
  status: 'SUPORTADO' | 'PARCIAL' | 'INDEFINIDO';
  parser: (text: string, teams: Teams) => Condition | null;
  evaluator: (condition: Condition, context: EvaluationContext) => Evaluation;
}

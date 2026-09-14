import { ResultIdEnum } from '../bet/dto/result-id.enum';
import { parseMarket } from './market-conditions';
import { MARKET_REGISTRY } from './market-registry';
import { normalize } from './market-parser';
import { FinalScore, Reason, SettlementContext, Teams } from './settlement.types';
export type { FinalScore } from './settlement.types';
export type SettlementReason = Reason;
export interface Settlement { resultId: ResultIdEnum | null; reason: Reason | null; explanation: string }
export const ENGINE_VERSION = '2026-09-12-capabilities-v1';
// Callers antigos declaram implicitamente futebol/tempo normal. Produção
// fornece sempre contexto explícito lido do banco, sem esse default.
export function settleBet(market: string, teams: Teams, score: FinalScore | null, eventStatus: string | null,
  context: SettlementContext = { sport:'football',scoreScope:'REGULATION' }): Settlement {
  const undecided=(reason: Reason, explanation: string): Settlement=>({resultId:null,reason,explanation});
  if (!['football','futebol','soccer'].includes(normalize(context.sport??''))) return undecided('ESPORTE_FORA_ESCOPO','esporte sem avaliador específico ou não identificado');
  if (eventStatus==null) return undecided('SEM_PLACAR','estado do evento não coletado');
  if (eventStatus!=='finished') return undecided('JOGO_NAO_FINALIZADO',`status "${eventStatus}"`);
  const parsed=parseMarket(market,teams);
  if (!parsed.ok) return undecided(parsed.reason,parsed.detail);
  const outcomes=parsed.conditions.map(c=>MARKET_REGISTRY.find(d=>d.normalizedMarket===c.normalizedMarket)!.evaluator(c,{...context,score,teams}));
  const explanation=outcomes.map(o=>o.text).join('; ');
  const missing=outcomes.find(o=>o.outcome==='UNKNOWN');
  if (missing?.outcome==='UNKNOWN') return undecided(missing.reason,explanation);
  if (outcomes.length>1 && outcomes.some(o=>o.outcome==='VOID')) return undecided('PERNA_ANULADA',`odd ajustada não calculada: ${explanation}`);
  if (outcomes.some(o=>o.outcome==='LOST')) return {resultId:ResultIdEnum.LOST,reason:null,explanation};
  if (outcomes.some(o=>o.outcome==='VOID')) return {resultId:ResultIdEnum.CANCELED,reason:null,explanation};
  return {resultId:ResultIdEnum.WON,reason:null,explanation};
}

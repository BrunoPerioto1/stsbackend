import { ResultIdEnum } from '../bet/dto/result-id.enum';
import { parseMarket } from './market-conditions';
import { MARKET_REGISTRY } from './market-registry';
import { normalize } from './market-parser';
import { Condition, FinalScore, Reason, SettlementContext, Teams } from './settlement.types';
export type { FinalScore } from './settlement.types';
export type SettlementReason = Reason;
export interface Settlement { resultId: ResultIdEnum | null; reason: Reason | null; explanation: string }
// v2: mercado no limite de 100 caracteres do canal é recusado, e rótulos de
// jogador novos. Trocar a versão faz toda sugestão antiga ser recalculada.
export const ENGINE_VERSION = '2026-09-15-capabilities-v3';
// Múltipla perde quando QUALQUER perna perde. Então PERDEU pode sair mesmo com
// perna indefinida ou escondida pelo corte do canal — GANHOU nunca: exige todas
// as pernas vistas e decididas. Em texto cortado a última perna visível é
// ignorada sempre, porque pode estar partida no meio ("Total de cartões" pode
// ter sido "Total de cartões 1ºT"). Só entram pernas "seleção - rótulo"
// completas, lidas uma a uma pelo mesmo parser das apostas simples.
function pernasAntesDoCorte(market: string, teams: Teams): Condition[] {
  const partes = market.split(/\s+\/\s+/).slice(0, -1).filter(p => /\s[-–—]\s/.test(p));
  return partes.flatMap(p => { const r = parseMarket(p, teams); return r.ok ? r.conditions : []; });
}
// Callers antigos declaram implicitamente futebol/tempo normal. Produção
// fornece sempre contexto explícito lido do banco, sem esse default.
export function settleBet(market: string, teams: Teams, score: FinalScore | null, eventStatus: string | null,
  context: SettlementContext = { sport:'football',scoreScope:'REGULATION' }): Settlement {
  const undecided=(reason: Reason, explanation: string): Settlement=>({resultId:null,reason,explanation});
  if (!['football','futebol','soccer'].includes(normalize(context.sport??''))) return undecided('ESPORTE_FORA_ESCOPO','esporte sem avaliador específico ou não identificado');
  if (eventStatus==null) return undecided('SEM_PLACAR','estado do evento não coletado');
  if (eventStatus!=='finished') return undecided('JOGO_NAO_FINALIZADO',`status "${eventStatus}"`);
  const avaliar=(conditions: Condition[])=>conditions.map(c=>MARKET_REGISTRY.find(d=>d.normalizedMarket===c.normalizedMarket)!.evaluator(c,{...context,score,teams}));
  const parsed=parseMarket(market,teams);
  if (!parsed.ok) {
    if (parsed.reason==='MERCADO_TRUNCADO') {
      const perdidas=avaliar(pernasAntesDoCorte(market,teams)).filter(o=>o.outcome==='LOST');
      if (perdidas.length) return {resultId:ResultIdEnum.LOST,reason:null,explanation:`${perdidas.map(o=>o.text).join('; ')}; texto cortado pelo canal, mas uma perna completa já perdeu`};
    }
    return undecided(parsed.reason,parsed.detail);
  }
  const outcomes=avaliar(parsed.conditions);
  const explanation=outcomes.map(o=>o.text).join('; ');
  // Antes de olhar indefinida ou anulada: perna perdida já decide a múltipla.
  if (outcomes.some(o=>o.outcome==='LOST')) return {resultId:ResultIdEnum.LOST,reason:null,explanation};
  const missing=outcomes.find(o=>o.outcome==='UNKNOWN');
  if (missing?.outcome==='UNKNOWN') return undecided(missing.reason,explanation);
  if (outcomes.length>1 && outcomes.some(o=>o.outcome==='VOID')) return undecided('PERNA_ANULADA',`odd ajustada não calculada: ${explanation}`);
  if (outcomes.some(o=>o.outcome==='VOID')) return {resultId:ResultIdEnum.CANCELED,reason:null,explanation};
  return {resultId:ResultIdEnum.WON,reason:null,explanation};
}

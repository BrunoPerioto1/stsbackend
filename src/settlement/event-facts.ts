import { Facts, Incident, PlayerStat, Stat } from './settlement.types';
import { validCount, validScore } from './market-evaluators';
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x==='object' && !Array.isArray(x);
const scope = (x: unknown) => ['REGULATION','FIRST_HALF','SECOND_HALF'].includes(x as string);
// Fronteira do JSONB. Um payload inválido não vira zero e não derruba o lote.
export function decodeFacts(raw: unknown): Facts {
  if (!object(raw)) return {};
  const facts: Facts = {};
  if (object(raw.periods)) {
    facts.periods={};
    for (const key of ['FIRST_HALF','SECOND_HALF'] as const) {
      const s=raw.periods[key];
      if (object(s) && validScore(s as unknown as {home:number;away:number})) facts.periods[key]={home:s.home as number,away:s.away as number};
    }
  }
  if (Array.isArray(raw.teamStats) && raw.teamStats.every(s=>object(s) && scope(s.scope) && typeof s.metric==='string' && validCount(s.home) && validCount(s.away))) facts.teamStats=raw.teamStats as Stat[];
  if (object(raw.incidents) && raw.incidents.complete===true && Array.isArray(raw.incidents.items) && raw.incidents.items.every(i=>object(i) && scope(i.scope) && ['GOAL','PENALTY_AWARDED','RED_CARD'].includes(i.type as string) && ['HOME','AWAY'].includes(i.side as string) && validCount(i.sequence))) facts.incidents={complete:true,items:raw.incidents.items as Incident[]};
  if (object(raw.playerStats) && raw.playerStats.complete===true && Array.isArray(raw.playerStats.items) && raw.playerStats.items.every(p=>object(p) && scope(p.scope) && typeof p.name==='string' && typeof p.participantId==='string' && typeof p.played==='boolean' && typeof p.metric==='string' && validCount(p.value))) facts.playerStats={complete:true,items:raw.playerStats.items as PlayerStat[]};
  return facts;
}

import { Condition, Evaluation, EvaluationContext, FinalScore, Reason, Scope } from './settlement.types';
import { normalize } from './market-parser';
export const unknown = (text: string, reason: Reason = 'DADO_INDISPONIVEL'): Evaluation => ({ outcome: 'UNKNOWN', reason, text });
const decided = (won: boolean, text: string): Evaluation => ({ outcome: won ? 'WON' : 'LOST', text });
export const validCount = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
export const validScore = (s: FinalScore | null | undefined): s is FinalScore => !!s && validCount(s.home) && validCount(s.away);
const result = (s: FinalScore) => s.home === s.away ? 'DRAW' : s.home > s.away ? 'HOME' : 'AWAY';
export function scoreFor(scope: Scope, ctx: EvaluationContext): FinalScore | null {
  if (scope === 'REGULATION') return ctx.scoreScope === 'REGULATION' && validScore(ctx.score) ? ctx.score : null;
  const score = ctx.periods?.[scope];
  if (!validScore(score)) return null;
  if (validScore(ctx.score) && ctx.scoreScope === 'REGULATION') {
    if (score.home > ctx.score.home || score.away > ctx.score.away) return null;
    const first = ctx.periods?.FIRST_HALF, second = ctx.periods?.SECOND_HALF;
    if (validScore(first) && validScore(second) && (first.home + second.home !== ctx.score.home || first.away + second.away !== ctx.score.away)) return null;
  }
  return score;
}
function compare(value: number, c: Condition, text: string): Evaluation {
  if (value === c.line && c.operator !== 'AT_LEAST') return { outcome: 'VOID', text: `${text}, exatamente a linha ${c.line}` };
  return decided(c.operator === 'UNDER' ? value < c.line! : c.operator === 'AT_LEAST' ? value >= c.line! : value > c.line!, text);
}
export function evaluateScore(c: Condition, ctx: EvaluationContext): Evaluation {
  const s = scoreFor(c.scope, ctx);
  if (!s) return unknown(`placar indisponível para ${c.scope}`);
  const text = `${s.home}x${s.away} (${c.scope})`;
  switch (c.normalizedMarket) {
    case 'TOTAL_GOLS': case 'TOTAL_GOLS_HT': return compare(s.home+s.away,c,`${s.home+s.away} gols no jogo, ${text}`);
    case 'TIME_TOTAL_GOLS': {
      const value = c.side === 'HOME' ? s.home : s.away;
      return compare(value,c,`${c.side === 'HOME' ? ctx.teams.home : ctx.teams.away} fez ${value}, ${text}`);
    }
    case 'AMBAS_MARCAM': return decided((s.home>0 && s.away>0) === c.expected,text);
    case 'RESULTADO_FINAL': case 'RESULTADO_1T': return decided(result(s)===c.pick,text);
    case 'RESULTADO_CORRETO': return decided(s.home===c.home && s.away===c.away,text);
    case 'DUPLA_CHANCE': return decided(c.picks!.includes(result(s)),text);
    case 'HANDICAP': {
      const diff = (c.side === 'HOME' ? s.home-s.away : s.away-s.home)+c.line!;
      return diff === 0 ? { outcome:'VOID',text:`handicap empatado: ${text}` } : decided(diff>0,`handicap ${c.line}: ${text}`);
    }
    case 'CLEAN_SHEET': case 'VENCER_SEM_SOFRER': {
      const clean = (c.side === 'HOME' ? s.away : s.home)===0;
      const met = clean && (c.normalizedMarket !== 'VENCER_SEM_SOFRER' || result(s)===c.side);
      return decided(met===c.expected,text);
    }
    default: return unknown('avaliador ausente','MERCADO_NAO_RECONHECIDO');
  }
}
export function evaluatePeriods(c: Condition, ctx: EvaluationContext): Evaluation {
  const first = scoreFor('FIRST_HALF',ctx), second = scoreFor('SECOND_HALF',ctx);
  if (!first) return unknown('placar do primeiro tempo indisponível');
  if (c.normalizedMarket==='INTERVALO_FINAL') {
    const ft = scoreFor('REGULATION',ctx);
    return ft ? decided(result(first)===c.picks![0] && result(ft)===c.picks![1],`intervalo ${first.home}x${first.away}; final ${ft.home}x${ft.away}`) : unknown('placar de tempo normal indisponível');
  }
  if (!second) return unknown('placar do segundo tempo indisponível');
  const met = c.side ? (c.side==='HOME' ? first.home>0 && second.home>0 : first.away>0 && second.away>0) : first.home+first.away>0 && second.home+second.away>0;
  return decided(met===c.expected,`1T ${first.home}x${first.away}; 2T ${second.home}x${second.away}`);
}
export function evaluateTeamStat(c: Condition, ctx: EvaluationContext): Evaluation {
  const rows = ctx.teamStats?.filter(s=>s.scope===c.scope && s.metric===c.metric) ?? [];
  if (rows.length!==1 || !validCount(rows[0].home) || !validCount(rows[0].away)) return unknown(`${c.metric} indisponível/duplicado em ${c.scope}`);
  if (c.metric==='cards' && ctx.cardCounting!=='YELLOW_PLUS_RED') return unknown('contagem de cartões da casa não confirmada','REGRA_NAO_SUPORTADA');
  const s=rows[0];
  if (c.normalizedMarket==='EQUIPE_MAIS_ESCANTEIOS') return decided(result(s)===c.pick,`escanteios ${s.home}x${s.away}`);
  const value=c.side==='HOME' ? s.home : c.side==='AWAY' ? s.away : s.home+s.away;
  return compare(value,c,`${c.metric}: ${value} (${c.scope})`);
}
export function evaluateIncidents(c: Condition, ctx: EvaluationContext): Evaluation {
  const feed=ctx.incidents;
  if (!feed?.complete || !Array.isArray(feed.items)) return unknown('incidentes completos indisponíveis');
  if (feed.items.some(i=>!['GOAL','PENALTY_AWARDED','RED_CARD'].includes(i.type) || !['HOME','AWAY'].includes(i.side) || !['REGULATION','FIRST_HALF','SECOND_HALF'].includes(i.scope) || !validCount(i.sequence))) return unknown('incidentes inválidos');
  const items=feed.items.filter(i=>i.scope===c.scope);
  if (c.normalizedMarket==='PENALTI_NO_JOGO' || c.normalizedMarket==='CARTAO_VERMELHO') {
    const type=c.normalizedMarket==='PENALTI_NO_JOGO' ? 'PENALTY_AWARDED' : 'RED_CARD';
    return decided(items.some(i=>i.type===type)===c.expected,`${type}: ${items.filter(i=>i.type===type).length}`);
  }
  const goals=items.filter(i=>i.type==='GOAL').sort((a,b)=>a.sequence-b.sequence), s=scoreFor(c.scope,ctx);
  if (!s || goals.filter(g=>g.side==='HOME').length!==s.home || goals.filter(g=>g.side==='AWAY').length!==s.away || new Set(goals.map(g=>g.sequence)).size!==goals.length) return unknown('gols do feed não reconciliam com o placar/ordem');
  const goal=c.normalizedMarket==='ULTIMO_GOL' ? goals[goals.length-1] : goals[(c.ordinal??1)-1];
  return decided((goal?.side??'NONE')===c.pick,`gol selecionado: ${goal?.side??'nenhum'}`);
}
export function evaluatePlayer(c: Condition, ctx: EvaluationContext): Evaluation {
  const feed=ctx.playerStats;
  if (!feed?.complete || !Array.isArray(feed.items)) return unknown('estatísticas completas de jogadores indisponíveis');
  const rows=feed.items.filter(p=>typeof p.name==='string' && normalize(p.name)===c.participant && p.scope===c.scope);
  if (!rows.length || new Set(rows.map(p=>p.participantId)).size!==1 || rows.some(p=>!p.participantId || p.played!==true)) return unknown('jogador ausente, homônimo ou participação não confirmada');
  const metrics=c.metric==='goalsAssists' ? ['goals','assists'] : [c.metric!];
  let value=0;
  for (const metric of metrics) {
    const matching=rows.filter(r=>r.metric===metric);
    if (matching.length!==1 || !validCount(matching[0].value)) return unknown(`estatística ${metric} indisponível/duplicada`);
    value+=matching[0].value;
  }
  if (c.metric==='cards' && ctx.cardCounting!=='YELLOW_PLUS_RED') return unknown('regra de cartões da casa não confirmada','REGRA_NAO_SUPORTADA');
  return compare(value,c,`${c.participant}: ${c.metric} = ${value}`);
}

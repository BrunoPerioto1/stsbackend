import { Capability, MarketDefinition } from './settlement.types';
import { parseScoreMarket, parsePeriods, parseTeamStat, parseIncidents, parsePlayer } from './market-parser';
import { evaluateScore, evaluatePeriods, evaluateTeamStat, evaluateIncidents, evaluatePlayer, unknown } from './market-evaluators';
function definitions(names: string[], requiredData: Capability[], parser: MarketDefinition['parser'], evaluator: MarketDefinition['evaluator'], status: MarketDefinition['status']): MarketDefinition[] {
  return names.map(normalizedMarket=>({ normalizedMarket, aliases: ALIASES[normalizedMarket] ?? [normalizedMarket.toLowerCase().replace(/_/g,' ')], requiredData, confidence:'HIGH', unsupportedReason:'DADO_INDISPONIVEL', status,
    parser: (text,teams)=>{ const parsed=parser(text,teams); return parsed?.normalizedMarket===normalizedMarket ? parsed : null; }, evaluator }));
}
const ALIASES: Record<string,string[]> = {
  RESULTADO_FINAL:['resultado final','resultado da partida','1x2','ml','vencedor'], TOTAL_GOLS:['total de gols','over','under','o2.5','u1.5'],
  AMBAS_MARCAM:['ambas marcam','ambos os times marcam','btts'], RESULTADO_CORRETO:['resultado correto','placar exato'],
  DUPLA_CHANCE:['dupla chance','chance dupla','double chance'], HANDICAP:['handicap','handicap asiatico'],
  CLEAN_SHEET:['clean sheet','sem sofrer gols'], RESULTADO_1T:['resultado do primeiro tempo','1º tempo 1x2'],
  TOTAL_GOLS_HT:['total de gols ht','1º tempo - total de gols'], TOTAL_ESCANTEIOS:['escanteios','corners'], TOTAL_CARTOES:['cartoes','cards'],
  JOGADOR_MARCA:['marcar a qualquer momento','jogador para marcar'], JOGADOR_GOL_OU_ASSISTENCIA:['gol ou assistencia','jogador marcar ou dar assistencia'],
};
export const MARKET_REGISTRY: readonly MarketDefinition[] = [
  ...definitions(['RESULTADO_FINAL','TOTAL_GOLS','AMBAS_MARCAM','RESULTADO_CORRETO','DUPLA_CHANCE','HANDICAP','CLEAN_SHEET','VENCER_SEM_SOFRER','TIME_TOTAL_GOLS'],['SCORE_FULL_TIME'],parseScoreMarket,evaluateScore,'SUPORTADO'),
  ...definitions(['RESULTADO_1T','TOTAL_GOLS_HT'],['SCORE_PERIODS'],parseScoreMarket,evaluateScore,'PARCIAL'),
  ...definitions(['INTERVALO_FINAL'],['SCORE_PERIODS','SCORE_FULL_TIME'],parsePeriods,evaluatePeriods,'PARCIAL'),
  ...definitions(['AMBOS_TEMPOS_COM_GOL','TIME_MARCA_EM_AMBOS_TEMPOS'],['SCORE_PERIODS'],parsePeriods,evaluatePeriods,'PARCIAL'),
  ...definitions(['TOTAL_ESCANTEIOS','TIME_TOTAL_ESCANTEIOS','EQUIPE_MAIS_ESCANTEIOS','TOTAL_CARTOES','TIME_TOTAL_CARTOES','TOTAL_CHUTES','TOTAL_CHUTES_A_GOL','FALTAS','IMPEDIMENTOS','DEFESAS'],['TEAM_STATS'],parseTeamStat,evaluateTeamStat,'PARCIAL'),
  ...definitions(['PRIMEIRO_GOL','PROXIMO_GOL','ULTIMO_GOL'],['INCIDENTS','SCORE_FULL_TIME'],parseIncidents,evaluateIncidents,'PARCIAL'),
  ...definitions(['PENALTI_NO_JOGO','CARTAO_VERMELHO'],['INCIDENTS'],parseIncidents,evaluateIncidents,'PARCIAL'),
  ...definitions(['JOGADOR_MARCA','JOGADOR_ASSISTENCIA','JOGADOR_GOL_OU_ASSISTENCIA','JOGADOR_CHUTE_A_GOL','TOTAL_CHUTES_JOGADOR','CARTAO_JOGADOR'],['PLAYER_STATS'],parsePlayer,evaluatePlayer,'PARCIAL'),
  { normalizedMarket:'GOL_MAIS_RAPIDO', aliases:['jogo com o gol mais rapido'], requiredData:['INCIDENTS'], confidence:'HIGH', unsupportedReason:'VARIOS_JOGOS', status:'INDEFINIDO', parser:()=>null, evaluator:()=>unknown('comparação entre jogos exige todos os eventos','VARIOS_JOGOS') },
];
export function requiredDataFor(c: import('./settlement.types').Condition): readonly Capability[] {
  const data=MARKET_REGISTRY.find(d=>d.normalizedMarket===c.normalizedMarket)?.requiredData ?? [];
  return c.scope!=='REGULATION' ? data.map(d=>d==='SCORE_FULL_TIME' ? 'SCORE_PERIODS' : d) : data;
}

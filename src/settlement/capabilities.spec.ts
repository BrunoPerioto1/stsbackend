import { settleBet } from './settle';
import { parseMarket } from './market-conditions';
import { MARKET_REGISTRY, requiredDataFor } from './market-registry';
import { decodeFacts } from './event-facts';
import { SettlementContext } from './settlement.types';
import { ResultIdEnum as R } from '../bet/dto/result-id.enum';

const teams={home:'Flamengo',away:'Palmeiras'};
const context: SettlementContext={sport:'Futebol',scoreScope:'REGULATION',
  periods:{FIRST_HALF:{home:1,away:0},SECOND_HALF:{home:1,away:1}},
  teamStats:[{scope:'REGULATION',metric:'corners',home:6,away:3},{scope:'FIRST_HALF',metric:'corners',home:2,away:1},
    ...['shots','shotsOnTarget','fouls','offsides','saves','cards'].map(metric=>({scope:'REGULATION' as const,metric,home:3,away:2}))],
  incidents:{complete:true,items:[
    {type:'GOAL',scope:'REGULATION',side:'HOME',sequence:1},
    {type:'GOAL',scope:'REGULATION',side:'AWAY',sequence:2},
    {type:'GOAL',scope:'REGULATION',side:'HOME',sequence:3},
    {type:'PENALTY_AWARDED',scope:'REGULATION',side:'HOME',sequence:4}]},
  playerStats:{complete:true,items:['goals','assists','shots','shotsOnTarget','cards'].map((metric,i)=>({scope:'REGULATION',name:'Pedro',participantId:'p1',played:true,metric,value:[0,1,3,2,1][i]}))},
};
const run=(market:string,ctx: SettlementContext=context,score={home:2,away:1})=>settleBet(market,teams,score,'finished',ctx);

describe('mercados por capacidades',()=>{
  it.each([
    ['Flamengo ou Empate - Resultado final',R.WON],['X2 / Dupla chance',R.LOST],['12 / Chance dupla',R.WON],
    ['Flamengo -1.5 - Handicap',R.LOST],['Flamengo -1 - Handicap asiático',R.CANCELED],
    ['Palmeiras +1.5 - Handicap',R.WON],['Flamengo - Clean sheet',R.LOST],
    ['Flamengo para vencer de zero - Resultado final',R.LOST],['Flamengo vencer sem tomar gols',R.LOST],
    ['Flamengo mais de 1.5 / Total de Gols',R.WON],
    ['Flamengo / Resultado do Primeiro Tempo',R.WON],['Empate / Resultado final 2º tempo',R.WON],
    ['Mais de (0.5) / 1º Tempo - Total de Gols',R.WON],['Menos de 1.5 Gols HT / Total de Gols HT',R.WON],
    ['Flamengo / Flamengo - Intervalo/Final',R.WON],
    ['Sim - Ambos os tempos mais de 0.5 gols',R.WON],['Flamengo para marcar em ambos os tempos - Sim',R.WON],
    ['Mais de 8.5 / Total de escanteios',R.WON],['Flamengo mais de 5.5 - Escanteios',R.WON],
    ['Palmeiras - Equipe com mais escanteios',R.LOST],['Mais de 3.5 - Total de escanteios 1ºT',R.LOST],
    ['Mais de 4.5 - Total de chutes',R.WON],['Menos de 4.5 / Totais chutes a Gol',R.LOST],
    ['Mais de 4.5 - Faltas',R.WON],['Menos de 5.5 - Impedimentos',R.WON],['Mais de 5 - Defesas',R.CANCELED],
    ['Flamengo - Primeiro gol',R.WON],['Palmeiras - Próximo gol 2',R.WON],['Flamengo - Último gol',R.WON],
    ['Sim - Pênalti no jogo',R.WON],['Não - Cartão vermelho',R.WON],
    ['Pedro - Jogador para marcar',R.LOST],['Pedro - Jogador assistência',R.WON],
    ['Pedro mais de 0.5 - Gol ou assistência',R.WON],['Pedro mais de 1.5 - Chutes a gol do jogador',R.WON],
    ['Pedro 3+ - Total de chutes do jogador',R.WON],
    ['Sim / Mais de 2.5 / Ambos os Times Marcam / Total de Gols',R.WON],
    ['Mais de (2.5) e Sim / Total de Gols e Ambas as Equipes Marcam',R.WON],
    ['Flamengo e mais de 3.5 - Resultado final e total de gols',R.LOST],['BTTS e 3+ gols',R.WON],
  ])('%s',(market,result)=>expect(run(market as string).resultId).toBe(result));

  it.each(['Mais de 8.5 - Escanteios','Mais de 0.5 - Total de gols 1ºT','Flamengo - Primeiro gol','Pedro - Jogador para marcar'])('dados ausentes: %s',market=>{
    expect(run(market,{sport:'football',scoreScope:'REGULATION'})).toMatchObject({resultId:null,reason:'DADO_INDISPONIVEL'});
  });
  it('cartões exigem regra da casa tanto para equipe quanto jogador',()=>{
    for (const market of ['Mais de 4.5 - Cartões','Pedro - Cartões do jogador']) {
      expect(run(market)).toMatchObject({resultId:null,reason:'REGRA_NAO_SUPORTADA'});
      expect(run(market,{...context,cardCounting:'YELLOW_PLUS_RED'}).resultId).toBe(R.WON);
    }
  });
  it.each(['Basquete','Tênis','Beisebol','Hóquei no Gelo','eSports',null])('esporte fora do escopo: %s',sport=>{
    expect(run('Mais de 2.5 gols',{...context,sport})).toMatchObject({resultId:null,reason:'ESPORTE_FORA_ESCOPO'});
  });
  it.each(['Flamengo -1 - Handicap','Flamengo -0.25 - Handicap asiático','Sim / Resultado Final','Todos para Ganhar / Resultado Final','2-0 ou 3-0 / Resultado Correto','Flamengo para classificar','Mais de 2.5 gols incluindo prorrogação','Flamengo - Próximo gol','Flamengo x Palmeiras - Jogo com o gol mais rápido','Flamengo ML / desconhecido','Sim - Ambas marcam só no segundo tempo','Mais de 1.5 gols entre 10 e 20 minutos','Mais de 2.5 gols /','Flamengo vence por 2 gols de diferença','Pedro e Gabriel - Jogador para marcar'])('não adivinha: %s',market=>expect(run(market).resultId).toBeNull());
  it('qualificadores desconhecidos não desaparecem',()=>{
    for (const m of ['Sim - Ambas marcam','Flamengo - Resultado final','Mais de 2.5 gols','Pedro - Jogador para marcar']) {
      expect(run(m+' somente após o intervalo').resultId).toBeNull();
    }
  });
  it('perna desconhecida/dado ausente/push impede liquidar parcialmente',()=>{
    expect(run('Palmeiras - Resultado final / Mais de 3 - Total de gols')).toMatchObject({resultId:null,reason:'PERNA_ANULADA'});
    expect(run('Palmeiras - Resultado final / Pedro - Jogador para marcar',{...context,playerStats:undefined})).toMatchObject({resultId:null,reason:'DADO_INDISPONIVEL'});
    expect(run('Palmeiras - Resultado final / desconhecido').resultId).toBeNull();
  });
  it('placar inválido ou de prorrogação não resolve tempo normal',()=>{
    for (const value of [NaN,Infinity,-1,1.5]) expect(run('Mais de 2.5 gols',context,{home:value,away:1}).resultId).toBeNull();
    expect(run('Mais de 2.5 gols',{...context,scoreScope:'EXTRA_TIME'}).resultId).toBeNull();
    expect(run('Flamengo - Resultado final 1º tempo',{...context,periods:{FIRST_HALF:{home:3,away:0}}}).resultId).toBeNull();
  });
  it('estatísticas precisam ter escopo correto e registro único',()=>{
    expect(run('Mais de 4.5 - Chutes 1º tempo').resultId).toBeNull();
    expect(run('Mais de 8.5 - Escanteios',{...context,teamStats:[context.teamStats![0],context.teamStats![0]]}).resultId).toBeNull();
  });
  it('incidentes incompletos ou contraditórios não provam ausência nem ordem',()=>{
    expect(run('Não - Pênalti no jogo',{...context,incidents:{complete:false,items:[]}}).resultId).toBeNull();
    expect(run('Flamengo - Primeiro gol',{...context,incidents:{complete:true,items:[]}}).resultId).toBeNull();
    expect(run('Flamengo - Primeiro gol',{...context,incidents:{complete:true,items:context.incidents!.items.map(i=>({...i,sequence:1}))}}).resultId).toBeNull();
  });
  it('jogador ausente, homônimo, não participante e métrica ausente são desconhecidos',()=>{
    const row=context.playerStats!.items[0];
    for (const items of [[],[{...row,played:false}],[row,{...row,participantId:'other'}],[row,row]]) {
      expect(run('Pedro - Jogador para marcar',{...context,playerStats:{complete:true,items}}).resultId).toBeNull();
    }
    expect(run('Pedro - Gol ou assistência',{...context,playerStats:{complete:true,items:[row]}}).resultId).toBeNull();
  });
  it('JSON inválido é descartado sem inventar fatos',()=>{
    expect(decodeFacts({teamStats:[null],playerStats:{complete:true,items:[{}]},incidents:{complete:true,items:['x']}})).toEqual({});
    expect(decodeFacts(null)).toEqual({});
  });
  it('registry tem metadados completos e requisitos por escopo',()=>{
    expect(new Set(MARKET_REGISTRY.map(d=>d.normalizedMarket)).size).toBe(MARKET_REGISTRY.length);
    for (const d of MARKET_REGISTRY) { expect(d.aliases.length).toBeGreaterThan(0); expect(d.requiredData.length).toBeGreaterThan(0); }
    const parsed=parseMarket('Empate / Resultado final 2º tempo',teams);
    expect(parsed.ok && requiredDataFor(parsed.conditions[0])).toEqual(['SCORE_PERIODS']);
  });
});

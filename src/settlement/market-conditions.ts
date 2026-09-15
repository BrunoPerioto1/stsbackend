import { MARKET_REGISTRY } from './market-registry';
import { normalize, labels, scoped, splitLabel, resultPick, parseScoreMarket, yesNo } from './market-parser';
import { Condition, ParseResult, Reason, Teams } from './settlement.types';
export type { Condition, Teams, ParseResult } from './settlement.types';
export type ParseFailure = Reason;
const fail = (reason: Reason, detail: string): ParseResult => ({ ok:false,reason,detail });
function compound(text: string, teams: Teams): Condition[] | null {
  const { selection, label } = splitLabel(text.replace(/\s+\/\s+/g, ' - '));
  const scope = scoped(text)?.scope;
  if (scope !== 'REGULATION') return null;
  if (/^(resultado final e total de gols|resultado da partida \+ total de gols)$/.test(label)) {
    const m = /^(.+?)\s+e\s+(.+)$/.exec(selection);
    if (!m) return null;
    const pick = resultPick(m[1].replace(/\s+para ganhar$/, ''), teams);
    const total = parseScoreMarket(`${m[2]} - total de gols`, teams);
    return pick && total?.normalizedMarket === 'TOTAL_GOLS' ? [{normalizedMarket:'RESULTADO_FINAL',scope:'REGULATION',pick}, total] : null;
  }
  if (/^(total de gols e ambas as equipes marcam|total e ambas equipes marcam)$/.test(label)) {
    const m = /^(.+?) e (sim|nao)$/.exec(selection);
    const total = m && parseScoreMarket(`${m[1]} - total de gols`, teams);
    return total?.normalizedMarket==='TOTAL_GOLS' ? [total,{normalizedMarket:'AMBAS_MARCAM',scope:'REGULATION',expected:yesNo(m![2])!}] : null;
  }
  if (!label) {
    const m = /^(ambas marcam|btts) e (.+)$/.exec(selection);
    const total = m && parseScoreMarket(`${m[2]} - total de gols`, teams);
    return total?.normalizedMarket==='TOTAL_GOLS' ? [{normalizedMarket:'AMBAS_MARCAM',scope:'REGULATION',expected:true},total] : null;
  }
  return null;
}
function single(text: string, teams: Teams): Condition | null {
  const matches=MARKET_REGISTRY.map(d=>d.parser(text,teams)).filter((c): c is Condition=>!!c);
  return matches.length===1 ? matches[0] : null;
}
function isLabel(text: string): boolean {
  const s=scoped(text)?.text ?? text;
  return Object.values(labels).some(p=>p.test(s)) || /^(?:total de |total |totais )?(?:escanteios|corners|cartoes(?: amarelos)?|cards|chutes(?: a gol| ao gol| no gol)?|faltas|impedimentos|defesas)(?: mais\/menos)?$/.test(s) || /^(?:dupla chance|chance dupla|double chance|handicap(?: asiatico)?|clean sheet|sem sofrer gols|mais escanteios|equipe com mais escanteios|escanteios 1x2|(?:maior numero de|equipe com mais|time com mais) (?:escanteios|cartoes|chutes ao gol|chutes a gol|chutes no gol|chutes)|(?:ganhar|vencer) sem (?:sofrer|tomar|levar) gols?|primeiro gol|ultimo gol|proximo gol (?:\(gol )?\d+\)?|penalti no jogo|cartao vermelho|marcar a qualquer momento|marcar em qualquer momento|jogador para marcar|jogador assistencia|assistencias do jogador|gol ou assistencia|jogador marcar ou dar assistencia|marcar gol ou dar assistencia|chutes a gol do jogador|total de chutes do jogador|cartoes do jogador)$/.test(s);
}
// O canal de tips corta a linha do mercado em 100 caracteres: conferido contra
// tips.text, onde a linha termina em "Handicap de escan" e a odd vem logo abaixo.
// Com exatamente 100 não dá pra saber se faltou uma perna — uma múltipla de 3
// cortada bem na fronteira vira uma de 2 perfeitamente válida, e seria proposta
// como ganha sem a perna que ficou de fora. Em code points, como o length() do
// Postgres, que foi onde o pico de 697 apostas em 100 apareceu.
export const LIMITE_DO_CANAL = 100;
export function parseMarket(market: string, teams: Teams): ParseResult {
  if ([...(market ?? '')].length === LIMITE_DO_CANAL) return fail('MERCADO_TRUNCADO',`texto no limite de ${LIMITE_DO_CANAL} caracteres do canal; pode faltar perna`);
  const text=normalize(market??'');
  if (!text) return fail('MERCADO_NAO_RECONHECIDO','mercado vazio');
  if (/\b(?:prorrogacao|extra time|penaltis|incluindo|classificar|classificacao)\b/.test(text)) return fail('ESCOPO_NAO_SUPORTADO','escopo além do tempo normal ou qualificação');
  if (/\b(?:nos? \d+ jogos?|nas? \d+ partidas?|cada partida|todos os jogos|todas as partidas|todos os times|todas as equipes|rodada|jogo com o gol mais rapido|multipla)\b/.test(text)) return fail('VARIOS_JOGOS','agregado/comparação entre jogos');
  const combined=compound(text,teams);
  if (combined) return {ok:true,conditions:combined};
  const direct=single(text,teams);
  if (direct) return { ok:true,conditions:[direct] };
  // Consome toda a entrada. Rotulo após seleção só é unido se a gramática
  // completa do mercado o reconhecer; nenhum fragmento desconhecido é ignorado.
  const parts=text.split(/\s+\/\s+|\s+·\s+/).map(s=>s.trim());
  if (parts.length>12 || parts.some(p=>!p)) return fail('MERCADO_NAO_RECONHECIDO','separação inválida');
  const paths: Condition[][]=[];
  function visit(i: number, conditions: Condition[]) {
    if (i===parts.length) { paths.push(conditions); return; }
    if (i+1<parts.length && isLabel(parts[i+1])) {
      const c=single(`${parts[i]} - ${parts[i+1]}`,teams);
      if (c) { visit(i+2,[...conditions,c]); return; }
    }
    const c=single(parts[i],teams);
    if (c) visit(i+1,[...conditions,c]);
  }
  visit(0,[]);
  if (paths.length===1 && paths[0].length) return { ok:true,conditions:paths[0] };
  // Formato real: seleções primeiro, depois respectivos rótulos.
  if (parts.length>=4 && parts.length%2===0) {
    const n=parts.length/2;
    if (parts.slice(n).every(isLabel)) {
      const cs=parts.slice(0,n).map((s,i)=>single(`${s} - ${parts[n+i]}`,teams));
      if (cs.every((c): c is Condition=>!!c)) return { ok:true,conditions:cs };
    }
  }
  if (/\bou\b/.test(text)) return fail('CONDICAO_ALTERNATIVA','alternativa sem gramática inequívoca');
  if (/\be\b/.test(text) && /mais|menos|resultado|marcam/.test(text)) return fail('COMBINADA_NAO_SEPARADA','condições sem separação inequívoca');
  if (/gols/.test(text) && (text.includes(normalize(teams.home)) || text.includes(normalize(teams.away))) && /\bx\b/.test(text)) return fail('GOLS_DE_UM_TIME','confronto não identifica lado da seleção');
  return fail('MERCADO_NAO_RECONHECIDO',`seleção, participante ou rótulo ambíguo: "${market}"`);
}

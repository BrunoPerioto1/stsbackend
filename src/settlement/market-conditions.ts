import { MARKET_REGISTRY } from './market-registry';
import { normalize, labels, scoped, splitLabel, resultPick, parseScoreMarket, yesNo, teamPick } from './market-parser';
import { Condition, ParseResult, Reason, Teams } from './settlement.types';
export type { Condition, Teams, ParseResult } from './settlement.types';
export type ParseFailure = Reason;
const fail = (reason: Reason, detail: string): ParseResult => ({ ok:false,reason,detail });
function compound(text: string, teams: Teams): Condition[] | null {
  const { selection, label } = splitLabel(text.replace(/\s+\/\s+/g, ' - '));
  const scope = scoped(text)?.scope;
  if (scope !== 'REGULATION') return null;
  // " + " já chega como " e " (ver abreviacoes). "1x2 e total" é o mesmo mercado.
  // Linha às vezes repetida no rótulo ("total de gols 2.5") e "e" omitido na
  // seleção ("Espanha mais de 2.5 - 1x2 e total").
  if (/^(?:resultado final|resultado da partida|resultado|1x2|vencedor do encontro) e total(?: de gols)?(?: \d+(?:[.,]\d+)?)?$/.test(label)) {
    const m = /^(.+?)\s+e\s+(.+)$/.exec(selection) ?? /^(.+?)\s+((?:mais|menos) de .+)$/.exec(selection);
    if (!m) return null;
    const pick = resultPick(m[1].replace(/\s+para ganhar$/, ''), teams);
    const total = parseScoreMarket(`${m[2]} - total de gols`, teams);
    return pick && total?.normalizedMarket === 'TOTAL_GOLS' ? [{normalizedMarket:'RESULTADO_FINAL',scope:'REGULATION',pick}, total] : null;
  }
  if (/^(total de gols e ambas as equipes marcam|total e ambas equipes marcam|total e ambas marcam|total de gols e ambas marcam)$/.test(label)) {
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
  if (matches.length===1) return matches[0];
  // Formato em lista junta seleção e rótulo com a métrica repetida: "Mais de
  // 2.5 Gols / Total de Gols" vira "mais de 2.5 gols - total de gols". Tira a
  // métrica da seleção e tenta de novo — o rótulo continua dizendo qual é.
  const repetida = /^(.*\d)\s+(?:gols?|escanteios|cartoes|chutes(?: no gol| a gol| ao gol)?|finalizacoes)( - .+)$/.exec(text);
  return !matches.length && repetida ? single(repetida[1] + repetida[2], teams) : null;
}
function isLabel(text: string): boolean {
  const s=scoped(text)?.text ?? text;
  return Object.values(labels).some(p=>p.test(s)) || /^(?:total de |total |totais )?(?:escanteios|corners|cartoes(?: amarelos)?|cards|chutes(?: a gol| ao gol| no gol)?|faltas|impedimentos|defesas)(?: mais\/menos)?$/.test(s) || /^(?:dupla chance|chance dupla|double chance|dupla hipotese|handicap(?: asiatico)?|clean sheet|sem sofrer gols|mais escanteios|equipe com mais escanteios|escanteios 1x2|(?:maior numero de|equipe com mais|time com mais) (?:escanteios|cartoes|chutes ao gol|chutes a gol|chutes no gol|chutes)|(?:ganhar|vencer) sem (?:sofrer|tomar|levar) gols?|primeiro gol|ultimo gol|proximo gol (?:\(gol )?\d+\)?|penalti no jogo|cartao vermelho|marcar a qualquer momento|marcar em qualquer momento|marcador a qualquer momento|para marcar a qualquer momento|a marcar a qualquer momento|a marcar|marcar gol|1o gol|(?:vencer|ganhar) (?:cada tempo|ambos os tempos)|jogador para marcar|jogador assistencia|assistencias do jogador|gol ou assistencia|jogador marcar ou dar assistencia|marcar gol ou dar assistencia|chutes a gol do jogador|total de chutes do jogador|cartoes do jogador)$/.test(s);
}
// Combinada do mesmo jogo escrita como frase, do jeito que o canal manda:
// "Palmeiras vence e tem mais escanteios - Resultado final e escanteios",
// "Bahia ganha 1º tempo e Bahia tem mais chutes ao gol -", "0-0 HT e u3.5 gols".
// Cada cláusula vira um mercado canônico e passa pelo mesmo registro das
// apostas simples. Cláusula que não case derruba a aposta inteira: liquidar só
// a parte entendida daria GANHOU sem a perna que ficou de fora. O escopo é de
// cada cláusula — "1º tempo" numa perna não vaza pra outra.
const ESTATISTICA_DE_EQUIPE = 'escanteios|cartoes|chutes ao gol|chutes a gol|chutes no gol|chutes';
function clausulas(text: string, teams: Teams): Condition[] | null {
  const partes = text.replace(/\s+-\s*$/, '').split(/\s+[-–—]\s+/);
  if (partes.length > 2) return null;
  const [selecao, rotulo = ''] = partes;
  const frases = selecao.split(/\s+e\s+/);
  if (frases.length < 2 || frases.length > 4) return null;
  const rotulos = rotulo ? rotulo.split(/\s+e\s+/) : [];
  // "Bahia marcar em ambos os tempos e ter mais escanteios": a segunda cláusula
  // herda o time da primeira.
  let sujeito: string | null = null;
  const time = (nome: string | undefined): string | null => {
    if (!nome) return sujeito;
    if (!teamPick(nome, teams)) return null;
    sujeito = nome;
    return nome;
  };
  const canonicos = frases.map((frase): string | null => {
    const vitoria1T = /^(.+?) (?:para )?(?:vence|vencer|ganha|ganhar) (?:o )?(?:1o tempo|primeiro tempo)$/.exec(frase);
    if (vitoria1T) return time(vitoria1T[1]) && `${vitoria1T[1]} - resultado do 1o tempo`;
    const vitoria = /^(.+?) (?:para )?(?:vence|vencer|ganha|ganhar)$/.exec(frase);
    if (vitoria) return time(vitoria[1]) && `${vitoria[1]} - resultado final`;
    const mais = new RegExp(`^(?:(.+?) )?(?:tem|ter|com) mais (${ESTATISTICA_DE_EQUIPE})$`).exec(frase);
    if (mais) { const quem = time(mais[1]); return quem && `${quem} - maior numero de ${mais[2]}`; }
    const ambosTempos = /^(?:(.+?) )?(?:para )?marcar? em ambos os tempos$/.exec(frase);
    if (ambosTempos) { const quem = time(ambosTempos[1]); return quem && `${quem} marcar em ambos os tempos - sim`; }
    if (labels.both.test(frase)) return 'sim - ambas marcam';
    const over = /^(?:\+|o|mais de )\s*(\d+(?:[.,]\d+)?) gols?$/.exec(frase);
    if (over) return `mais de ${over[1]} - total de gols`;
    const under = /^(?:-|u|menos de )\s*(\d+(?:[.,]\d+)?) gols?$/.exec(frase);
    if (under) return `menos de ${under[1]} - total de gols`;
    // "mais de 9.5 escanteios", "menos de 4.5 cartoes": total do jogo.
    const estatistica = /^(mais|menos) de (\d+(?:[.,]\d+)?) (escanteios|cartoes|chutes ao gol|chutes a gol|chutes no gol|chutes)$/.exec(frase);
    if (estatistica) return `${estatistica[1]} de ${estatistica[2]} - total de ${estatistica[3]}`;
    const placar1T = /^(\d{1,2})\s*[-x]\s*(\d{1,2}) (?:ht|no intervalo|1o tempo)$/.exec(frase);
    if (placar1T) return `${placar1T[1]}-${placar1T[2]} - resultado correto 1o tempo`;
    const marca = /^(.+?) (?:marca|marcar|para marcar) (?:a|em) qualquer momento$/.exec(frase);
    if (marca && !teamPick(marca[1], teams)) return `${marca[1]} - marcar a qualquer momento`;
    return null;
  });
  const pendentes = canonicos.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
  for (const i of pendentes) {
    // Cláusula sem verbo ("mais de 10.5") usa o rótulo: pareado quando há um
    // rótulo por cláusula, ou o rótulo único quando só UMA cláusula precisa dele.
    const rot = rotulos.length === frases.length ? rotulos[i] : rotulos.length === 1 && pendentes.length === 1 ? rotulos[0] : '';
    if (rot && !labels.result.test(rot)) { canonicos[i] = `${frases[i]} - ${rot}`; continue; }
    // Time sozinho ("Los Angeles FC e +3.5 gols") só vale vitória ao lado de
    // total de gols, como o mercado composto que a casa já oferece.
    if (teamPick(frases[i], teams) && canonicos.some((c) => c?.endsWith('total de gols'))) canonicos[i] = `${frases[i]} - resultado final`;
  }
  if (canonicos.some((c) => !c)) return null;
  const condicoes = canonicos.map((c) => single(c!, teams));
  return condicoes.every((c): c is Condition => !!c) ? condicoes : null;
}
// "Cada equipe leva mais de 1.5 cartões - Total de cartões", "Sim - Ambas
// equipes receberão um cartão": uma frase, duas pernas — uma por time. Só a
// afirmação: "não" viraria "um OU outro", que não é combinada.
const CADA_EQUIPE = '(?:cada equipe|cada time|ambas (?:as )?equipes|os dois times)';
function cadaEquipe(text: string): Condition[] | null {
  const { selection, label } = splitLabel(text);
  const acima = new RegExp(`^${CADA_EQUIPE} (?:leva|levar|recebe|receber|tem|ter) mais de (\\d+(?:[.,]\\d+)?) cartoes$`).exec(selection);
  const umCartao = new RegExp(`^${CADA_EQUIPE} (?:recebera|receberao|recebem|receber|levam|levar|leva) (?:um|pelo menos um|1) cartao$`);
  let line: number | null = null;
  if (acima && (!label || /^(?:total de )?cartoes$/.test(label))) line = Number(acima[1].replace(',', '.'));
  else if ((umCartao.test(label) && yesNo(selection) === true) || (umCartao.test(selection) && (!label || yesNo(label) === true))) line = 0.5;
  if (line === null || !Number.isFinite(line) || (line * 2) % 1 !== 0) return null;
  return (['HOME', 'AWAY'] as const).map((side): Condition => ({ normalizedMarket: 'TIME_TOTAL_CARTOES', scope: 'REGULATION', metric: 'cardPoints', operator: 'OVER', line, side }));
}
// O canal de tips corta a linha do mercado em 100 caracteres: conferido contra
// tips.text, onde a linha termina em "Handicap de escan" e a odd vem logo abaixo.
// Com exatamente 100 não dá pra saber se faltou uma perna — uma múltipla de 3
// cortada bem na fronteira vira uma de 2 perfeitamente válida, e seria proposta
// como ganha sem a perna que ficou de fora. Em code points, como o length() do
// Postgres, que foi onde o pico de 697 apostas em 100 apareceu.
export const LIMITE_DO_CANAL = 100;
// Abreviações de tipster reescritas pra forma que o resto do parser já lê.
// Levantadas da planilha do grupo (2026-09-16, 41 mil apostas de futebol):
// "Colômbia ML e o2.5", "Flamengo under 4.5 cantos", "Paderborn DNB",
// "Argentina HT/FT", "Portugal vence a 0". Só troca texto por sinônimo exato —
// nenhuma regra decide resultado aqui.
const NUM = '(\\d+(?:[.,]\\d+)?)';
const METRICA = '(?:gols?|escanteios|cartoes|chutes)';
export function abreviacoes(text: string): string {
  let t = text
    .replace(/\s*\(incluindo linhas asiaticas\)/g, '')
    .replace(/\((\do tempo)\)/g, '$1')
    .replace(/\s*\(1x2\)/g, '')
    .replace(/\b1o tempo 1x2\b/g, 'resultado do 1o tempo')
    .replace(/\bdupla possibilidade\b/g, 'dupla chance')
    .replace(/\bambos marcam gol\b/g, 'ambos marcam')
    .replace(/\bcantos?\b|\besc\b/g, 'escanteios')
    .replace(/\bbtts\b/g, 'ambas marcam')
    .replace(/^ambas e /, 'ambas marcam e ')
    .replace(/\s+[+&]\s+/g, ' e ')
    .replace(/\b(?:resultado final|resultado)(?: -)? 1x2\b/g, 'resultado final')
    .replace(/\btotal de gols - mais\/menos\b/g, 'total de gols')
    // "o2.5" só com decimal: "vence o 1o tempo" não pode virar linha.
    .replace(new RegExp(`\\bover\\s*${NUM}|\\bo${NUM}(?=\\s|$)`, 'g'), (_, a, b) => `mais de ${a ?? b}`)
    .replace(new RegExp(`\\bunder\\s*${NUM}|\\bu${NUM}(?=\\s|$)`, 'g'), (_, a, b) => `menos de ${a ?? b}`)
    .replace(new RegExp(`(^|\\s)\\+${NUM}(?=\\s+${METRICA})`, 'g'), '$1mais de $2')
    .replace(new RegExp(`(^|\\s)-${NUM}(?=\\s+${METRICA})`, 'g'), '$1menos de $2')
    .replace(new RegExp(`(\\d)\\s+(${METRICA})\\s+(?:na partida|no jogo|ft)\\b`, 'g'), '$1 $2')
    .replace(/\s+ft\b/g, '')
    .replace(/\bvence(r)? o (1o tempo|primeiro tempo|ht)\b/g, 'vence $2')
    .replace(/\bvencer? (?:a|de) (?:0|zero)\b/g, 'vence de zero')
    .replace(/\bht\b(?!\/)/g, '1o tempo')
    // "over 2.5 gols e 9.5 cantos": a segunda linha herda o "mais de".
    .replace(new RegExp(`\\b(mais|menos) de ${NUM} (${METRICA}) e ${NUM} (${METRICA})\\b`, 'g'), '$1 de $2 $3 e $1 de $4 $5');
  // Linha solta sem métrica ("o3.5", "mais de 2.5 1o tempo") é total de gols.
  // Só quando a cláusula inteira é a linha ("Colômbia ML e o2.5"): com rótulo,
  // time ou métrica junto, quem decide é o resto do parser.
  t = t.replace(new RegExp(`(^| e |\\S )(mais|menos) de ${NUM}(?![\\d.,])(\\s+1o tempo)?(?= e |$)`, 'g'), '$1$2 de $3 gols$4');
  // "Marrocos 3+ gols" é "mais de 2.5": mesma coisa, na forma que o parser lê.
  t = t.replace(new RegExp(`(^|\\s)(\\d+)\\+\\s+(${METRICA})`, 'g'), (_, a, n, m) => `${a}mais de ${Number(n) - 0.5} ${m}`);
  t = t
    .replace(/^(.+?) ht\/ft$/, '$1/$1 - intervalo/final')
    .replace(/^ml (.+?)(?= e |$)/, '$1 vence')
    .replace(/ ml\b/g, ' vence')
    .replace(/^(.+?) dnb$/, '$1 +0 - handicap asiatico')
    .replace(/^(.+?) dc$/, '$1 ou empate')
    .replace(/^(.+?) nao marca$/, '$1 menos de 0.5 gols')
    .replace(/^(.+?) marca$/, '$1 mais de 0.5 gols')
    .replace(/^(.+?) primeiro a marcar$/, '$1 - primeiro gol')
    .replace(/^ambas nao marcam$/, 'nao - ambas marcam')
    // Handicap com meia linha e sem rótulo: "PSG -1.5". Linha inteira fica de
    // fora — sem "asiático" escrito, o europeu tem três saídas.
    .replace(/^([^/]+?) ([+-]\d+[.,]5)$/, '$1 $2 - handicap');
  return t.replace(/\s+/g, ' ').trim();
}
export function parseMarket(market: string, teams: Teams): ParseResult {
  if ([...(market ?? '')].length === LIMITE_DO_CANAL) return fail('MERCADO_TRUNCADO',`texto no limite de ${LIMITE_DO_CANAL} caracteres do canal; pode faltar perna`);
  const text=abreviacoes(normalize(market??''));
  if (!text) return fail('MERCADO_NAO_RECONHECIDO','mercado vazio');
  if (/\b(?:prorrogacao|extra time|penaltis|incluindo|classificar|classificacao)\b/.test(text)) return fail('ESCOPO_NAO_SUPORTADO','escopo além do tempo normal ou qualificação');
  if (/\b(?:nos? \d+ jogos?|nas? \d+ partidas?|cada partida|todos os jogos|todas as partidas|todos os times|todas as equipes|rodada|jogo com o gol mais rapido|multipla)\b/.test(text)) return fail('VARIOS_JOGOS','agregado/comparação entre jogos');
  const combined=compound(text,teams);
  if (combined) return {ok:true,conditions:combined};
  const cada=cadaEquipe(text);
  if (cada) return {ok:true,conditions:cada};
  const direct=single(text,teams);
  if (direct) return { ok:true,conditions:[direct] };
  // Consome toda a entrada. Rotulo após seleção só é unido se a gramática
  // completa do mercado o reconhecer; nenhum fragmento desconhecido é ignorado.
  // "Ambas marcam: Não" é a mesma perna que "Não - Ambas marcam". Exige espaço
  // depois dos dois-pontos pra não partir horário ("10:00").
  const parts=text.split(/\s+\/\s+|\s+·\s+/).map(s=>s.trim().replace(/^([^:]+?):\s+(.+)$/,'$2 - $1'));
  if (parts.length>12 || parts.some(p=>!p)) return fail('MERCADO_NAO_RECONHECIDO','separação inválida');
  const paths: Condition[][]=[];
  function visit(i: number, conditions: Condition[]) {
    if (i===parts.length) { paths.push(conditions); return; }
    const cada=cadaEquipe(parts[i]);
    if (cada) { visit(i+1,[...conditions,...cada]); return; }
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
  if (/\se\s/.test(text)) {
    const frase=clausulas(text,teams);
    if (frase) return { ok:true,conditions:frase };
  }
  if (/\bou\b/.test(text)) return fail('CONDICAO_ALTERNATIVA','alternativa sem gramática inequívoca');
  if (/\be\b/.test(text) && /mais|menos|resultado|marcam/.test(text)) return fail('COMBINADA_NAO_SEPARADA','condições sem separação inequívoca');
  if (/gols/.test(text) && (text.includes(normalize(teams.home)) || text.includes(normalize(teams.away))) && /\bx\b/.test(text)) return fail('GOLS_DE_UM_TIME','confronto não identifica lado da seleção');
  return fail('MERCADO_NAO_RECONHECIDO',`seleção, participante ou rótulo ambíguo: "${market}"`);
}

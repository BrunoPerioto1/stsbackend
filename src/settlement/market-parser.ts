import { normalizeTeamName } from '../bet/event-matching';
import { Condition, Pick as SelectionPick, Scope, Side, Teams } from './settlement.types';

export const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[º°]/g, 'o').replace(/\s+/g, ' ').trim();
export function teamPick(text: string, teams: Teams): Side | null {
  const n = normalize(text);
  if (/^(casa|mandante|home|time 1|equipe 1|1)$/.test(n)) return 'HOME';
  if (/^(fora|visitante|away|time 2|equipe 2|2)$/.test(n)) return 'AWAY';
  const name = normalizeTeamName(text.replace(/^man city$/i, 'Manchester City').replace(/^man utd$/i, 'Manchester United'));
  if (!name) return null;
  const h = normalizeTeamName(teams.home), a = normalizeTeamName(teams.away);
  if (name === h && name !== a) return 'HOME';
  if (name === a && name !== h) return 'AWAY';
  // Nomes curtos somente quando são um token inteiro exclusivo do confronto.
  if (name.length >= 4 && !name.includes(' ')) {
    const hm = h.split(' ').includes(name), am = a.split(' ').includes(name);
    if (hm !== am) return hm ? 'HOME' : 'AWAY';
  }
  // "Como 1907" x "Como", "Inter Milan" x "Inter", "Bayern Munich" x "FC Bayern
  // München": o canal acrescenta cidade ou ano que o provider não tem. Vale
  // quando toda palavra do texto que pertence a um time do confronto é
  // exclusiva do MESMO lado — "Manchester" num Manchester United x City segue
  // sem lado, porque é dos dois. No máximo UMA palavra estranha aos dois times
  // ("milan", "munich"; número não conta), e nunca palavra de mercado: sem isso
  // "Flamengo marca em ambos os tempos" inteiro virava o nome do Flamengo.
  const hs = new Set(h.split(' ')), as = new Set(a.split(' '));
  const palavras = name.split(' ').filter((t) => !/^\d+$/.test(t) && !SIGLAS_DE_TIME.has(t));
  const estranhas = palavras.filter((t) => !hs.has(t) && !as.has(t));
  if (estranhas.length <= 1 && !estranhas.some((t) => PALAVRAS_DE_MERCADO.test(t))) {
    const daCasa = palavras.some((t) => t.length >= 4 && hs.has(t) && !as.has(t));
    const deFora = palavras.some((t) => t.length >= 4 && as.has(t) && !hs.has(t));
    if (daCasa !== deFora) return daCasa ? 'HOME' : 'AWAY';
  }
  // O canal escreve "Flamengo RJ", "Bahia BA", "EC Bahia", "Atlético MG"; o
  // provider, "Flamengo", "Bahia", "Atlético Mineiro". Tira sigla de estado e
  // de clube e tenta de novo — só contra os dois times do confronto, então
  // não tem como cair num terceiro time.
  const semSigla = name.split(' ').filter((t) => !SIGLAS_DE_TIME.has(t)).join(' ');
  return semSigla && semSigla !== name ? teamPick(semSigla, teams) : null;
}
const PALAVRAS_DE_MERCADO = /^(?:vence|vencer|ganha|ganhar|marca|marcar|mais|menos|tem|ter|gols?|sim|nao|para|ambos|ambas|tempos?|escanteios|cartoes|chutes|empate|ou|e|com|sem|sofre|sofrer|toma|tomar|qualquer|momento|resultado|final|total)$/;
const SIGLAS_DE_TIME = new Set([
  'ac','al','am','ap','ba','ce','df','es','go','ma','mg','ms','mt','pa','pb','pe','pi','pr','rj','rn','ro','rr','rs','sc','se','sp','to',
  'ec','sa','ae',
]);
export function resultPick(text: string, teams: Teams): SelectionPick | null {
  return /^(empate|draw|x)$/i.test(text.trim()) ? 'DRAW' : teamPick(text, teams);
}
export const yesNo = (s: string): boolean | null => /^(sim|yes)$/i.test(s) ? true : /^(nao|no)$/i.test(s) ? false : null;
export function lineSelection(s: string): Pick<Condition, 'operator' | 'line'> | null {
  const m = /^(mais|menos|over|under|acima|abaixo|o|u)\s*(?:de\s*)?\(?([0-9]+(?:[.,][0-9]+)?)\)?(?:\s+gols?)?$/.exec(s);
  const plus = /^(\d+)\+\s*(?:gols?)?$/.exec(s);
  if (!m && !plus) return null;
  const line = Number((m?.[2] ?? plus![1]).replace(',', '.'));
  if (!Number.isFinite(line) || line < 0 || line > 200 || line * 2 % 1 !== 0) return null;
  return { line, operator: plus ? 'AT_LEAST' : /^(mais|over|acima|o)$/.test(m![1]) ? 'OVER' : 'UNDER' };
}
// Este nome local evita confundir a seleção do mercado com o utilitário TS Pick.
type Pick<T, K extends keyof T> = { [P in K]: T[P] };
export function scoped(text: string): { text: string; scope: Scope } | null {
  const first = /\b(?:1o?\s*(?:tempo|t)\b|primeiro tempo|ht\b|half time|ao intervalo)/g;
  const second = /\b(?:2o?\s*(?:tempo|t)\b|segundo tempo)/g;
  const f = first.test(text), s = second.test(text);
  if (f && s) return null;
  let semEscopo = text.replace(first, '').replace(second, '');
  // "Gols no 1º tempo", "Escanteios no 1º tempo": sem o tempo, o "no" sobrava
  // grudado no rótulo e "gols no" não é rótulo de nada.
  if (f || s) semEscopo = semEscopo.replace(/\s(?:no|do|na|em)(?=\s*(?:-|$))/g, '');
  return { scope: f ? 'FIRST_HALF' : s ? 'SECOND_HALF' : 'REGULATION', text: semEscopo.replace(/-\s*-/g, '-').replace(/^\s*-\s*|\s*-\s*$/g, '').replace(/resultado do\s*$/, 'resultado').replace(/\s+/g, ' ').trim() };
}
export function splitLabel(text: string): { selection: string; label: string } {
  const parts = text.split(/\s+[-–—]\s+/);
  return parts.length === 2 ? { selection: parts[0], label: parts[1] } : { selection: text, label: '' };
}
export const labels = {
  result: /^(resultado final|resultado da partida|resultado do jogo|resultado|vencedor(?: do encontro| da partida)?|vitoria|1\s?x\s?2|ml|money ?line|match winner)$/,
  // "total" sozinho: "Mais de 0.5 - Total 1ºT". A trava de linha até 9.5 em
  // parseScoreMarket segura o total de pontos de outro esporte.
  goals: /^(total de gols(?: acima\/abaixo)?|total gols|gols|total|total de gols mais\/menos)$/,
  both: /^(amb[ao]s\s+(?:(?:os\s+)?times|(?:as\s+)?equipes)?\s*marcam|ambas marcam|btts|both teams to score)$/,
  exact: /^(resultado correto|placar exato|correct score)$/,
};
export function parseScoreMarket(text: string, teams: Teams): Condition | null {
  const sc = scoped(text); if (!sc) return null;
  const { scope } = sc;
  let { selection: sel, label } = splitLabel(sc.text);
  const c = (normalizedMarket: string, extra: Partial<Condition>): Condition => ({ normalizedMarket, scope, ...extra });
  if (labels.exact.test(label)) {
    const m = /^(\d{1,2})\s*[-x:]\s*(\d{1,2})$/.exec(sel);
    return m ? c('RESULTADO_CORRETO', { home: +m[1], away: +m[2] }) : null;
  }
  // Também na ordem invertida do canal: "Ambas equipes marcam - Sim".
  if (labels.both.test(label) || (!label && labels.both.test(sel)) || (labels.both.test(sel) && yesNo(label) !== null)) {
    // "Ambas marcam - Ambas marcam": o canal repete o rótulo no lugar do "Sim".
    const expected = labels.both.test(label) ? yesNo(sel) ?? (labels.both.test(sel) ? true : null) : label ? yesNo(label) : true;
    return expected === null ? null : c('AMBAS_MARCAM', { expected });
  }
  if (/^(dupla chance|chance dupla|double chance)$/.test(label) || ((!label || labels.result.test(label)) && / ou /.test(sel))) {
    const codes: Record<string, SelectionPick[]> = { '1x': ['HOME','DRAW'], 'x2': ['DRAW','AWAY'], '12': ['HOME','AWAY'] };
    const parts = sel.split(' ou ');
    const picks = codes[sel] ?? (parts.length === 2 ? parts.map(p => resultPick(p, teams)) : []);
    return picks.length === 2 && picks.every(p => p !== null) && picks[0] !== picks[1] ? c('DUPLA_CHANCE', { picks: picks as SelectionPick[] }) : null;
  }
  if (/^handicap(?: asiatico)?$/.test(label)) {
    const m = /^(.+?)\s+\(?([+-]\d+(?:[.,]\d+)?)\)?(?: gols?)?$/.exec(sel);
    const side = m && teamPick(m[1], teams), line = m && Number(m[2].replace(',', '.'));
    // Inteiros só no asiático explícito: handicap europeu possui três saídas.
    return side && line !== null && Math.abs(line) <= 9 && line * 2 % 1 === 0 && (line % 1 !== 0 || label.includes('asiatico')) ? c('HANDICAP', { side, line }) : null;
  }
  // "Sim - Flamengo não sofre gol", "Flamengo não sofre gols".
  for (const [frase, resposta] of [[label, sel], [sel, label]]) {
    const naoSofre = /^(.+?) nao (?:sofre|sofrer|toma|tomar|leva|levar) gols?$/.exec(frase);
    if (!naoSofre) continue;
    const side = teamPick(naoSofre[1], teams), expected = resposta ? yesNo(resposta) : true;
    return side && expected !== null ? c('CLEAN_SHEET', { side, expected }) : null;
  }
  const clean = /^(.+?)\s+(?:para )?(?:(vencer|vence|vencer de|vence de)\s+)?(?:sem (?:sofrer|tomar|levar) gols?|zero|0)(?::?\s*(sim|nao))?$/.exec(sel);
  if (clean && (!label || labels.result.test(label))) {
    const side = teamPick(clean[1], teams);
    return side ? c(clean[2] ? 'VENCER_SEM_SOFRER' : 'CLEAN_SHEET', { side, expected: clean[3] !== 'nao' }) : null;
  }
  if (/^(?:ganhar|ganha|vencer|vence) sem (?:sofrer|tomar|levar) gols?$/.test(label)) {
    const side = teamPick(sel, teams);
    return side ? c('VENCER_SEM_SOFRER', { side, expected: true }) : null;
  }
  if (/^(clean sheet|sem sofrer gols)$/.test(label)) {
    const m = /^(.+?)(?:\s+(sim|nao))?$/.exec(sel), side = m && teamPick(m[1], teams);
    return side ? c('CLEAN_SHEET', { side, expected: m![2] !== 'nao' }) : null;
  }
  if (labels.result.test(label)) {
    const pick = resultPick(sel, teams);
    if (pick) return c(scope === 'FIRST_HALF' ? 'RESULTADO_1T' : 'RESULTADO_FINAL', { pick });
    label = '';
  }
  if (!label) {
    const win = /^(.+?)\s+(?:para )?(?:ml|moneyline|vence|vencer|ganha|ganhar|vitoria)(?:\s+(?:o\s+)?(.+))?$/.exec(sel);
    if (win) {
      const pick = teamPick(win[1], teams), opponent = win[2] && teamPick(win[2], teams);
      if (pick && (!win[2] || (opponent && opponent !== pick))) return c(scope === 'FIRST_HALF' ? 'RESULTADO_1T' : 'RESULTADO_FINAL', { pick });
    }
    if (/^(empate|draw)$/.test(sel)) return c('RESULTADO_FINAL', { pick: 'DRAW' });
  }
  if (labels.goals.test(label) || (!label && /\bgols?$/.test(sel))) {
    let line = lineSelection(sel), side: Side | null = null;
    if (!line) {
      const m = /^(.+?)\s+((?:mais|menos|over|under|acima|abaixo|o|u)\s*.*)$/.exec(sel);
      if (m) { side = teamPick(m[1], teams); if (side) line = lineSelection(m[2]); }
    }
    if (line && line.line! <= 9.5) return c(side ? 'TIME_TOTAL_GOLS' : scope === 'FIRST_HALF' ? 'TOTAL_GOLS_HT' : 'TOTAL_GOLS', { ...line, ...(side ? { side } : {}) });
  }
  return null;
}

export const statMetrics: Record<string, string> = {
  'escanteios': 'corners', 'escanteio': 'corners', 'corners': 'corners',
  // cardPoints e não cards: ver normalize_card_points no coletor.
  'cartoes': 'cardPoints', 'cards': 'cardPoints', 'cartoes amarelos': 'yellowCards',
  'chutes': 'shots', 'finalizacoes': 'shots', 'chutes a gol': 'shotsOnTarget', 'chutes ao gol': 'shotsOnTarget', 'chutes no gol': 'shotsOnTarget',
  'faltas': 'fouls', 'impedimentos': 'offsides', 'defesas': 'saves',
};
export const metricMarkets: Record<string, string> = { corners: 'TOTAL_ESCANTEIOS', cards: 'TOTAL_CARTOES', cardPoints: 'TOTAL_CARTOES', yellowCards: 'TOTAL_CARTOES', shots: 'TOTAL_CHUTES', shotsOnTarget: 'TOTAL_CHUTES_A_GOL', fouls: 'FALTAS', offsides: 'IMPEDIMENTOS', saves: 'DEFESAS' };
export function parseTeamStat(text: string, teams: Teams): Condition | null {
  const sc = scoped(text); if (!sc) return null;
  let { selection, label } = splitLabel(sc.text);
  if (!label) {
    const m = /^(.*?)\s+(escanteios?|corners|cartoes(?: amarelos)?|cards|chutes(?: a gol| ao gol| no gol)?|finalizacoes|faltas|impedimentos|defesas)$/.exec(selection);
    if (!m) return null; selection = m[1]; label = m[2];
  }
  // "Remo - Maior número de cartões", "Flamengo - Maior número de chutes ao gol".
  const mais = label === 'escanteios 1x2' ? 'escanteios' : /^(?:mais|maior numero de|equipe com mais|time com mais) (escanteios|cartoes|chutes ao gol|chutes a gol|chutes no gol|chutes)$/.exec(label)?.[1];
  if (mais) {
    const metric = statMetrics[mais];
    const normalizedMarket = ({ corners: 'EQUIPE_MAIS_ESCANTEIOS', cardPoints: 'EQUIPE_MAIS_CARTOES', shotsOnTarget: 'EQUIPE_MAIS_CHUTES_A_GOL', shots: 'EQUIPE_MAIS_CHUTES' } as Record<string, string>)[metric];
    const pick = resultPick(selection, teams);
    return pick && normalizedMarket ? { normalizedMarket, scope: sc.scope, metric, pick } : null;
  }
  const metric = statMetrics[label.replace(/^(?:total de |total |totais )/, '').replace(/ mais\/menos$/, '')];
  if (!metric) return null;
  let line = lineSelection(selection), side: Side | null = null;
  if (!line) {
    const m = /^(.+?)\s+((?:mais|menos|over|under|acima|abaixo)\s+.*)$/.exec(selection);
    if (m) { side = teamPick(m[1], teams); if (side) line = lineSelection(m[2]); }
  }
  if (!line) return null;
  const normalizedMarket = side && metric === 'corners' ? 'TIME_TOTAL_ESCANTEIOS' : side && metric === 'cardPoints' ? 'TIME_TOTAL_CARTOES' : metricMarkets[metric];
  return { normalizedMarket, scope: sc.scope, metric, ...line, ...(side ? { side } : {}) };
}
export function parsePeriods(text: string, teams: Teams): Condition | null {
  const { selection, label } = splitLabel(text);
  if (/^(intervalo[ /-]final|intervalo\/final|intervalo\/tempo completo|primeiro tempo e partida)$/.test(label)) {
    const parts = selection.split(/\s*\/\s*/);
    const picks = parts.map(p => resultPick(p, teams));
    return picks.length === 2 && picks.every(Boolean) ? { normalizedMarket: 'INTERVALO_FINAL', scope: 'REGULATION', picks: picks as SelectionPick[] } : null;
  }
  if (/^(ambos os tempos (?:com gol|mais de 0[.,]5 gols)|gol em ambos os tempos)$/.test(label)) {
    const expected = yesNo(selection);
    return expected === null ? null : { normalizedMarket: 'AMBOS_TEMPOS_COM_GOL', scope: 'REGULATION', expected };
  }
  // O canal escreve a frase dos dois lados do " - ": "Sim - Flamengo para vencer
  // um dos tempos", "Atlético MG vence um dos tempos - Sim", e às vezes com um
  // rótulo que não diz nada ("Cruzeiro marca em ambos os tempos - Resultado da
  // partida"). Sem sim/não, a frase só vale como afirmação.
  // "Real Madrid - Vencer cada tempo": o time de um lado, o verbo do outro.
  const junto = yesNo(label) === null && yesNo(selection) === null && /^(?:para )?(?:marcar?|vencer|vence|ganhar|ganha)\b/.test(label) && teamPick(selection, teams)
    ? `${selection} ${label.replace(/^para /, '')}` : null;
  const resposta = yesNo(label) ?? yesNo(selection);
  const frase = junto ?? (yesNo(label) !== null ? selection : yesNo(selection) !== null ? label : selection);
  const semResposta = resposta === null && (!!junto || !label || labels.result.test(label));
  if (resposta === null && !semResposta) return null;
  const expected = resposta ?? true;
  const cada = /^(.+?) (?:para )?(?:vencer|vence|ganhar|ganha) (?:cada tempo|ambos os tempos|os dois tempos)$/.exec(frase);
  if (cada) {
    const side = teamPick(cada[1], teams);
    return side ? { normalizedMarket: 'VENCER_AMBOS_TEMPOS', scope: 'REGULATION', side, expected } : null;
  }
  const ambos = /^(.+?) (?:para )?marcar? em ambos os tempos$/.exec(frase);
  if (ambos) {
    const side = teamPick(ambos[1], teams);
    return side ? { normalizedMarket: 'TIME_MARCA_EM_AMBOS_TEMPOS', scope: 'REGULATION', side, expected } : null;
  }
  const umDos = /^(.+?) (?:para )?(?:vencer|vence|ganhar|ganha) (?:um dos|pelo menos um dos|algum dos) tempos$/.exec(frase);
  if (umDos) {
    const side = teamPick(umDos[1], teams);
    return side ? { normalizedMarket: 'VENCER_UM_DOS_TEMPOS', scope: 'REGULATION', side, expected } : null;
  }
  return null;
}
export function parseIncidents(text: string, teams: Teams): Condition | null {
  const { selection, label: rotulo } = splitLabel(text);
  // "Flamengo - 1º gol".
  const label = rotulo === '1o gol' ? 'primeiro gol' : rotulo;
  if (/^(penalti no jogo|penalti na partida|cartao vermelho)$/.test(label)) {
    const expected = yesNo(selection);
    return expected === null ? null : { normalizedMarket: label === 'cartao vermelho' ? 'CARTAO_VERMELHO' : 'PENALTI_NO_JOGO', scope: 'REGULATION', expected };
  }
  // "Próximo gol (Gol 1)" é como o canal escreve "próximo gol 1".
  // "Flamengo - 1º gol" chega normalizado como "1o gol".
  const ordem = /^(?:primeiro gol|1o gol|ultimo gol|proximo gol (?:\(gol )?(\d+)\)?)$/.exec(label);
  if (ordem) {
    const pick = /^(nenhum|sem gol)$/.test(selection) ? 'NONE' : teamPick(selection, teams);
    const ordinal = label.startsWith('proximo') ? Number(ordem[1]) : 1;
    return pick && Number.isSafeInteger(ordinal) && ordinal > 0 ? { normalizedMarket: label.startsWith('primeiro') || label === '1o gol' ? 'PRIMEIRO_GOL' : label.startsWith('ultimo') ? 'ULTIMO_GOL' : 'PROXIMO_GOL', scope: 'REGULATION', pick, ordinal } : null;
  }
  return null;
}
export function parsePlayer(text: string, teams?: Teams): Condition | null {
  const sc = scoped(text); if (!sc) return null;
  let { selection, label } = splitLabel(sc.text);
  // "Kylian Mbappé 3+ chutes a gol": linha e métrica grudadas no nome, sem rótulo.
  if (!label) {
    const grudado = /^(.+?\s(?:\d+\+|(?:mais|menos) de \d+(?:[.,]\d+)?))\s+(chutes a gol|chutes ao gol|chutes no gol)$/.exec(selection);
    if (grudado) { selection = grudado[1]; label = grudado[2]; }
  }
  const metrics: Record<string, [string,string]> = {
    'marcar a qualquer momento': ['JOGADOR_MARCA','goals'], 'marcar em qualquer momento': ['JOGADOR_MARCA','goals'], 'jogador para marcar': ['JOGADOR_MARCA','goals'],
    // Variações do canal: "Marcador a qualquer momento", "Para marcar a qualquer
    // momento", "A marcar", "Marcar gol".
    'marcador a qualquer momento': ['JOGADOR_MARCA','goals'], 'marcador em qualquer momento': ['JOGADOR_MARCA','goals'], 'para marcar a qualquer momento': ['JOGADOR_MARCA','goals'],
    'a marcar': ['JOGADOR_MARCA','goals'], 'a marcar a qualquer momento': ['JOGADOR_MARCA','goals'], 'marcar gol': ['JOGADOR_MARCA','goals'], 'marcar um gol': ['JOGADOR_MARCA','goals'],
    'anytime scorer': ['JOGADOR_MARCA','goals'],
    'jogador assistencia': ['JOGADOR_ASSISTENCIA','assists'], 'assistencias do jogador': ['JOGADOR_ASSISTENCIA','assists'],
    'gol ou assistencia': ['JOGADOR_GOL_OU_ASSISTENCIA','goalsAssists'], 'jogador marcar ou dar assistencia': ['JOGADOR_GOL_OU_ASSISTENCIA','goalsAssists'], 'marcar gol ou dar assistencia': ['JOGADOR_GOL_OU_ASSISTENCIA','goalsAssists'],
    // "Michael Olise - Jogador a marcar ou dar assistência".
    'jogador a marcar ou dar assistencia': ['JOGADOR_GOL_OU_ASSISTENCIA','goalsAssists'], 'a marcar ou dar assistencia': ['JOGADOR_GOL_OU_ASSISTENCIA','goalsAssists'],
    'chutes a gol do jogador': ['JOGADOR_CHUTE_A_GOL','shotsOnTarget'], 'jogador - chutes ao gol': ['JOGADOR_CHUTE_A_GOL','shotsOnTarget'],
    // Rótulo sem "do jogador", como o canal escreve ("José Manuel López - Chutes
    // a gol", "Clay Holstad 1+ - Chutes a gol"). É o mesmo rótulo do mercado de
    // time; quem desempata é a trava de time logo abaixo.
    'chutes a gol': ['JOGADOR_CHUTE_A_GOL','shotsOnTarget'], 'chutes ao gol': ['JOGADOR_CHUTE_A_GOL','shotsOnTarget'], 'chutes no gol': ['JOGADOR_CHUTE_A_GOL','shotsOnTarget'],
    'total de chutes do jogador': ['TOTAL_CHUTES_JOGADOR','shots'], 'cartoes do jogador': ['CARTAO_JOGADOR','cards'],
  };
  const def = metrics[label]; if (!def) return null;
  const m = /^(.+?)\s+((?:mais|menos|over|under|acima|abaixo)\s+.*|\d+\+)$/.exec(selection);
  const line = m ? lineSelection(m[2]) : { operator: 'OVER' as const, line: 0.5 };
  let participant = m ? m[1] : selection;
  // "Pedro Guilherme marca - Jogador para marcar": o verbo vem grudado no nome.
  if (def[0] === 'JOGADOR_MARCA') participant = participant.replace(/\s+marcar?$/, '');
  if (!line || /\b(e|ou|sim|nao|mais|menos|jogador)\b|\//.test(participant) || !/[a-z]/.test(participant)) return null;
  // Time nunca é jogador. Sem isto, "Flamengo mais de 6.5 - Chutes a gol"
  // casaria aqui E no mercado de time, e o registro recusa ambiguidade — o
  // mercado de time, que funcionava, deixaria de liquidar.
  if (teams && teamPick(participant, teams)) return null;
  return { normalizedMarket: def[0], scope: sc.scope, participant, metric: def[1], ...line };
}


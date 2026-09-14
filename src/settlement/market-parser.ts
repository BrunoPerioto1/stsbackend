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
  return null;
}
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
  return { scope: f ? 'FIRST_HALF' : s ? 'SECOND_HALF' : 'REGULATION', text: text.replace(first, '').replace(second, '').replace(/-\s*-/g, '-').replace(/^\s*-\s*|\s*-\s*$/g, '').replace(/resultado do\s*$/, 'resultado').replace(/\s+/g, ' ').trim() };
}
export function splitLabel(text: string): { selection: string; label: string } {
  const parts = text.split(/\s+[-–—]\s+/);
  return parts.length === 2 ? { selection: parts[0], label: parts[1] } : { selection: text, label: '' };
}
export const labels = {
  result: /^(resultado final|resultado da partida|resultado do jogo|resultado|vencedor(?: do encontro| da partida)?|vitoria|1\s?x\s?2|ml|money ?line|match winner)$/,
  goals: /^(total de gols(?: acima\/abaixo)?|total gols|gols|total de gols mais\/menos)$/,
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
  if (labels.both.test(label) || (!label && labels.both.test(sel))) {
    const expected = label ? yesNo(sel) : true;
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
  const clean = /^(.+?)\s+(?:para )?(?:(vencer|vence|vencer de|vence de)\s+)?(?:sem (?:sofrer|tomar|levar) gols?|zero|0)(?::?\s*(sim|nao))?$/.exec(sel);
  if (clean && (!label || labels.result.test(label))) {
    const side = teamPick(clean[1], teams);
    return side ? c(clean[2] ? 'VENCER_SEM_SOFRER' : 'CLEAN_SHEET', { side, expected: clean[3] !== 'nao' }) : null;
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
  'cartoes': 'cards', 'cards': 'cards', 'cartoes amarelos': 'yellowCards',
  'chutes': 'shots', 'finalizacoes': 'shots', 'chutes a gol': 'shotsOnTarget', 'chutes ao gol': 'shotsOnTarget', 'chutes no gol': 'shotsOnTarget',
  'faltas': 'fouls', 'impedimentos': 'offsides', 'defesas': 'saves',
};
export const metricMarkets: Record<string, string> = { corners: 'TOTAL_ESCANTEIOS', cards: 'TOTAL_CARTOES', yellowCards: 'TOTAL_CARTOES', shots: 'TOTAL_CHUTES', shotsOnTarget: 'TOTAL_CHUTES_A_GOL', fouls: 'FALTAS', offsides: 'IMPEDIMENTOS', saves: 'DEFESAS' };
export function parseTeamStat(text: string, teams: Teams): Condition | null {
  const sc = scoped(text); if (!sc) return null;
  let { selection, label } = splitLabel(sc.text);
  if (!label) {
    const m = /^(.*?)\s+(escanteios?|corners|cartoes(?: amarelos)?|cards|chutes(?: a gol| ao gol| no gol)?|finalizacoes|faltas|impedimentos|defesas)$/.exec(selection);
    if (!m) return null; selection = m[1]; label = m[2];
  }
  if (/^(mais escanteios|equipe com mais escanteios|escanteios 1x2)$/.test(label)) {
    const pick = resultPick(selection, teams);
    return pick ? { normalizedMarket: 'EQUIPE_MAIS_ESCANTEIOS', scope: sc.scope, metric: 'corners', pick } : null;
  }
  const metric = statMetrics[label.replace(/^(?:total de |total |totais )/, '').replace(/ mais\/menos$/, '')];
  if (!metric) return null;
  let line = lineSelection(selection), side: Side | null = null;
  if (!line) {
    const m = /^(.+?)\s+((?:mais|menos|over|under|acima|abaixo)\s+.*)$/.exec(selection);
    if (m) { side = teamPick(m[1], teams); if (side) line = lineSelection(m[2]); }
  }
  if (!line) return null;
  const normalizedMarket = side && metric === 'corners' ? 'TIME_TOTAL_ESCANTEIOS' : side && metric === 'cards' ? 'TIME_TOTAL_CARTOES' : metricMarkets[metric];
  return { normalizedMarket, scope: sc.scope, metric, ...line, ...(side ? { side } : {}) };
}
export function parsePeriods(text: string, teams: Teams): Condition | null {
  const { selection, label } = splitLabel(text);
  if (/^(intervalo[ /-]final|intervalo\/final|primeiro tempo e partida)$/.test(label)) {
    const parts = selection.split(/\s*\/\s*/);
    const picks = parts.map(p => resultPick(p, teams));
    return picks.length === 2 && picks.every(Boolean) ? { normalizedMarket: 'INTERVALO_FINAL', scope: 'REGULATION', picks: picks as SelectionPick[] } : null;
  }
  if (/^(ambos os tempos (?:com gol|mais de 0[.,]5 gols)|gol em ambos os tempos)$/.test(label)) {
    const expected = yesNo(selection);
    return expected === null ? null : { normalizedMarket: 'AMBOS_TEMPOS_COM_GOL', scope: 'REGULATION', expected };
  }
  const m = /^(.+?) (?:para )?marcar em ambos os tempos$/.exec(selection);
  if (m && /^(sim|nao)$/.test(label)) {
    const side = teamPick(m[1], teams);
    return side ? { normalizedMarket: 'TIME_MARCA_EM_AMBOS_TEMPOS', scope: 'REGULATION', side, expected: label === 'sim' } : null;
  }
  return null;
}
export function parseIncidents(text: string, teams: Teams): Condition | null {
  const { selection, label } = splitLabel(text);
  if (/^(penalti no jogo|penalti na partida|cartao vermelho)$/.test(label)) {
    const expected = yesNo(selection);
    return expected === null ? null : { normalizedMarket: label === 'cartao vermelho' ? 'CARTAO_VERMELHO' : 'PENALTI_NO_JOGO', scope: 'REGULATION', expected };
  }
  if (/^(primeiro gol|ultimo gol|proximo gol \d+)$/.test(label)) {
    const pick = /^(nenhum|sem gol)$/.test(selection) ? 'NONE' : teamPick(selection, teams);
    const ordinal = label.startsWith('proximo') ? Number(label.split(' ').at(-1)) : 1;
    return pick && Number.isSafeInteger(ordinal) && ordinal > 0 ? { normalizedMarket: label.startsWith('primeiro') ? 'PRIMEIRO_GOL' : label.startsWith('ultimo') ? 'ULTIMO_GOL' : 'PROXIMO_GOL', scope: 'REGULATION', pick, ordinal } : null;
  }
  return null;
}
export function parsePlayer(text: string): Condition | null {
  const sc = scoped(text); if (!sc) return null;
  let { selection, label } = splitLabel(sc.text);
  const metrics: Record<string, [string,string]> = {
    'marcar a qualquer momento': ['JOGADOR_MARCA','goals'], 'jogador para marcar': ['JOGADOR_MARCA','goals'],
    'jogador assistencia': ['JOGADOR_ASSISTENCIA','assists'], 'assistencias do jogador': ['JOGADOR_ASSISTENCIA','assists'],
    'gol ou assistencia': ['JOGADOR_GOL_OU_ASSISTENCIA','goalsAssists'], 'jogador marcar ou dar assistencia': ['JOGADOR_GOL_OU_ASSISTENCIA','goalsAssists'],
    'chutes a gol do jogador': ['JOGADOR_CHUTE_A_GOL','shotsOnTarget'], 'jogador - chutes ao gol': ['JOGADOR_CHUTE_A_GOL','shotsOnTarget'],
    'total de chutes do jogador': ['TOTAL_CHUTES_JOGADOR','shots'], 'cartoes do jogador': ['CARTAO_JOGADOR','cards'],
  };
  const def = metrics[label]; if (!def) return null;
  const m = /^(.+?)\s+((?:mais|menos|over|under|acima|abaixo)\s+.*|\d+\+)$/.exec(selection);
  const line = m ? lineSelection(m[2]) : { operator: 'OVER' as const, line: 0.5 };
  const participant = m ? m[1] : selection;
  if (!line || /\b(e|ou|sim|nao|mais|menos|jogador)\b|\//.test(participant) || !/[a-z]/.test(participant)) return null;
  return { normalizedMarket: def[0], scope: sc.scope, participant, metric: def[1], ...line };
}


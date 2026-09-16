// Múltipla de vários jogos: cada perna é liquidada contra o placar do PRÓPRIO
// jogo, e as pernas se juntam como numa múltipla da casa.
//
// Três formatos reais chegam aqui:
//
//   confrontos no mercado, seleções depois do " · "
//     "Como 1907 x Parma / Torino FC x AS Roma / Inter Milan x Udinese · Como, Roma e Inter de Milão vencerem - Resultado final"
//     "Stuttgart x Viking / PSG x Slovan Bratislava · Mais de 9.5 - Escanteios / Paris Saint Germain +0.5 - Handicap de cartões"
//   confrontos no jogo, seleções no mercado
//     jogo "Olimpia x Vasco / Corinthians x Rosario Central", mercado "Club Olimpia - Resultado final / Corinthians - Resultado final"
//   confronto grudado em cada seleção
//     "Londrina-PR vs Ponte Preta-SP - mais de 1.5 gols / Náutico-PE vs Operário-PR - mais de 1.5 gols"
//
// Cada seleção é ligada a um jogo: pelo time que ela cita (só um dos jogos tem
// esse time), pelo confronto entre parênteses, ou — seleção sem time, como
// "Mais de 9.5 - Escanteios" — pela posição, quando há uma seleção por jogo.
// Seleção que não dá pra ligar a jogo nenhum não vira chute: fica sem proposta.

import { ResultIdEnum } from '../bet/dto/result-id.enum';
import { extractConfrontos, splitConfronto } from '../bet/event-matching';
import { labels, normalize } from './market-parser';
import { LIMITE_DO_CANAL, parseMarket } from './market-conditions';
import { settleBet, Settlement } from './settle';
import { Condition, FinalScore, Reason, SettlementContext, Teams } from './settlement.types';

/** Um jogo da múltipla com placar coletado, na posição de bet_events. */
export interface EventLeg {
  position: number;
  /** Nomes do provider: é contra eles que HOME/AWAY do placar valem. */
  teams: Teams;
  score: FinalScore | null;
  eventStatus: string | null;
  context: SettlementContext;
}

interface Avaliada {
  jogo: string;
  posicao: number | null;
  resultado: Settlement;
}

const undecided = (reason: Reason, explanation: string): Settlement => ({ resultId: null, reason, explanation });

export function isMultiEvent(game: string, market: string): boolean {
  return extractConfrontos(game, market).length > 1;
}

/**
 * -> as seleções da múltipla, sem os confrontos, na ordem em que aparecem.
 * "Como, Roma e Inter vencerem" vira uma seleção por time.
 */
export function selecoesDaMultipla(game: string, market: string): string[] {
  const ponto = market.indexOf(' · ');
  let partes: string[];
  if (ponto >= 0) partes = market.slice(ponto + 3).split(/\s+\/\s+/);
  else if (game.includes(' / ')) partes = market.split(/\s+\/\s+/);
  else {
    // Confronto grudado: "Londrina-PR vs Ponte Preta-SP - mais de 1.5 gols".
    partes = market.split(/\s+\/\s+/).map((parte) => {
      const [primeiro, ...resto] = parte.split(' - ');
      return resto.length && splitConfronto(primeiro) ? resto.join(' - ') : parte;
    });
  }
  partes = partes.map((p) => p.trim()).filter(Boolean);

  if (partes.length === 1) {
    const lista = /^(.+?)\s+(?:vencem|vencerem|vence|vencer|ganham|ganharem)(?:\s+(?:as\s+)?(?:suas\s+partidas|seus\s+jogos|suas\s+partidas?))?(?:\s+-\s+(.+))?$/i.exec(partes[0]);
    if (lista && (!lista[2] || labels.result.test(normalize(lista[2])))) {
      const nomes = lista[1].split(/\s*,\s*|\s+e\s+/).map((n) => n.trim()).filter(Boolean);
      if (nomes.length > 1) return nomes.map((nome) => `${nome} - Resultado final`);
    }
  }
  return partes;
}

// Condição que só faz sentido num jogo específico: cita um dos times.
function citaTime(c: Condition): boolean {
  const lado = (p: string | undefined) => p === 'HOME' || p === 'AWAY';
  return lado(c.side) || lado(c.pick) || !!c.picks?.some(lado);
}

export function settleMultiEvent(game: string, market: string, legs: readonly EventLeg[]): Settlement {
  if (/\b(?:prorrogacao|classificar|qualificar|classificacao)\b/.test(normalize(market))) {
    return undecided('ESCOPO_NAO_SUPORTADO', 'escopo além do tempo normal ou qualificação');
  }
  const confrontos = extractConfrontos(game, market);
  if (confrontos.length < 2) return undecided('VARIOS_JOGOS', 'confrontos da múltipla não identificados');

  const jogos = confrontos.map((confronto, posicao) => {
    const leg = legs.find((l) => l.position === posicao) ?? null;
    return {
      confronto,
      leg,
      nome: leg ? `${leg.teams.home} x ${leg.teams.away}` : confronto,
      // Pra ligar seleção a jogo vale o nome do provider E o texto do confronto
      // ("Man Utd" do canal, "Manchester United" do provider).
      nomes: [leg?.teams, splitConfronto(confronto)].filter((t): t is Teams => !!t),
    };
  });

  const partes = selecoesDaMultipla(game, market);
  if (!partes.length) return undecided('COMBINADA_NAO_SEPARADA', 'seleções da múltipla não separadas');
  // O canal corta em 100 caracteres: a última seleção pode estar pela metade.
  const cortado = [...market].length === LIMITE_DO_CANAL;

  const avaliadas: Avaliada[] = partes.map((parte, i) => {
    if (cortado && i === partes.length - 1) {
      return { jogo: '?', posicao: null, resultado: undecided('MERCADO_TRUNCADO', `"${parte}" pode ter sido cortada pelo canal`) };
    }
    // "Mais de 3.5 - Total de cartões (Real Sociedad - Atlético de Madrid)".
    const dica = /\s*\(([^()]+)\)\s*$/.exec(parte);
    const texto = dica ? parte.slice(0, dica.index) : parte;

    const posicao = ligar(texto, i, dica?.[1] ?? null);
    if (posicao === null) {
      return { jogo: '?', posicao, resultado: undecided('COMBINADA_NAO_SEPARADA', `"${texto}" não se liga a um jogo só`) };
    }
    const { leg, nome } = jogos[posicao];
    if (!leg) {
      return { jogo: nome, posicao, resultado: undecided('SEM_PLACAR', 'jogo não identificado ou sem placar coletado') };
    }
    return { jogo: nome, posicao, resultado: settleBet(texto, leg.teams, leg.score, leg.eventStatus, leg.context) };
  });

  function ligar(texto: string, i: number, dica: string | null): number | null {
    if (dica) {
      const lados = splitConfronto(dica.replace(/\s+-\s+/, ' x '));
      const achados = jogos
        .map((j, k) => (lados && j.nomes.some((t) => parseMarket(`${lados.home} - resultado final`, t).ok && parseMarket(`${lados.away} - resultado final`, t).ok) ? k : -1))
        .filter((k) => k >= 0);
      return achados.length === 1 ? achados[0] : null;
    }
    const leituras = jogos.map((j) => j.nomes.map((t) => parseMarket(texto, t)).find((r) => r.ok) ?? null);
    const comTime = leituras.map((r, k) => (r?.ok && r.conditions.some(citaTime) ? k : -1)).filter((k) => k >= 0);
    if (comTime.length === 1) return comTime[0];
    if (comTime.length > 1) return null;
    // Sem time citado, só a posição liga — e só quando há uma seleção por jogo.
    return partes.length === jogos.length && leituras[i]?.ok ? i : null;
  }

  const linha = (a: Avaliada) => `${a.jogo}: ${a.resultado.explanation}`;

  // Múltipla perde quando QUALQUER perna perde, mesmo com outra indefinida.
  const perdidas = avaliadas.filter((a) => a.resultado.resultId === ResultIdEnum.LOST);
  if (perdidas.length) return { resultId: ResultIdEnum.LOST, reason: null, explanation: perdidas.map(linha).join('; ') };

  const explicacao = avaliadas.map(linha).join('; ');
  const indefinida = avaliadas.find((a) => a.resultado.resultId === null);
  if (indefinida) return undecided(indefinida.resultado.reason ?? 'MERCADO_NAO_RECONHECIDO', explicacao);

  // GANHOU exige todo jogo com seleção: jogo sem seleção ligada é perna que o
  // texto não mostrou, e ganhar sem ela seria inventar.
  const cobertos = new Set(avaliadas.map((a) => a.posicao));
  const semSelecao = jogos.find((_, k) => !cobertos.has(k));
  if (semSelecao) return undecided('COMBINADA_NAO_SEPARADA', `${semSelecao.confronto}: nenhuma seleção ligada a este jogo; ${explicacao}`);

  if (avaliadas.some((a) => a.resultado.resultId === ResultIdEnum.CANCELED)) {
    return undecided('PERNA_ANULADA', `odd ajustada não calculada: ${explicacao}`);
  }
  return { resultId: ResultIdEnum.WON, reason: null, explanation: explicacao };
}

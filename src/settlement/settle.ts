// Compara as condicoes de uma aposta com o placar final. Funcao pura.
//
// Devolve SEMPRE uma sugestao a ser confirmada por gente: nada aqui escreve em
// bet_results. Ver bet_settlement_suggestions no schema.

import { ResultIdEnum } from '../bet/dto/result-id.enum';
import {
  Condition,
  ParseFailure,
  Teams,
  parseMarket,
} from './market-conditions';

export interface FinalScore {
  home: number;
  away: number;
}

export type SettlementReason =
  | ParseFailure
  | 'JOGO_NAO_FINALIZADO'
  | 'SEM_PLACAR';

export interface Settlement {
  // WON, LOST ou CANCELED (linha inteira empatada devolve a aposta e o app ja'
  // calcula lucro 0 pra CANCELED). null = sem sugestao.
  resultId: ResultIdEnum | null;
  reason: SettlementReason | null;
  // Frase mostrada na tela de conferencia.
  explanation: string;
}

type Outcome = 'WON' | 'LOST' | 'VOID';

function describeScore(score: FinalScore): string {
  return `${score.home}x${score.away}`;
}

function settleCondition(
  condition: Condition,
  score: FinalScore,
  teams: Teams,
): { outcome: Outcome; text: string } {
  switch (condition.kind) {
    case 'TOTAL_GOALS': {
      const total = score.home + score.away;
      const label = `${condition.operator === 'OVER' ? 'mais' : 'menos'} de ${condition.line}`;
      if (total === condition.line)
        return {
          outcome: 'VOID',
          text: `${total} gols, exatamente a linha ${condition.line}`,
        };
      const over = total > condition.line;
      const won = condition.operator === 'OVER' ? over : !over;
      return {
        outcome: won ? 'WON' : 'LOST',
        text: `${total} gols no jogo, ${label}`,
      };
    }
    case 'BOTH_TEAMS_SCORE': {
      const both = score.home > 0 && score.away > 0;
      return {
        outcome: both === condition.expected ? 'WON' : 'LOST',
        text: `${describeScore(score)}, ${both ? 'ambas marcaram' : 'nem todas marcaram'}`,
      };
    }
    case 'MATCH_RESULT': {
      const actual =
        score.home > score.away
          ? 'HOME'
          : score.away > score.home
            ? 'AWAY'
            : 'DRAW';
      const nome =
        condition.pick === 'HOME'
          ? teams.home
          : condition.pick === 'AWAY'
            ? teams.away
            : 'empate';
      const venceu =
        actual === 'HOME'
          ? teams.home
          : actual === 'AWAY'
            ? teams.away
            : 'empate';
      return {
        outcome: actual === condition.pick ? 'WON' : 'LOST',
        text: `${describeScore(score)}, ${actual === 'DRAW' ? 'empate' : `${venceu} venceu`} (apostou ${nome})`,
      };
    }
    case 'EXACT_SCORE': {
      const acertou =
        condition.home === score.home && condition.away === score.away;
      return {
        outcome: acertou ? 'WON' : 'LOST',
        text: `apostou ${condition.home}x${condition.away}, deu ${describeScore(score)}`,
      };
    }
  }
}

/**
 * Sugestao de resultado para uma aposta, ou null quando nao da' pra decidir.
 *
 * Combinada do mesmo jogo: todas as pernas precisam ganhar. Basta uma perder
 * pra aposta perder — e' o que impede um "vitoria + mais de 2.5" cumprido pela
 * metade de virar GANHOU.
 */
export function settleBet(
  market: string,
  teams: Teams,
  score: FinalScore | null,
  eventStatus: string | null,
): Settlement {
  if (!score || eventStatus == null)
    return {
      resultId: null,
      reason: 'SEM_PLACAR',
      explanation: 'placar do jogo ainda nao foi coletado',
    };
  if (eventStatus !== 'finished')
    return {
      resultId: null,
      reason: 'JOGO_NAO_FINALIZADO',
      explanation: `jogo com status "${eventStatus}" no provedor`,
    };

  const parsed = parseMarket(market, teams);
  if (!parsed.ok)
    return {
      resultId: null,
      reason: parsed.reason,
      explanation: parsed.detail,
    };

  const partes = parsed.conditions.map((c) => settleCondition(c, score, teams));
  const textos = partes.map((p) => p.text).join('; ');

  // Uma perna perdida derruba a aposta inteira, mesmo que as outras tenham
  // ganho. Por isso a checagem de LOST vem antes de tudo.
  if (partes.some((p) => p.outcome === 'LOST'))
    return {
      resultId: ResultIdEnum.LOST,
      reason: null,
      explanation: textos,
    };

  // Linha inteira empatada devolve a aposta. Numa combinada, uma perna anulada
  // muda a odd das demais — isso o app nao modela, entao fica pra decisao
  // humana em vez de virar um lucro errado.
  if (partes.some((p) => p.outcome === 'VOID'))
    return partes.length === 1
      ? {
          resultId: ResultIdEnum.CANCELED,
          reason: null,
          explanation: textos,
        }
      : {
          resultId: null,
          reason: 'MERCADO_NAO_RECONHECIDO',
          explanation: `perna anulada numa combinada muda a odd: ${textos}`,
        };

  return { resultId: ResultIdEnum.WON, reason: null, explanation: textos };
}

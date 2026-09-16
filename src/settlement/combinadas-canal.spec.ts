// Combinadas do mesmo jogo escritas em frase, com os textos reais das apostas
// pendentes de 2026-09-15 (trocando só o jogo pelo Palmeiras x São Paulo).

import { settleBet } from './settle';
import { SettlementContext } from './settlement.types';
import { ResultIdEnum as R } from '../bet/dto/result-id.enum';

const teams = { home: 'Palmeiras', away: 'São Paulo' };
// 2x0: 1T 1x0, 2T 1x0. Palmeiras com mais escanteios e chutes a gol.
const context: SettlementContext = {
  sport: 'Football',
  scoreScope: 'REGULATION',
  cardCounting: 'RED_COUNTS_TWO',
  periods: { FIRST_HALF: { home: 1, away: 0 }, SECOND_HALF: { home: 1, away: 0 } },
  teamStats: [
    { scope: 'REGULATION', metric: 'corners', home: 9, away: 6 },
    { scope: 'REGULATION', metric: 'shotsOnTarget', home: 6, away: 2 },
  ],
  playerStats: {
    complete: true,
    items: [
      { scope: 'REGULATION', name: 'Vitor Roque', participantId: '1150391', played: true, metric: 'goals', value: 1 },
    ],
  },
};
const run = (market: string) => settleBet(market, teams, { home: 2, away: 0 }, 'finished', context);

describe('combinada do mesmo jogo em frase', () => {
  it.each([
    ['Palmeiras vence e tem mais escanteios - Resultado final e escanteios', R.WON],
    ['São Paulo vence e tem mais escanteios - Resultado final e escanteios', R.LOST],
    ['Palmeiras vence e Vitor Roque marca a qualquer momento -', R.WON],
    ['Palmeiras ganha 1º tempo e Palmeiras tem mais chutes ao gol -', R.WON],
    ['Palmeiras marcar em ambos os tempos e ter mais escanteios -', R.WON],
    ['Ambas marcam e mais de 10.5 - Escanteios', R.LOST],
    ['Palmeiras e +1.5 gols', R.WON],
    ['1-0 HT e u3.5 gols', R.WON],
    ['Mais de 2.5 e sim - Total e ambas marcam', R.LOST],
  ])('%s', (market, esperado) => {
    expect(run(market).resultId).toBe(esperado);
  });

  it('cada perna aparece na explicação', () => {
    const r = run('Palmeiras vence e tem mais escanteios - Resultado final e escanteios');
    expect(r.explanation).toContain('2x0');
    expect(r.explanation).toContain('escanteios: Palmeiras 9 x 6 São Paulo');
  });

  it('o 1º tempo de uma perna não vaza pra outra', () => {
    // Se "1º tempo" contaminasse a segunda perna, ela procuraria chutes a gol do
    // 1º tempo — que não existem no contexto — e a aposta ficaria sem proposta.
    expect(run('Palmeiras ganha 1º tempo e Palmeiras tem mais chutes ao gol -').explanation).toContain('chutes a gol: Palmeiras 6 x 2');
  });
});

describe('combinada que não dá pra entender inteira fica sem proposta', () => {
  it.each([
    'Palmeiras vence e tem mais laterais -',
    'Palmeiras vence e algo que ninguém escreve -',
    // Sem verbo e sem total de gols do lado, time sozinho não é vitória.
    'Palmeiras e tem mais escanteios -',
    // Dois participantes pra um rótulo só: ambíguo.
    'Vitor Roque e Flaco López - Jogador para marcar',
    // Não é combinada: "e" dentro de um intervalo de minutos.
    'Mais de 1.5 gols entre 10 e 20 minutos',
  ])('%s', (market) => {
    expect(run(market).resultId).toBeNull();
  });
});

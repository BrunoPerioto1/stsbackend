// Abreviações e formatos de tipster levantados da planilha do grupo
// (2026-09-16). Cada caso confere o RESULTADO, não só a leitura: reescrever
// abreviação errado troca o sentido da aposta sem falhar parse nenhum.

import { ResultIdEnum as R } from '../bet/dto/result-id.enum';
import { abreviacoes } from './market-conditions';
import { normalize } from './market-parser';
import { selecoesDaMultipla, settleMultiEvent } from './multi-event';
import { settleBet } from './settle';

const TIMES = { home: 'Colômbia', away: 'Peru' };
const liquida = (market: string, home: number, away: number, times = TIMES) =>
  settleBet(market, times, { home, away }, 'finished').resultId;

describe('abreviacoes', () => {
  it.each([
    ['Colômbia ML e o2.5', 'colombia vence e mais de 2.5 gols'],
    ['Flamengo under 4.5 cantos', 'flamengo menos de 4.5 escanteios'],
    ['+2.5 gols na partida', 'mais de 2.5 gols'],
    ['-1.5 gols', 'menos de 1.5 gols'],
    ['u2.5', 'menos de 2.5 gols'],
    ['Brasil ML e BTTS', 'brasil vence e ambas marcam'],
    ['Argentina HT/FT', 'argentina/argentina - intervalo/final'],
    ['Portugal vence a 0', 'portugal vence de zero'],
    ['Paderborn DNB', 'paderborn +0 - handicap asiatico'],
    ['Corinthians DC', 'corinthians ou empate'],
    ['Marrocos 3+ gols', 'marrocos mais de 2.5 gols'],
    ['Resultado da partida + Total de gols', 'resultado da partida e total de gols'],
    ['Total de Gols (incluindo linhas Asiáticas)', 'total de gols'],
    // "o" antes de tempo não é linha.
    ['Palmeiras vence o 1º tempo', 'palmeiras vence 1o tempo'],
  ])('%s', (entrada, esperado) => {
    expect(abreviacoes(normalize(entrada))).toBe(esperado);
  });
});

describe('liquidação com abreviação', () => {
  it('ML e over', () => {
    expect(liquida('Colômbia ML e o2.5', 2, 1)).toBe(R.WON);
    expect(liquida('Colômbia ML e o2.5', 2, 0)).toBe(R.LOST);
    expect(liquida('Colômbia ML e o2.5', 1, 2)).toBe(R.LOST);
  });

  it('ML sozinho, antes ou depois do time', () => {
    expect(liquida('Colômbia ML', 1, 0)).toBe(R.WON);
    expect(liquida('ML Peru', 1, 0)).toBe(R.LOST);
  });

  it('under/over curtos', () => {
    expect(liquida('u2.5', 1, 1)).toBe(R.WON);
    expect(liquida('O3.5', 2, 1)).toBe(R.LOST);
    expect(liquida('+2.5 gols', 2, 1)).toBe(R.WON);
  });

  it('linha de gols do time', () => {
    expect(liquida('Colômbia o1.5', 2, 0)).toBe(R.WON);
    expect(liquida('Colômbia 3+ gols', 2, 0)).toBe(R.LOST);
  });

  it('vence a 0', () => {
    expect(liquida('Colômbia vence a 0', 1, 0)).toBe(R.WON);
    expect(liquida('Colômbia vence a 0', 2, 1)).toBe(R.LOST);
  });

  it('DNB devolve no empate', () => {
    expect(liquida('Colômbia DNB', 1, 1)).toBe(R.CANCELED);
    expect(liquida('Colômbia DNB', 0, 1)).toBe(R.LOST);
  });

  it('DC é dupla chance com empate', () => {
    expect(liquida('Peru DC', 1, 1)).toBe(R.WON);
    expect(liquida('Peru DC', 1, 0)).toBe(R.LOST);
  });

  it('ambas não marcam', () => {
    expect(liquida('Ambas não marcam', 1, 0)).toBe(R.WON);
    expect(liquida('Ambas não marcam', 1, 1)).toBe(R.LOST);
  });

  it('handicap de meia linha sem rótulo', () => {
    expect(liquida('Colômbia -1.5', 2, 0)).toBe(R.WON);
    expect(liquida('Colômbia -1.5', 1, 0)).toBe(R.LOST);
  });

  it('resultado e total com a linha repetida no rótulo', () => {
    expect(liquida('Colômbia e Mais de 2.5 / Resultado da partida + Total de gols 2.5', 3, 0)).toBe(R.WON);
    expect(liquida('Colômbia mais de 2.5 - 1x2 e total', 1, 0)).toBe(R.LOST);
  });

  it('segunda linha herda o "mais de"', () => {
    const com = (escanteios: number) =>
      settleBet('Over 2.5 gols e 9.5 cantos', TIMES, { home: 2, away: 1 }, 'finished', {
        sport: 'football',
        scoreScope: 'REGULATION',
        teamStats: [{ scope: 'REGULATION', metric: 'corners', home: escanteios, away: 4 }],
      } as never).resultId;
    expect(com(6)).toBe(R.WON);
    expect(com(5)).toBe(R.LOST);
  });
});

describe('formato em lista com a métrica repetida', () => {
  it('Mais de 2.5 Gols / Mais de 4.5 Cartões / Total de Gols / Total de Cartões', () => {
    expect(liquida('Mais de 2.5 Gols / Mais de 1.5 gols na partida / Total de Gols / Total de gols', 1, 1)).toBe(R.LOST);
    expect(liquida('Mais de 2.5 Gols / Mais de 1.5 gols na partida / Total de Gols / Total de gols', 2, 1)).toBe(R.WON);
  });
});

describe('múltipla de vitórias com rótulo à parte', () => {
  const leg = (position: number, home: string, away: string, h: number, a: number) => ({
    position,
    teams: { home, away },
    score: { home: h, away: a },
    eventStatus: 'finished',
    context: { sport: 'Football', scoreScope: 'REGULATION' as const },
  });
  const game = 'Brasil x Haiti / Escócia x Grécia';

  it.each([
    'Brasil e Escócia vencem / Resultado Final',
    'Brasil vence / Escócia vence / Resultado Final',
    'Brasil vence, Escócia vence',
  ])('%s', (market) => {
    expect(selecoesDaMultipla(game, market)).toEqual(['Brasil - Resultado final', 'Escócia - Resultado final']);
    expect(settleMultiEvent(game, market, [leg(0, 'Brasil', 'Haiti', 3, 0), leg(1, 'Scotland', 'Greece', 0, 1)]).resultId).toBe(R.LOST);
  });
});

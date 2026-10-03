import { ResultIdEnum } from '../bet/dto/result-id.enum';
import { settleBet } from './settle';

// Só as travas do motor de liquidação: o que, quebrado, liquidaria aposta errado.
const TIMES = { home: 'Flamengo', away: 'Palmeiras' };
const liquida = (market: string, home: number, away: number) =>
  settleBet(market, TIMES, { home, away }, 'finished');

describe('liquidação', () => {
  it.each([
    ['Mais de 2.5 - Total de gols', 2, 1, ResultIdEnum.WON],
    ['Mais de 2.5 - Total de gols', 1, 1, ResultIdEnum.LOST],
    ['Flamengo mais de 1.5 - Total de gols', 1, 4, ResultIdEnum.LOST],
    ['Sim - Ambas marcam', 3, 0, ResultIdEnum.LOST],
    ['Flamengo - Resultado final', 1, 1, ResultIdEnum.LOST],
    ['Empate - Resultado final', 1, 1, ResultIdEnum.WON],
    ['2-1 - Resultado correto', 1, 2, ResultIdEnum.LOST],
    ['Mais de 2 - Total de gols', 1, 1, ResultIdEnum.CANCELED],
  ])('%s em %ix%i', (market, home, away, result) => {
    expect(liquida(market, home, away).resultId).toBe(result);
  });

  it('perna escondida no mesmo trecho não vira ganhou', () => {
    expect(liquida('Ambas marcam e mais de 2.5', 1, 1).resultId).toBe(ResultIdEnum.LOST);
  });

  it('combinada perde quando só uma perna ganha', () => {
    expect(liquida('Flamengo - Resultado final / Mais de 2.5 - Total de gols', 2, 0).resultId).toBe(
      ResultIdEnum.LOST,
    );
  });

  it('sem dado ou com perna anulada fica pra decisão humana, nunca chute', () => {
    expect(liquida('Flamengo - Resultado final / Mais de 9.5 - Escanteios', 2, 0).resultId).toBeNull();
    expect(liquida('Flamengo - Resultado final / Mais de 3 - Total de gols', 2, 1).resultId).toBeNull();
    expect(liquida('Mais de 2.5 gols - Flamengo x Palmeiras', 2, 1).resultId).toBeNull();
  });

  it('jogo sem placar ou adiado não sugere', () => {
    expect(settleBet('Mais de 2.5 gols', TIMES, null, null).reason).toBe('SEM_PLACAR');
    expect(settleBet('Mais de 2.5 gols', TIMES, { home: 0, away: 0 }, 'postponed').reason).toBe(
      'JOGO_NAO_FINALIZADO',
    );
  });
});

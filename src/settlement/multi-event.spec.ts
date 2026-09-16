// Múltiplas de vários jogos com os textos reais do canal e do grupo seguido
// (2026-08-18 e 2026-09-15). Os placares são inventados pra cada caso; o que
// importa é o formato do texto e a ligação de cada seleção ao seu jogo.

import { EventLeg, isMultiEvent, selecoesDaMultipla, settleMultiEvent } from './multi-event';
import { FinalScore } from './settlement.types';
import { ResultIdEnum as R } from '../bet/dto/result-id.enum';

const leg = (position: number, home: string, away: string, score: FinalScore, eventStatus = 'finished'): EventLeg => ({
  position,
  teams: { home, away },
  score,
  eventStatus,
  context: { sport: 'Football', scoreScope: 'REGULATION', cardCounting: 'RED_COUNTS_TWO' },
});

describe('confrontos no mercado, seleções depois do " · "', () => {
  const game = 'Múltipla (3 jogos)';
  const market = 'Como 1907 x Parma / Torino FC x AS Roma / Inter Milan x Udinese · Como, Roma e Inter de Milão vencerem - Resultado final';

  it('uma frase com um time por jogo', () => {
    expect(selecoesDaMultipla(game, market)).toEqual([
      'Como - Resultado final',
      'Roma - Resultado final',
      'Inter de Milão - Resultado final',
    ]);
  });

  it('todos venceram: ganhou', () => {
    const r = settleMultiEvent(game, market, [
      leg(0, 'Como', 'Parma', { home: 2, away: 1 }),
      leg(1, 'Torino', 'Roma', { home: 0, away: 2 }),
      leg(2, 'Inter', 'Udinese', { home: 5, away: 3 }),
    ]);
    expect(r.resultId).toBe(R.WON);
    expect(r.explanation).toContain('Torino x Roma');
  });

  it('um perdeu: perdeu, e a frase diz qual', () => {
    const r = settleMultiEvent(game, market, [
      leg(0, 'Como', 'Parma', { home: 2, away: 1 }),
      leg(1, 'Torino', 'Roma', { home: 1, away: 0 }),
      leg(2, 'Inter', 'Udinese', { home: 5, away: 3 }),
    ]);
    expect(r.resultId).toBe(R.LOST);
    expect(r.explanation).toMatch(/^Torino x Roma: /);
  });

  it('seleção sem time liga pela posição', () => {
    // Trocar a ordem daria o contrário: 2 gols não passa de 2.5.
    const r = settleMultiEvent(
      'Múltipla (2 jogos)',
      'Stuttgart x Viking / PSG x Slovan Bratislava · Mais de 1.5 - Total de gols / Mais de 2.5 - Total de gols',
      [leg(0, 'VfB Stuttgart', 'Viking FK', { home: 2, away: 0 }), leg(1, 'Paris Saint-Germain', 'Slovan Bratislava', { home: 3, away: 0 })],
    );
    expect(r.resultId).toBe(R.WON);
  });
});

describe('confrontos no jogo, seleções no mercado', () => {
  const game = 'Olimpia x Vasco / Corinthians x Rosario Central / LDU Quito x Mirassol';
  const market = 'Club Olimpia - Resultado final / Corinthians - Resultado final / LDU Quito - Resultado final';
  const legs = (olimpia: FinalScore) => [
    leg(0, 'Club Olimpia', 'Vasco da Gama', olimpia),
    leg(1, 'Corinthians', 'Rosario Central', { home: 1, away: 0 }),
    leg(2, 'LDU Quito', 'Mirassol', { home: 2, away: 0 }),
  ];

  it('é múltipla', () => {
    expect(isMultiEvent(game, market)).toBe(true);
  });

  it('cada seleção cai no jogo do seu time', () => {
    expect(settleMultiEvent(game, market, legs({ home: 2, away: 1 })).resultId).toBe(R.WON);
    expect(settleMultiEvent(game, market, legs({ home: 0, away: 1 })).resultId).toBe(R.LOST);
  });

  it('"Boca Juniors e São Paulo vencerem"', () => {
    const r = settleMultiEvent('CD Recoleta x Boca Juniors / São Paulo x Bolívar', 'Boca Juniors e São Paulo vencerem - Resultado final', [
      leg(0, 'CD Recoleta', 'Boca Juniors', { home: 0, away: 2 }),
      leg(1, 'São Paulo', 'Bolívar', { home: 2, away: 0 }),
    ]);
    expect(r.resultId).toBe(R.WON);
  });
});

describe('confronto grudado em cada seleção', () => {
  const game = 'Múltipla (2 jogos)';
  const market = 'Londrina-PR vs Ponte Preta-SP - mais de 1.5 gols / Náutico-PE vs Operário-PR - mais de 1.5 gols';

  it('tira o confronto da seleção', () => {
    expect(selecoesDaMultipla(game, market)).toEqual(['mais de 1.5 gols', 'mais de 1.5 gols']);
  });

  it('0x0 num dos jogos: perdeu', () => {
    const r = settleMultiEvent(game, market, [
      leg(0, 'Londrina', 'Ponte Preta', { home: 1, away: 1 }),
      leg(1, 'Náutico', 'Operário-PR', { home: 0, away: 0 }),
    ]);
    expect(r.resultId).toBe(R.LOST);
  });
});

describe('sem dado pra decidir, nada de chute', () => {
  const game = 'CD Recoleta x Boca Juniors / São Paulo x Bolívar';
  const market = 'Boca Juniors - Resultado final / São Paulo - Resultado final';

  it('jogo que não casou: sem proposta se o resto ganhou', () => {
    const r = settleMultiEvent(game, market, [leg(0, 'CD Recoleta', 'Boca Juniors', { home: 0, away: 2 })]);
    expect(r.resultId).toBeNull();
    expect(r.reason).toBe('SEM_PLACAR');
  });

  it('jogo que não casou: perdeu se outra perna já perdeu', () => {
    const r = settleMultiEvent(game, market, [leg(0, 'CD Recoleta', 'Boca Juniors', { home: 1, away: 0 })]);
    expect(r.resultId).toBe(R.LOST);
  });

  it('jogo ainda não terminou', () => {
    const r = settleMultiEvent(game, market, [
      leg(0, 'CD Recoleta', 'Boca Juniors', { home: 0, away: 2 }),
      leg(1, 'São Paulo', 'Bolívar', { home: 0, away: 0 }, 'inprogress'),
    ]);
    expect(r.resultId).toBeNull();
  });

  it('seleção sem time e sem uma por jogo não liga a jogo nenhum', () => {
    const r = settleMultiEvent(game, 'Mais de 1.5 - Total de gols', [
      leg(0, 'CD Recoleta', 'Boca Juniors', { home: 0, away: 2 }),
      leg(1, 'São Paulo', 'Bolívar', { home: 2, away: 0 }),
    ]);
    expect(r.resultId).toBeNull();
  });

  it('prorrogação e classificação ficam de fora', () => {
    const r = settleMultiEvent(
      'Múltipla (2 jogos)',
      'Austrália W x Espanha W / Bélgica W x Alemanha W · Espanha (F) e Bélgica (F) vencem (incluindo prorrogação) - Resultado final',
      [],
    );
    expect(r.reason).toBe('ESCOPO_NAO_SUPORTADO');
  });

  it('jogo único não é múltipla', () => {
    expect(isMultiEvent('Flamengo x Cruzeiro', 'Flamengo - Resultado final / Flamengo - Mais escanteios')).toBe(false);
  });
});

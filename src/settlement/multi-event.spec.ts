// Múltiplas de vários jogos com os textos reais do canal e do grupo seguido
// (2026-08-18 e 2026-09-15). Os placares são inventados pra cada caso; o que
// importa é o formato do texto e a ligação de cada seleção ao seu jogo.

import { condicaoPorJogo, EventLeg, isMultiEvent, selecoesDaMultipla, settleMultiEvent } from './multi-event';
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

// Bilhete real (2026-09-15) que o bot não reconheceu: os confrontos vêm
// separados por vírgula e "&" em vez de " / ", e a frase traz "vencem suas
// partidas" em vez de "vencerem".
describe('confrontos separados por vírgula e "&"', () => {
  const game = 'FC Barcelona x Racing Santander, Atlético Madrid x Osasuna & Levante x Athletic Bilbao';
  const market = 'Barcelona, Atletico de Madrid e Athletic Bilbao vencem suas partidas - Resultado final';

  it('reconhece os três jogos', () => {
    expect(isMultiEvent(game, market)).toBe(true);
  });

  it('uma seleção por time', () => {
    expect(selecoesDaMultipla(game, market)).toEqual([
      'Barcelona - Resultado final',
      'Atletico de Madrid - Resultado final',
      'Athletic Bilbao - Resultado final',
    ]);
  });

  it('todos venceram: ganhou', () => {
    const r = settleMultiEvent(game, market, [
      leg(0, 'FC Barcelona', 'Racing Santander', { home: 3, away: 1 }),
      leg(1, 'Atlético Madrid', 'Osasuna', { home: 2, away: 0 }),
      leg(2, 'Levante', 'Athletic Bilbao', { home: 0, away: 1 }),
    ]);
    expect(r.resultId).toBe(R.WON);
  });
});

// Aposta 12041 (2026-09-15): uma frase só vale pra todos os jogos.
describe('mesma seleção "em cada partida"', () => {
  const game = 'Londrina x Ponte Preta, Náutico x Operário & CRB x Sport Recife';
  const market = 'Mais de 1.5 gols em cada partida - Total de gols';
  const jogos = (terceiro: FinalScore) => [
    leg(0, 'Londrina', 'Ponte Preta', { home: 6, away: 0 }),
    leg(1, 'Náutico', 'Operário-PR', { home: 2, away: 1 }),
    leg(2, 'CRB', 'Sport Recife', terceiro),
  ];

  it('vira uma seleção por jogo', () => {
    expect(selecoesDaMultipla(game, market)).toEqual([
      'mais de 1.5 gols - total de gols (Londrina x Ponte Preta)',
      'mais de 1.5 gols - total de gols (Náutico x Operário)',
      'mais de 1.5 gols - total de gols (CRB x Sport Recife)',
    ]);
  });

  it('todos passaram da linha: ganhou', () => {
    expect(settleMultiEvent(game, market, jogos({ home: 1, away: 1 })).resultId).toBe(R.WON);
  });

  it('um jogo abaixo da linha: perdeu', () => {
    const r = settleMultiEvent(game, market, jogos({ home: 1, away: 0 }));
    expect(r.resultId).toBe(R.LOST);
    expect(r.explanation).toMatch(/^CRB x Sport Recife: /);
  });

  it('perde mesmo com outro jogo sem placar', () => {
    const r = settleMultiEvent(game, market, [leg(0, 'Londrina', 'Ponte Preta', { home: 1, away: 0 })]);
    expect(r.resultId).toBe(R.LOST);
  });
});


describe('condicaoPorJogo', () => {
  it.each([
    ['Mais de 1.5 gols em cada jogo', 2],
    ['Mais de 1.5 gols cada partida', 2],
    ['Mais de 1.5 gols de cada jogo', 2],
    ['Mais de 1.5 gols em todos os jogos', 3],
    ['Mais de 1.5 gols em todos jogos', 3],
    ['Mais de 1.5 gols todos jogos', 3],
    ['Mais de 1.5 gols em todas as partidas', 3],
    ['Mais de 1.5 gols todas partidas', 3],
    ['Mais de 1.5 gols em todos os jogos cada', 3],
    ['Mais de 1.5 gols todos jogos cada', 3],
    ['Mais de 1.5 gols em ambos os jogos', 2],
    ['Mais de 1.5 gols ambos jogos', 2],
    ['Mais de 1.5 gols em ambas as partidas', 2],
    ['Mais de 1.5 gols em cada um dos jogos', 2],
    ['Mais de 1.5 gols em cada um dos 3 jogos', 3],
    ['Mais de 1.5 gols em cada uma das três partidas', 3],
    ['Mais de 1.5 gols nos 2 jogos', 2],
    ['Mais de 1.5 gols nas duas partidas', 2],
    ['Mais de 1.5 gols em todos os 4 jogos', 4],
    // Erros de escrita do grupo.
    ['Mais de 1.5 gols em todos jogo', 2],
    ['Mais de 1.5 gols em todas partida cada', 2],
    ['Mais de 1.5 gols ambas jogos', 2],
    ['MAIS DE 1.5 GOLS EM CADA PARTIDA', 2],
  ])('"%s" vira condição por jogo', (texto, n) => {
    expect(condicaoPorJogo(texto, n)).toBe('mais de 1.5 gols');
  });

  it('preserva mercado, linha e período', () => {
    expect(condicaoPorJogo('Mais de 4.5 escanteios no 1º tempo em cada partida - Escanteios', 2)).toBe(
      'mais de 4.5 escanteios no 1o tempo - escanteios',
    );
  });

  it.each([
    ['Mais de 1.5 gols na partida', 2],
    ['Mais de 1.5 gols no jogo', 2],
    ['Cada equipe leva mais de 1.5 cartões', 2],
    ['Sim - Ambas marcam', 2],
    ['Flamengo marca em ambos os tempos', 2],
    ['Mais de 4.5 gols somados em todos os jogos', 3],
    ['Total combinado de gols mais de 4.5 em todos os jogos', 3],
    // N diferente dos confrontos identificados.
    ['Mais de 1.5 gols em cada um dos 3 jogos', 2],
    ['Mais de 1.5 gols nos 3 jogos', 2],
    // Número solto, sem preposição: pode ser outra estatística.
    ['Marcou em 3 jogos seguidos', 3],
    // Um jogo só não é múltipla.
    ['Mais de 1.5 gols em cada partida', 1],
  ])('"%s" não é condição por jogo', (texto, n) => {
    expect(condicaoPorJogo(texto, n)).toBeNull();
  });
});

describe('vitória de todos os times listados', () => {
  it.each([
    'Flamengo e Palmeiras vencerem seus jogos',
    'Flamengo e Palmeiras vencerem suas partidas',
    'Flamengo e Palmeiras todos para ganhar',
    'Flamengo e Palmeiras todos para vencer',
    'Flamengo e Palmeiras todos vencerem',
    'Flamengo e Palmeiras todos ganham',
    'Flamengo e Palmeiras ambos vencem',
    'Flamengo e Palmeiras ambos vencerem',
  ])('%s', (market) => {
    expect(selecoesDaMultipla('Flamengo x Bahia / Palmeiras x Santos', market)).toEqual([
      'Flamengo - Resultado final',
      'Palmeiras - Resultado final',
    ]);
  });
});


describe('mais de uma seleção distributiva', () => {
  const game = 'Flamengo x Bahia / Palmeiras x Santos';
  it('expande cada frase pra cada jogo', () => {
    expect(
      selecoesDaMultipla(game, 'Mais de 1.5 gols em cada partida / Mais de 8.5 escanteios em cada partida'),
    ).toHaveLength(4);
  });

  it('mistura com seleção comum', () => {
    expect(
      selecoesDaMultipla(game, 'Mais de 1.5 gols em cada partida / Flamengo - Resultado final'),
    ).toEqual([
      'mais de 1.5 gols (Flamengo x Bahia)',
      'mais de 1.5 gols (Palmeiras x Santos)',
      'Flamengo - Resultado final',
    ]);
  });

  it('gols e vitória: ganhou quando tudo bate, perdeu quando um jogo falha', () => {
    const market = 'Mais de 1.5 gols em cada partida - Total de gols / Flamengo - Resultado final';
    expect(
      settleMultiEvent(game, market, [leg(0, 'Flamengo', 'Bahia', { home: 2, away: 1 }), leg(1, 'Palmeiras', 'Santos', { home: 1, away: 1 })]).resultId,
    ).toBe(R.WON);
    const perdeu = settleMultiEvent(game, market, [
      leg(0, 'Flamengo', 'Bahia', { home: 2, away: 1 }),
      leg(1, 'Palmeiras', 'Santos', { home: 1, away: 0 }),
    ]);
    expect(perdeu.resultId).toBe(R.LOST);
    expect(perdeu.explanation).toMatch(/^Palmeiras x Santos: /);
  });

  it('duas frases distributivas', () => {
    const market = 'Mais de 1.5 gols em cada partida - Total de gols / Menos de 3.5 gols em todas as partidas - Total de gols';
    const com = (b: FinalScore) => settleMultiEvent(game, market, [leg(0, 'Flamengo', 'Bahia', { home: 2, away: 1 }), leg(1, 'Palmeiras', 'Santos', b)]);
    expect(com({ home: 1, away: 1 }).resultId).toBe(R.WON);
    expect(com({ home: 3, away: 1 }).resultId).toBe(R.LOST);
    expect(com({ home: 1, away: 0 }).resultId).toBe(R.LOST);
  });
});

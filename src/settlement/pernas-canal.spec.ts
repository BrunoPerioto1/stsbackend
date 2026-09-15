// Pernas de múltipla do mesmo jogo que ficavam sem proposta, com os textos das
// apostas pendentes reais de 2026-09-15 e os nomes de time como o provider grava.

import { settleBet } from './settle';
import { SettlementContext } from './settlement.types';
import { ResultIdEnum as R } from '../bet/dto/result-id.enum';

type Extra = Partial<SettlementContext>;
const run = (market: string, home: string, away: string, score: [number, number], extra: Extra = {}) =>
  settleBet(market, { home, away }, { home: score[0], away: score[1] }, 'finished', {
    sport: 'Football',
    scoreScope: 'REGULATION',
    cardCounting: 'RED_COUNTS_TWO',
    ...extra,
  });

const jogador = (name: string, goals: number): Extra => ({
  playerStats: {
    complete: true,
    items: [{ scope: 'REGULATION', name, participantId: '1', played: true, metric: 'goals', value: goals }],
  },
});

describe('nome do time com palavra que o provider não tem', () => {
  it.each([
    ['Como 1907 para vencer de zero - Resultado final', 'Como', 'Parma', [2, 1], R.LOST],
    ['Como 1907 para vencer de zero - Resultado final', 'Como', 'Parma', [2, 0], R.WON],
    ['Como 1907 mais de 1.5 - Total de gols', 'Como', 'Parma', [2, 1], R.WON],
    ['Inter Milan - Vencedor do encontro', 'Inter', 'Udinese', [5, 3], R.WON],
    ['Bayern Munich mais de 3.5 - Total de gols', 'FC Bayern München', 'Bodø/Glimt', [5, 0], R.WON],
  ] as const)('%s (%s x %s)', (market, home, away, score, esperado) => {
    expect(run(market, home, away, [...score]).resultId).toBe(esperado);
  });

  it('palavra dos dois times não escolhe lado', () => {
    expect(run('Manchester - Resultado final', 'Manchester United', 'Manchester City', [2, 1]).resultId).toBeNull();
  });

  it('múltipla inteira com o nome longo', () => {
    const r = run(
      'Como 1907 - Vencedor do encontro / Como 1907 -0.5 - Handicap / Como 1907 menos de 1.5 - Total de cartões',
      'Como', 'RB Leipzig', [2, 1],
      { teamStats: [{ scope: 'REGULATION', metric: 'cardPoints', home: 1, away: 4 }] },
    );
    expect(r.resultId).toBe(R.WON);
  });
});

describe('rótulos de marcador', () => {
  it.each([
    'Lautaro Martinez - Marcador a qualquer momento',
    'Lautaro Martinez - Para marcar a qualquer momento',
    'Lautaro Martinez - A marcar',
    'Lautaro Martinez - Marcar gol',
  ])('%s', (market) => {
    expect(run(market, 'Inter', 'Udinese', [5, 3], jogador('Lautaro Martínez', 1)).resultId).toBe(R.WON);
    expect(run(market, 'Inter', 'Udinese', [5, 3], jogador('Lautaro Martínez', 0)).resultId).toBe(R.LOST);
  });
});

describe('gol ou assistência', () => {
  const olise = (goals: number, assists: number): Extra => ({
    playerStats: {
      complete: true,
      items: [
        { scope: 'REGULATION', name: 'Michael Olise', participantId: '9', played: true, metric: 'goals', value: goals },
        { scope: 'REGULATION', name: 'Michael Olise', participantId: '9', played: true, metric: 'assists', value: assists },
      ],
    },
  });

  it('o "ou" do rótulo não vira condição alternativa', () => {
    const market = 'Michael Olise - Jogador a marcar ou dar assistência';
    expect(run(market, 'SV 07 Elversberg', 'FC Bayern München', [1, 3], olise(0, 1)).resultId).toBe(R.WON);
    expect(run(market, 'SV 07 Elversberg', 'FC Bayern München', [1, 3], olise(0, 0)).resultId).toBe(R.LOST);
  });
});

describe('tempos', () => {
  const periodos = (p1: [number, number], p2: [number, number]): Extra => ({
    periods: { FIRST_HALF: { home: p1[0], away: p1[1] }, SECOND_HALF: { home: p2[0], away: p2[1] } },
  });

  it.each([
    ['Mais de 0.5 - Total 1ºT', R.WON],
    ['Mais de 0.5 - Gols no 1º tempo', R.WON],
    ['Real Madrid - Vencer cada tempo', R.WON],
    ['Real Madrid ganha ambos os tempos', R.WON],
  ])('%s', (market, esperado) => {
    expect(run(market, 'Real Madrid', 'Osasuna', [2, 0], periodos([1, 0], [1, 0])).resultId).toBe(esperado);
  });

  it('vencer cada tempo perde com um tempo empatado', () => {
    expect(run('Real Madrid - Vencer cada tempo', 'Real Madrid', 'Osasuna', [1, 0], periodos([1, 0], [0, 0])).resultId).toBe(R.LOST);
  });

  it('escanteios no 1º tempo lê o escopo do tempo', () => {
    const r = run('Mais de 4.5 - Escanteios no 1º tempo', 'Real Madrid', 'Osasuna', [2, 0], {
      teamStats: [{ scope: 'FIRST_HALF', metric: 'corners', home: 4, away: 2 }],
    });
    expect(r.resultId).toBe(R.WON);
  });
});

describe('outras formas do canal', () => {
  it('1º gol', () => {
    const r = run('Flamengo - 1º gol', 'Independiente del Valle', 'Flamengo', [1, 2], {
      incidents: {
        complete: true,
        items: [
          { type: 'GOAL', scope: 'REGULATION', side: 'AWAY', sequence: 1 },
          { type: 'GOAL', scope: 'REGULATION', side: 'HOME', sequence: 2 },
          { type: 'GOAL', scope: 'REGULATION', side: 'AWAY', sequence: 3 },
        ],
      },
    });
    expect(r.resultId).toBe(R.WON);
  });

  it.each([
    ['Ambas marcam - Ambas marcam', [2, 1], R.WON],
    ['Ambas marcam: Não', [2, 0], R.WON],
    ['Sim - Flamengo não sofre gol', [2, 0], R.WON],
    ['Sim - Flamengo não sofre gol', [2, 1], R.LOST],
  ] as const)('%s (%s)', (market, score, esperado) => {
    expect(run(market, 'Flamengo', 'Bahia', [...score]).resultId).toBe(esperado);
  });

  it.each([
    ['Cada equipe leva mais de 1.5 cartões - Total de cartões', 2, 3, R.WON],
    ['Cada equipe leva mais de 1.5 cartões - Total de cartões', 1, 3, R.LOST],
    ['Sim - Ambas equipes receberão um cartão', 1, 2, R.WON],
    ['Sim - Ambas equipes receberão um cartão', 0, 2, R.LOST],
  ] as const)('%s (%s x %s cartões)', (market, casa, fora, esperado) => {
    const r = run(market, 'Vila Nova FC', 'Goiás', [1, 1], {
      teamStats: [{ scope: 'REGULATION', metric: 'cardPoints', home: casa, away: fora }],
    });
    expect(r.resultId).toBe(esperado);
  });

  it('"não" em cada equipe fica sem proposta', () => {
    expect(run('Não - Ambas equipes receberão um cartão', 'Vila Nova FC', 'Goiás', [1, 1], {
      teamStats: [{ scope: 'REGULATION', metric: 'cardPoints', home: 0, away: 2 }],
    }).resultId).toBeNull();
  });
});

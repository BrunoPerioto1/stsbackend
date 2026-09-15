// Rótulos como o canal de tips escreve, tirados das apostas pendentes reais de
// 2026-09-15 que ficavam sem proposta.

import { settleBet } from './settle';
import { SettlementContext, Stat, Teams } from './settlement.types';
import { ResultIdEnum as R } from '../bet/dto/result-id.enum';

interface Jogo {
  teams: Teams;
  score: { home: number; away: number };
  periods?: SettlementContext['periods'];
  teamStats?: Stat[];
  incidents?: SettlementContext['incidents'];
  semRegraDeCartao?: boolean;
}

const run = (market: string, jogo: Jogo) =>
  settleBet(market, jogo.teams, jogo.score, 'finished', {
    sport: 'Football',
    scoreScope: 'REGULATION',
    ...(jogo.semRegraDeCartao ? {} : { cardCounting: 'RED_COUNTS_TWO' as const }),
    periods: jogo.periods,
    teamStats: jogo.teamStats,
    incidents: jogo.incidents,
  });

const flamengo: Jogo = {
  teams: { home: 'Flamengo', away: 'Corinthians' },
  score: { home: 2, away: 1 },
  periods: { FIRST_HALF: { home: 1, away: 0 }, SECOND_HALF: { home: 1, away: 1 } },
  teamStats: [{ scope: 'REGULATION', metric: 'shotsOnTarget', home: 8, away: 3 }],
  incidents: {
    complete: true,
    items: [
      { type: 'GOAL', scope: 'REGULATION', side: 'HOME', sequence: 1 },
      { type: 'GOAL', scope: 'REGULATION', side: 'AWAY', sequence: 2 },
      { type: 'GOAL', scope: 'REGULATION', side: 'HOME', sequence: 3 },
    ],
  },
};
const bahia: Jogo = {
  teams: { home: 'Bahia', away: 'Remo' },
  score: { home: 2, away: 1 },
  teamStats: [
    { scope: 'REGULATION', metric: 'shotsOnTarget', home: 7, away: 2 },
    { scope: 'REGULATION', metric: 'cardPoints', home: 3, away: 5 },
  ],
};

describe('nome de time com sigla', () => {
  it.each([
    ['Flamengo RJ - Resultado final', flamengo, R.WON],
    ['EC Bahia - Resultado final / Não - Ambas marcam', bahia, R.LOST],
    ['Bahia BA mais de 6.5 - Total de chutes no gol', bahia, R.WON],
  ])('%s', (market, jogo, esperado) => {
    expect(run(market, jogo).resultId).toBe(esperado);
  });

  it('sigla não confunde Atlético com Athletico', () => {
    const jogo: Jogo = {
      teams: { home: 'Atlético Mineiro', away: 'Athletico Paranaense' },
      score: { home: 0, away: 1 },
    };
    expect(run('Atlético MG - Resultado final', jogo).resultId).toBe(R.LOST);
  });
});

describe('frases do canal', () => {
  it.each([
    // 1T 1x0 e 2T 1x1: venceu o primeiro tempo.
    ['Sim - Flamengo para vencer um dos tempos', R.WON],
    ['Corinthians vence um dos tempos - Sim', R.LOST],
    ['Flamengo - Ganhar sem sofrer gols', R.LOST],
    ['Flamengo - Próximo gol (Gol 1)', R.WON],
    ['Ambas equipes marcam - Sim', R.WON],
    ['Flamengo marca em ambos os tempos - Resultado da partida', R.WON],
    ['Corinthians marca em ambos os tempos - Resultado da partida', R.LOST],
    ['Flamengo - Maior número de chutes ao gol', R.WON],
  ])('%s', (market, esperado) => {
    expect(run(market, flamengo).resultId).toBe(esperado);
  });

  it('"Atlético MG vence um dos tempos - Sim" com a sigla', () => {
    const jogo: Jogo = {
      teams: { home: 'Atlético Mineiro', away: 'Fluminense' },
      score: { home: 3, away: 1 },
      periods: { FIRST_HALF: { home: 0, away: 1 }, SECOND_HALF: { home: 3, away: 0 } },
    };
    expect(run('Atlético MG vence um dos tempos - Sim', jogo).resultId).toBe(R.WON);
  });
});

describe('cartões com vermelho valendo 2', () => {
  // Coritiba x Athletico (15235476): 3 amarelos + 1 vermelho = 5; 4 amarelos = 4.
  const coritiba: Jogo = {
    teams: { home: 'Coritiba', away: 'Athletico Paranaense' },
    score: { home: 3, away: 3 },
    teamStats: [{ scope: 'REGULATION', metric: 'cardPoints', home: 5, away: 4 }],
  };

  it('aposta real "UNDER 6.5 CARDS" perde com 9 pontos', () => {
    const r = run('UNDER 6.5 CARDS', coritiba);
    expect(r.resultId).toBe(R.LOST);
    expect(r.explanation).toContain('9 cartões (vermelho vale 2) no jogo');
  });

  it.each([
    ['Remo - Maior número de cartões', R.WON],
    ['Mais de 7.5 - Total de cartões', R.WON],
    ['Remo mais de 4.5 - Total de cartões', R.WON],
  ])('%s', (market, esperado) => {
    expect(run(market, bahia).resultId).toBe(esperado);
  });

  it('sem a regra da casa no contexto, cartão não liquida', () => {
    expect(run('UNDER 6.5 CARDS', { ...coritiba, semRegraDeCartao: true }).reason).toBe('REGRA_NAO_SUPORTADA');
  });

  it('linha antiga "cards" gravada em produção é ignorada', () => {
    // event_facts de produção ainda tem cards = amarelo + vermelho valendo 1.
    const antigo: Jogo = { ...coritiba, teamStats: [{ scope: 'REGULATION', metric: 'cards', home: 4, away: 4 }] };
    expect(run('UNDER 6.5 CARDS', antigo).reason).toBe('DADO_INDISPONIVEL');
  });
});

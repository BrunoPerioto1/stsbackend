// Múltipla perde quando qualquer perna perde. Casos reais das pendentes de
// 2026-09-15 que ficavam sem proposta mesmo com uma perna já perdida.

import { settleBet } from './settle';
import { SettlementContext, Stat, Teams } from './settlement.types';
import { ResultIdEnum as R } from '../bet/dto/result-id.enum';

const base = (teamStats: Stat[], extra: Partial<SettlementContext> = {}): SettlementContext => ({
  sport: 'Football', scoreScope: 'REGULATION', cardCounting: 'RED_COUNTS_TWO',
  teamStats, playerStats: { complete: true, items: [] }, ...extra,
});
const run = (market: string, teams: Teams, score: { home: number; away: number }, ctx: SettlementContext) =>
  settleBet(market, teams, score, 'finished', ctx);

describe('perna indefinida não segura uma perna perdida', () => {
  // Aposta 11467: Holstad não entrou em campo, mas o jogo teve 8 escanteios.
  const holstad = 'Mais de 2.5 - Total de gols / Clay Holstad 1+ - Chutes a gol / Mais de 10.5 - Escanteios';
  const minnesota = { home: 'Minnesota United', away: 'FC Dallas' };

  it('escanteios perderam: a múltipla perdeu, com ou sem o Holstad', () => {
    const r = run(holstad, minnesota, { home: 1, away: 2 }, base([{ scope: 'REGULATION', metric: 'corners', home: 5, away: 3 }]));
    expect(r.resultId).toBe(R.LOST);
    expect(r.explanation).toContain('8 escanteios no jogo');
  });

  it('se as outras pernas ganharam, a indefinida continua segurando', () => {
    const r = run(holstad, minnesota, { home: 1, away: 2 }, base([{ scope: 'REGULATION', metric: 'corners', home: 7, away: 5 }]));
    expect(r.resultId).toBeNull();
    expect(r.reason).toBe('DADO_INDISPONIVEL');
  });

  it('perna anulada mais perna perdida é perdida', () => {
    const r = run('Flamengo -1 - Handicap asiático / Mais de 3.5 - Total de gols', { home: 'Flamengo', away: 'Vasco' },
      { home: 1, away: 0 }, base([]));
    expect(r.resultId).toBe(R.LOST);
  });
});

describe('texto cortado pelo canal', () => {
  const flamengo = { home: 'Flamengo', away: 'Corinthians' };
  const periodos = { FIRST_HALF: { home: 0, away: 0 }, SECOND_HALF: { home: 2, away: 1 } };

  it('perna completa perdida decide mesmo sem saber o resto (aposta 11909)', () => {
    // 1T 0x0: "Mais de 0.5 gols 1ºT" perdeu. O "Escan" cortado não importa.
    const cortada = 'Pedro Guilherme - Marcar em qualquer momento / Mais de 0.5 - Total de gols 1ºT / Mais de 9.5 - Escan';
    expect([...cortada].length).toBe(100);
    const r = run(cortada, flamengo, { home: 2, away: 1 }, base([], { periods: periodos }));
    expect(r.resultId).toBe(R.LOST);
    expect(r.explanation).toContain('texto cortado pelo canal');
  });

  it('pernas completas ganhando não viram GANHOU (aposta 12013)', () => {
    const cortada = 'Mais de 1.5 - Total de gols / Mais de 4.5 - Total de escanteios 1ºT / Mais de 3.5 - Total de cartões';
    expect([...cortada].length).toBe(100);
    const ctx = base([
      { scope: 'FIRST_HALF', metric: 'corners', home: 4, away: 3 },
      { scope: 'REGULATION', metric: 'cardPoints', home: 3, away: 3 },
    ]);
    const r = run(cortada, { home: 'Bahia', away: 'Remo' }, { home: 2, away: 1 }, ctx);
    expect(r.resultId).toBeNull();
    expect(r.reason).toBe('MERCADO_TRUNCADO');
  });

  it('a última perna visível nunca é usada, nem pra perder', () => {
    // "Mais de 3.5 - Total de cartões" com 2 cartões perderia — mas pode ter
    // sido "Total de cartões 1ºT" antes do corte.
    const cortada = 'Mais de 1.5 - Total de gols / Mais de 4.5 - Total de escanteios 1ºT / Mais de 3.5 - Total de cartões';
    const ctx = base([
      { scope: 'FIRST_HALF', metric: 'corners', home: 4, away: 3 },
      { scope: 'REGULATION', metric: 'cardPoints', home: 1, away: 1 },
    ]);
    expect(run(cortada, { home: 'Bahia', away: 'Remo' }, { home: 2, away: 1 }, ctx).resultId).toBeNull();
  });
});

// Textos reais do canal de tips, tirados das apostas pendentes de produção em
// 2026-09-15. Cada caso aqui foi uma aposta que não liquidava — ou que podia
// liquidar errado.

import { settleBet } from './settle';
import { parseMarket, LIMITE_DO_CANAL } from './market-conditions';
import { SettlementContext } from './settlement.types';
import { ResultIdEnum as R } from '../bet/dto/result-id.enum';

const jogador = (name: string, participantId: string, stats: Record<string, number>) =>
  Object.entries(stats).map(([metric, value]) => ({
    scope: 'REGULATION' as const, name, participantId, played: true, metric, value,
  }));

const teams = { home: 'Palmeiras', away: 'São Paulo' };
const context: SettlementContext = {
  sport: 'Football',
  scoreScope: 'REGULATION',
  teamStats: [
    { scope: 'REGULATION', metric: 'shotsOnTarget', home: 7, away: 3 },
    { scope: 'REGULATION', metric: 'shots', home: 32, away: 9 },
  ],
  playerStats: {
    complete: true,
    items: [
      ...jogador('José Manuel López', '1094179', { goals: 1, assists: 0, shots: 3, shotsOnTarget: 2 }),
      ...jogador('Vitor Roque', '1150391', { goals: 1, assists: 1, shots: 4, shotsOnTarget: 1 }),
      ...jogador('Alejo Véliz', '1116987', { goals: 0, assists: 1, shots: 1, shotsOnTarget: 0 }),
      ...jogador('Pedro Guilherme', '840219', { goals: 0, assists: 0, shots: 2, shotsOnTarget: 0 }),
      ...jogador('Pedro Milans', '985809', { goals: 0, assists: 1, shots: 0, shotsOnTarget: 0 }),
    ],
  },
};
const run = (market: string) => settleBet(market, teams, { home: 2, away: 0 }, 'finished', context);

describe('mercado cortado pelo canal', () => {
  // Aposta 12063: 100 caracteres exatos terminando limpo no fim de uma perna.
  // Não há como saber se existia uma quarta perna depois do corte.
  const cortada = 'Vasco da Gama - Resultado final / Mais de 7.5 - Total de escanteios / Mais de 3.5 - Total de cartões';

  it('o exemplo real tem mesmo o tamanho do limite', () => {
    expect([...cortada].length).toBe(LIMITE_DO_CANAL);
  });

  it('texto no limite nunca vira proposta, mesmo parecendo válido', () => {
    const r = parseMarket(cortada, { home: 'Vasco da Gama', away: 'Flamengo' });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('MERCADO_TRUNCADO');
  });

  it('o mesmo mercado um caractere mais curto continua sendo lido', () => {
    const curta = cortada.replace('Vasco da Gama', 'Vasco da Gam');
    expect([...curta].length).toBe(LIMITE_DO_CANAL - 1);
    // Não importa se liquida aqui — importa que a trava é o limite exato, e não
    // "qualquer texto comprido".
    expect(parseMarket(curta, { home: 'Vasco da Gam', away: 'Flamengo' }).ok === false
      && (parseMarket(curta, { home: 'Vasco da Gam', away: 'Flamengo' }) as { reason: string }).reason).not.toBe('MERCADO_TRUNCADO');
  });
});

describe('rótulos de jogador como o canal escreve', () => {
  it.each([
    ['Jose Manuel Lopez - Chutes a gol', R.WON],
    ['Jose Manuel Lopez 3+ - Chutes a gol', R.LOST],
    ['Vitor Roque - Marcar em qualquer momento', R.WON],
    ['Vitor Roque marca - Jogador para marcar', R.WON],
    ['Alejo Véliz - Marcar gol ou dar assistência', R.WON],
    ['Pedro Guilherme - Marcar em qualquer momento', R.LOST],
  ])('%s', (market, esperado) => {
    expect(run(market).resultId).toBe(esperado);
  });

  it('nome com acento no provider e sem acento na aposta', () => {
    expect(run('Jose Manuel Lopez - Chutes a gol').explanation).toContain('José Manuel López: 2 chutes a gol');
  });

  it('"Pedro" sozinho com dois Pedros em campo continua sem proposta', () => {
    const r = run('Pedro - Gol ou assistência');
    expect(r.resultId).toBeNull();
    expect(r.reason).toBe('DADO_INDISPONIVEL');
  });
});

describe('time não vira jogador', () => {
  it('"Chutes a gol" com time continua sendo mercado de time', () => {
    // Antes do rótulo sem "do jogador" isso já funcionava; o rótulo novo não
    // pode roubar o mercado de time.
    const r = run('Palmeiras mais de 6.5 - Chutes a gol');
    expect(r.resultId).toBe(R.WON);
    expect(r.explanation).toContain('Palmeiras: 7 chutes a gol');
  });

  it('a explicação diz de quem é o número', () => {
    // Aposta real "Cruzeiro mais de 10.5 - Chutes": o motor pegava o lado certo,
    // mas a tela mostrava só "shots: 9".
    const r = run('São Paulo mais de 10.5 - Chutes');
    expect(r.resultId).toBe(R.LOST);
    expect(r.explanation).toContain('São Paulo: 9 chutes');
  });

  it('total do jogo diz que é do jogo', () => {
    expect(run('Mais de 40.5 - Chutes').explanation).toContain('41 chutes no jogo');
  });
});

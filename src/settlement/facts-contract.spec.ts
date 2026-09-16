// Contrato entre o coletor (Python) e o motor (TypeScript).
//
// A fixture NAO foi escrita a mao: e' a saida literal de
// jobs/sofascore/settlement_adapter.py para um payload de jogo completo. Se
// alguem mexer no formato de um dos lados sem mexer no outro, estes testes
// quebram aqui — em vez de virar "sem proposta" silencioso em producao, que e'
// exatamente o sintoma que nao aparece em log nenhum.

import { readFileSync } from 'fs';
import { join } from 'path';
import { decodeFacts } from './event-facts';
import { settleBet } from './settle';
import { ResultIdEnum as R } from '../bet/dto/result-id.enum';
import { SettlementContext } from './settlement.types';

const raw = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__', 'sofascore-facts.json'), 'utf8'),
);

const teams = { home: 'Flamengo', away: 'Palmeiras' };
const score = { home: 2, away: 1 };
const context: SettlementContext = {
  sport: 'Football',
  scoreScope: 'REGULATION',
  cardCounting: 'RED_COUNTS_TWO', // igual ao SettlementService
  ...decodeFacts(raw),
};
const run = (market: string) => settleBet(market, teams, score, 'finished', context);

describe('facts do coletor sofascore', () => {
  it('atravessa a fronteira do JSONB com as tres capacidades', () => {
    expect(context.teamStats).toHaveLength(raw.teamStats.length);
    expect(context.incidents?.complete).toBe(true);
    expect(context.playerStats?.complete).toBe(true);
  });

  it.each([
    // Escanteios: 6x3 no jogo, 4x1 no primeiro tempo.
    ['Mais de 8.5 - Escanteios', R.WON],
    ['Menos de 8.5 - Escanteios', R.LOST],
    ['Flamengo mais de 5.5 - Escanteios', R.WON],
    ['Mais de 4.5 - 1º tempo - Escanteios', R.WON],
    // Chutes 14x8 e chutes a gol 5x2.
    ['Mais de 20.5 - Chutes', R.WON],
    ['Menos de 8.5 - Chutes a gol', R.WON],
    // Faltas 11x13.
    ['Mais de 23.5 - Faltas', R.WON],
  ])('estatistica de equipe: %s', (market, esperado) => {
    expect(run(market).resultId).toBe(esperado);
  });

  it.each([
    // Pedro: 2 gols, 0 assistencias, 5 chutes, 3 no gol. Arrascaeta: 2 assist.
    ['Pedro - Marcar a qualquer momento', R.WON],
    ['Pedro mais de 1.5 - Chutes a gol do jogador', R.WON],
    ['Pedro mais de 5.5 - Total de chutes do jogador', R.LOST],
    ['Arrascaeta - Jogador assistência', R.WON],
    ['Rony - Jogador assistência', R.LOST],
    ['Arrascaeta - Gol ou assistência', R.WON],
  ])('estatistica de jogador: %s', (market, esperado) => {
    expect(run(market).resultId).toBe(esperado);
  });

  it.each([
    // Gols em ordem: Flamengo 18', Palmeiras 33' (penalti), Flamengo 71'.
    ['Flamengo - Primeiro gol', R.WON],
    ['Palmeiras - Primeiro gol', R.LOST],
    ['Flamengo - Último gol', R.WON],
    ['Sim - Pênalti no jogo', R.WON],
    ['Sim - Cartão vermelho', R.WON],
  ])('incidentes: %s', (market, esperado) => {
    expect(run(market).resultId).toBe(esperado);
  });

  it('jogador que nao entrou nao vira aposta perdida', () => {
    // O reserva nao aparece na fixture: sem minuto em campo, o motor devolve
    // indefinido em vez de tratar a ausencia de gol como "nao marcou".
    const settlement = run('Reserva - Marcar a qualquer momento');
    expect(settlement.resultId).toBeNull();
    expect(settlement.reason).toBe('DADO_INDISPONIVEL');
  });

  it('cartoes pela regra da casa: vermelho vale 2', () => {
    // Do feed: Flamengo 2 amarelos = 2; Palmeiras 2 amarelos + 1 vermelho = 4.
    expect(run('Mais de 5.5 - Cartões').resultId).toBe(R.WON);
    expect(run('Menos de 6.5 - Cartões').resultId).toBe(R.WON);
    expect(run('Palmeiras - Maior número de cartões').resultId).toBe(R.WON);
    expect(run('Palmeiras mais de 3.5 - Total de cartões').resultId).toBe(R.WON);
    // Amarelos continuam vindo do statistics, sem o peso do vermelho.
    expect(run('Mais de 3.5 - Cartões amarelos').resultId).toBe(R.WON);
  });
});

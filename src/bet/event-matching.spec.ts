import { matchEvent, type CandidateEvent } from './event-matching';

// Só as travas contra casar a aposta com o jogo errado: data errada no
// dashboard e liquidação contra o placar de outro jogo.
const evento = (
  externalId: string,
  homeName: string,
  awayName: string,
  startAt: string,
  extra: Partial<CandidateEvent> = {},
): CandidateEvent => ({
  externalId,
  provider: 'sofascore',
  startAt: new Date(startAt),
  sport: 'Football',
  homeName,
  homeShort: null,
  homeCode: null,
  awayName,
  awayShort: null,
  awayCode: null,
  ...extra,
});

const CANDIDATOS: CandidateEvent[] = [
  evento('1', 'Manchester City', 'Arsenal', '2026-09-13T14:00:00Z', { homeShort: 'Man City', homeCode: 'MCI' }),
  evento('3', 'Botafogo-PB', 'Botafogo-SP', '2026-09-15T19:00:00Z'),
  evento('4', 'Botafogo', 'Fluminense', '2026-09-16T19:00:00Z'),
  evento('12', 'Atlanta Hawks', 'Boston Celtics', '2026-09-14T23:00:00Z', {
    sport: 'Basketball',
    awayShort: 'Celtics',
  }),
  evento('13', 'Atlanta United', 'Inter Miami', '2026-09-14T20:00:00Z'),
];

describe('matchEvent', () => {
  it('casa pelo nome e pelo apelido do provider', () => {
    expect(matchEvent('Man City vs Arsenal', '', CANDIDATOS)?.externalId).toBe('1');
  });

  it('o adversário separa homônimos', () => {
    expect(matchEvent('Botafogo x Fluminense', '', CANDIDATOS)?.externalId).toBe('4');
    expect(matchEvent('Botafogo-PB x Botafogo-SP', '', CANDIDATOS)?.externalId).toBe('3');
  });

  it('não casa com um lado só, nem com dois confrontos empatados', () => {
    expect(matchEvent('Manchester City x Fluminense', '', CANDIDATOS)).toBeNull();
    const homonimos = [
      evento('a', 'Santos', 'Botafogo-PB', '2026-09-16T22:00:00Z'),
      evento('b', 'Santos', 'Botafogo-SP', '2026-09-17T22:00:00Z'),
    ];
    expect(matchEvent('Santos x Botafogo', '', homonimos)).toBeNull();
  });

  it('não cruza esportes', () => {
    expect(matchEvent('Atlanta x Boston Celtics', '', CANDIDATOS, 'Futebol')).toBeNull();
  });
});

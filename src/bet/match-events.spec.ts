import { matchEvent, matchEvents, type CandidateEvent } from './event-matching';

const evento = (externalId: string, homeName: string, awayName: string, startAt: string): CandidateEvent => ({
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
});

const CANDIDATOS = [
  evento('10', 'CD Recoleta', 'Boca Juniors', '2026-08-19T22:00:00Z'),
  evento('11', 'São Paulo', 'Bolívar', '2026-08-19T00:30:00Z'),
];

describe('matchEvents', () => {
  it('um resultado por confronto, na ordem do texto', () => {
    const achados = matchEvents('CD Recoleta x Boca Juniors / São Paulo x Bolívar', 'Boca Juniors e São Paulo vencerem', CANDIDATOS, 'Futebol');
    expect(achados.map((a) => [a.position, a.confronto, a.match?.externalId])).toEqual([
      [0, 'CD Recoleta x Boca Juniors', '10'],
      [1, 'São Paulo x Bolívar', '11'],
    ]);
  });

  it('confronto que não casou vem sem jogo, e os outros continuam', () => {
    const achados = matchEvents('CD Recoleta x Boca Juniors / Time Nenhum x Outro Time', '', CANDIDATOS, 'Futebol');
    expect(achados.map((a) => a.match?.externalId ?? null)).toEqual(['10', null]);
  });

  it('matchEvent segue exigindo todos os confrontos', () => {
    expect(matchEvent('CD Recoleta x Boca Juniors / Time Nenhum x Outro Time', '', CANDIDATOS, 'Futebol')).toBeNull();
    // A data da múltipla é a do primeiro jogo, não a do primeiro no texto.
    expect(matchEvent('CD Recoleta x Boca Juniors / São Paulo x Bolívar', '', CANDIDATOS, 'Futebol')?.externalId).toBe('11');
  });
});

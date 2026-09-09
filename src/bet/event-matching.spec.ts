import {
  matchEvent,
  normalizeTeamName,
  extractConfrontos,
  type CandidateEvent,
} from './event-matching';

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

// Recorte real da coleta: os casos que quebram matching ingenuo.
const CANDIDATOS: CandidateEvent[] = [
  evento('1', 'Manchester City', 'Arsenal', '2026-09-13T14:00:00Z', {
    homeShort: 'Man City',
    homeCode: 'MCI',
    awayCode: 'ARS',
  }),
  evento('2', 'Grêmio', 'Red Bull Bragantino', '2026-09-14T19:00:00Z', {
    homeCode: 'GRE',
    awayShort: 'Bragantino',
    awayCode: 'RBB',
  }),
  evento('3', 'Botafogo-PB', 'Botafogo-SP', '2026-09-15T19:00:00Z'),
  evento('4', 'Botafogo', 'Fluminense', '2026-09-16T19:00:00Z', {
    homeCode: 'BOT',
    awayCode: 'FLU',
  }),
  evento('5', 'Nottingham Forest', 'Liverpool FC', '2026-09-17T19:00:00Z', {
    homeShort: 'Nottm Forest',
    awayShort: 'Liverpool',
  }),
  evento(
    '6',
    'Atlético Mineiro',
    'Atlético Goianiense',
    '2026-09-18T19:00:00Z',
    {
      homeShort: 'Atlético-MG',
      awayShort: 'Atlético-GO',
    },
  ),
  // Caso real de tip: a casa escreve "Operário Ferroviário", o provider grava
  // "Operário-PR". So o token exclusivo "operario" liga os dois.
  evento(
    '9',
    'Operário-PR',
    'Clube De Regatas Brasil',
    '2026-09-09T23:30:00Z',
    {
      homeShort: 'Operário-PR',
      homeCode: 'OPE',
      awayShort: 'CRB',
      awayCode: 'BRA',
    },
  ),
  evento('10', 'FC Barcelona', 'Feyenoord', '2026-09-09T16:45:00Z'),
  evento('11', 'VfB Stuttgart', 'Viking FK', '2026-09-09T18:45:00Z'),
  evento('7', 'Real Madrid', 'Osasuna', '2026-09-19T19:00:00Z'),
  evento('8', 'Barcelona', 'Getafe', '2026-09-12T19:00:00Z'),
];

describe('normalizeTeamName', () => {
  it.each([
    ['Grêmio', 'gremio'],
    ['São Paulo', 'sao paulo'],
    ['Liverpool FC', 'liverpool'],
    ['Al-Nassr', 'al nassr'],
    ['Atlético-MG', 'atletico mg'],
    ['Clube De Regatas Brasil', 'brasil'],
    ['Inter de Milão', 'inter'],
  ])('normaliza %s', (entrada, esperado) => {
    expect(normalizeTeamName(entrada)).toBe(esperado);
  });
});

describe('matchEvent', () => {
  it.each([
    ['Manchester City x Arsenal', '1'],
    ['Man City vs Arsenal', '1'],
    ['MCI x ARS', '1'],
    ['Gremio x Bragantino', '2'],
    ['Grêmio versus Red Bull Bragantino', '2'],
    ['Nottingham x Liverpool', '5'],
    ['Atletico-MG x Atletico-GO', '6'],
  ])('casa "%s" com o evento %s', (game, esperado) => {
    expect(matchEvent(game, 'Resultado Final', CANDIDATOS)?.externalId).toBe(
      esperado,
    );
  });

  // O adversario e' o que desempata homonimos.
  it('separa Botafogo do Rio dos homonimos pelo adversario', () => {
    expect(
      matchEvent('Botafogo x Fluminense', '', CANDIDATOS)?.externalId,
    ).toBe('4');
    expect(
      matchEvent('Botafogo-PB x Botafogo-SP', '', CANDIDATOS)?.externalId,
    ).toBe('3');
  });

  // Token que so pertence a um time no cache identifica sozinho; token
  // compartilhado nao ganha esse peso.
  it('casa por token exclusivo quando o nome longo nao bate', () => {
    const match = matchEvent(
      'Operário Ferroviário x CRB',
      'CRB ou Empate - Dupla hipótese',
      CANDIDATOS,
    );
    expect(match?.externalId).toBe('9');
    expect(match?.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('nao usa token compartilhado como identificador', () => {
    // "botafogo" pertence a tres times do cache, entao nao resolve sozinho —
    // e o adversario inventado impede o match.
    expect(
      matchEvent('Botafogo Carioca x Time Inventado', '', CANDIDATOS),
    ).toBeNull();
  });

  it('devolve null quando nao ha evento correspondente', () => {
    expect(
      matchEvent('Time Inventado x Outro Time', '', CANDIDATOS),
    ).toBeNull();
  });

  it('devolve null sem candidatos, sem game e sem confronto reconhecivel', () => {
    expect(matchEvent('Manchester City x Arsenal', '', [])).toBeNull();
    expect(matchEvent('', '', CANDIDATOS)).toBeNull();
    expect(matchEvent('Vencedor da Copa', 'Campeão', CANDIDATOS)).toBeNull();
  });

  it('nao casa quando so um dos lados bate', () => {
    expect(
      matchEvent('Manchester City x Fluminense', '', CANDIDATOS),
    ).toBeNull();
  });

  describe('multipla', () => {
    const game = 'Múltipla (2 jogos)';
    const market =
      'Real Madrid vs Osasuna - vitória / Barcelona vs Getafe - vitória';

    it('extrai os confrontos do mercado', () => {
      expect(extractConfrontos(game, market)).toEqual([
        'Real Madrid vs Osasuna',
        'Barcelona vs Getafe',
      ]);
    });

    it('usa a data do jogo mais cedo', () => {
      const match = matchEvent(game, market, CANDIDATOS);
      // Barcelona x Getafe (12/09) comeca antes de Real Madrid x Osasuna (19/09).
      expect(match?.externalId).toBe('8');
      expect(match?.startAt.toISOString()).toBe('2026-09-12T19:00:00.000Z');
    });

    // Segundo formato de multipla: a IA devolveu o mercado sem prefixar cada
    // confronto, entao foldMultiEventGame anexa a selecao depois de " · ".
    it('extrai confrontos quando a selecao vem anexada com " · "', () => {
      const mercado =
        'Barcelona x Feyenoord / Stuttgart x Viking · Barcelona e Stuttgart vencem - Resultado final';
      expect(extractConfrontos('Múltipla (2 jogos)', mercado)).toEqual([
        'Barcelona x Feyenoord',
        'Stuttgart x Viking',
      ]);
      const match = matchEvent('Múltipla (2 jogos)', mercado, CANDIDATOS);
      expect(match?.externalId).toBe('10');
      expect(match?.startAt.toISOString()).toBe('2026-09-09T16:45:00.000Z');
    });

    it('nao casa a multipla inteira se um confronto falhar', () => {
      const parcial =
        'Real Madrid vs Osasuna - vitória / Time Inventado vs Outro - vitória';
      expect(matchEvent(game, parcial, CANDIDATOS)).toBeNull();
    });
  });

  it('reporta confianca entre 0 e 1', () => {
    const match = matchEvent('Man City x Arsenal', '', CANDIDATOS);
    expect(match!.confidence).toBeGreaterThanOrEqual(0.8);
    expect(match!.confidence).toBeLessThanOrEqual(1);
  });
});

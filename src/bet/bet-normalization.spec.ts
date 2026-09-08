import {
  cleanBetText,
  normalizeBetNumber,
  normalizeBetData,
  detectPotentialDuplicate,
} from './bet-normalization';

describe('bet normalization', () => {
  it.each([
    ['Turbinada - Botafogo vs Palmeiras', 'Botafogo vs Palmeiras'],
    ['Mais de 2.5 gols - Criar aposta', 'Mais de 2.5 gols'],
    ['Super Odds\nReal Madrid x Barcelona\nBilhete', 'Real Madrid x Barcelona'],
    ['Super Odds: Botafogo x Palmeiras', 'Botafogo x Palmeiras'],
    ['Mais de 2.5 gols: Criar aposta', 'Mais de 2.5 gols'],
    ['Real Madrid x Barcelona 20:00', 'Real Madrid x Barcelona 20:00'],
    ['Adicionar seleção', null],
    ['Apostar FC x Bilhete United', 'Apostar FC x Bilhete United'],
    [
      'Jogador - mais de 0.5 chutes / ambas marcam',
      'Jogador - mais de 0.5 chutes / ambas marcam',
    ],
    [
      'Não confirmar aposta antes do jogo',
      'Não confirmar aposta antes do jogo',
    ],
  ])('cleans only isolated UI fragments: %s', (input, expected) => {
    expect(cleanBetText(input)).toBe(expected);
    expect(cleanBetText(cleanBetText(input))).toBe(expected);
  });
  it.each([
    ['R$ 27,50', 27.5],
    ['R$ 1.234,56', 1234.56],
    ['R$ 1.500', 1500],
    ['R$ 1.000', 1000],
    ['1.234.567', 1234567],
    ['1.500', 1.5],
    ['2,69', 2.69],
    ['2.10', 2.1],
    ['27,50', 27.5],
    ['R$ 27,00', 27],
    [50, 50],
    ['', null],
    ['R$', null],
    ['abc123', null],
    ['1,2,3', null],
    [true, null],
    [null, null],
    [Infinity, null],
  ])('parses %s without inventing zero', (input, expected) => {
    expect(normalizeBetNumber(input)).toBe(expected);
  });
  it.each([
    [
      'mais de 1.5 gols / mais de 7.5 escanteios na partida',
      'Mais de 1.5 gols / Mais de 7.5 escanteios na partida',
    ],
    ['ambas marcam', 'Ambas marcam'],
    ['Mais de 2.5 gols', 'Mais de 2.5 gols'],
    // Só a inicial sobe: linha numérica, sigla e nome próprio ficam intactos.
    ['1x2 - casa / over 2.5', '1x2 - casa / Over 2.5'],
    [
      'Joaquin Piquerez - jogador a ser advertido',
      'Joaquin Piquerez - jogador a ser advertido',
    ],
    ['ámbas marcam', 'Ámbas marcam'],
  ])('capitalizes each market selection: %s', (input, expected) => {
    expect(normalizeBetData({ market: input }).market).toBe(expected);
  });
  it('leaves an absent market null', () => {
    expect(normalizeBetData({}).market).toBeNull();
  });
  it('does not capitalize the event', () => {
    expect(normalizeBetData({ game: 'flamengo x palmeiras' }).game).toBe(
      'flamengo x palmeiras',
    );
  });
  it('does not infer sport in the backend', () => {
    expect(normalizeBetData({ game: 'Flamengo x Palmeiras' }).sport).toBeNull();
  });
  it('turns a multi-event game into a labelled multipla', () => {
    const bet = normalizeBetData({
      game: 'Real Madrid vs Osasuna / Barcelona vs Getafe',
      market:
        'Real Madrid vs Osasuna - vitória / Barcelona vs Getafe - vitória',
    });
    expect(bet.game).toBe('Múltipla (2 jogos)');
    expect(bet.market).toBe(
      'Real Madrid vs Osasuna - vitória / Barcelona vs Getafe - vitória',
    );
  });
  it('keeps the confrontos when the model left them out of the market', () => {
    const bet = normalizeBetData({
      game: 'Real Madrid x Osasuna / Barcelona x Getafe',
      market: 'vitória / vitória',
    });
    expect(bet.game).toBe('Múltipla (2 jogos)');
    expect(bet.market).toBe(
      'Real Madrid x Osasuna / Barcelona x Getafe · Vitória / Vitória',
    );
  });
  it('keeps a single-event multipla showing the confronto', () => {
    const bet = normalizeBetData({
      game: 'Vitória vs Grêmio',
      market: 'mais de 1.5 gols / mais de 7.5 escanteios',
    });
    expect(bet.game).toBe('Vitória vs Grêmio');
    expect(bet.market).toBe('Mais de 1.5 gols / Mais de 7.5 escanteios');
  });
  it('falls back to the confrontos when there is no market', () => {
    expect(
      normalizeBetData({ game: 'Real Madrid vs Osasuna / Barcelona vs Getafe' })
        .market,
    ).toBe('Real Madrid vs Osasuna / Barcelona vs Getafe');
  });
});

describe('potential duplicates', () => {
  const now = new Date('2026-09-07T12:00:00Z');
  const bet = {
    userId: 1,
    houseId: 7,
    game: 'Real Madrid vs Barcelona',
    market: 'Mais de 2,5 gols',
    odd: '2,10',
    stake: 'R$ 50,00',
  };
  const existing = {
    ...bet,
    id: 42,
    game: ' Real Madrid x Barcelona ',
    market: 'Mais de 2.5 gols',
    odd: 2.1,
    stake: 50,
    createdAt: new Date(now.getTime() - 60_000),
  };
  it('compares normalized values and confrontation separators', () => {
    expect(detectPotentialDuplicate(bet, [existing], now)).toEqual({
      isPotentialDuplicate: true,
      existingBetId: 42,
      existingCreatedAt: existing.createdAt,
      reason: 'same_event_market_odd_stake_recent',
    });
  });
  it.each([
    { market: 'Menos de 2.5 gols' },
    { stake: 51 },
    { odd: 2.11 },
    { userId: 2 },
    { houseId: 8 },
    { houseId: null },
    { createdAt: new Date(now.getTime() - 301_000) },
    { createdAt: new Date(now.getTime() + 1) },
  ])('does not flag different or distant bets: %j', (patch) => {
    expect(
      detectPotentialDuplicate(bet, [{ ...existing, ...patch }], now),
    ).toEqual({ isPotentialDuplicate: false });
  });
});

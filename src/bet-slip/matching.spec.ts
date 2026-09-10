import {
  findBetMatches,
  scoreBetMatch,
  MATCH_HIGH,
  MATCH_MEDIUM,
  type PendingCandidate,
} from './matching.util';
import { buildBetPreview } from '../telegram/utils/bet-preview.util';

const AT = new Date('2026-09-07T18:00:00Z');

const bet = {
  game: 'Bahia vs Palmeiras',
  market: 'Mais de 2.5 gols',
  house: 'Superbet',
  odd: 2.1,
  stake: 50,
  at: AT,
};

function candidate(over: Partial<PendingCandidate> = {}): PendingCandidate {
  return {
    tipId: 1,
    game: 'Bahia x Palmeiras',
    market: 'Mais de 2.5 gols',
    house: 'Superbet Brasil',
    odd: 2.1,
      stake: 50,
    at: new Date(AT.getTime() - 30 * 60 * 1000),
    ...over,
  };
}

describe('scoreBetMatch', () => {
  it('trata "x" e "vs" como o mesmo confronto', () => {
    expect(scoreBetMatch(bet, candidate())).toBeGreaterThanOrEqual(MATCH_HIGH);
  });

  it('ignora acento e caixa no evento', () => {
    const score = scoreBetMatch(
      { ...bet, game: 'SÃO PAULO x Grêmio' },
      candidate({ game: 'Sao Paulo vs Gremio' }),
    );
    expect(score).toBeGreaterThanOrEqual(MATCH_HIGH);
  });

  it('ainda pergunta quando só a stake diverge (a da tip é estimada pela %)', () => {
    const score = scoreBetMatch(bet, candidate({ stake: 31.4 }));
    expect(score).toBeGreaterThanOrEqual(MATCH_HIGH);
  });

  it('descarta candidato de outra casa', () => {
    expect(scoreBetMatch(bet, candidate({ house: 'Betano' }))).toBeNull();
  });

  it('descarta candidato de mais de 24h', () => {
    const old = candidate({ at: new Date(AT.getTime() - 30 * 60 * 60 * 1000) });
    expect(scoreBetMatch(bet, old)).toBeNull();
  });

  it('não passa do limiar quando só odd e stake batem', () => {
    const outro = candidate({
      game: 'Flamengo x Vasco',
      market: 'Ambas marcam',
    });
    expect(scoreBetMatch(bet, outro)).toBeLessThan(MATCH_MEDIUM);
  });

  it('não pontua odd fora da tolerância', () => {
    const score = scoreBetMatch(bet, candidate({ odd: 3.4 }))!;
    expect(score).toBeLessThan(scoreBetMatch(bet, candidate())!);
  });
});

describe('findBetMatches', () => {
  it('devolve só os acima do limiar, do melhor pro pior', () => {
    const matches = findBetMatches(bet, [
      candidate({ tipId: 1, game: 'Flamengo x Vasco', market: 'Ambas marcam' }),
      candidate({ tipId: 2, odd: 2.15 }),
      candidate({ tipId: 3 }),
    ]);
    expect(matches.map((m) => m.candidate.tipId)).toEqual([3, 2]);
  });
});

describe('buildBetPreview com candidatos', () => {
  const extracted = {
    evento: 'Bahia vs Palmeiras',
    esporte: 'Futebol',
    mercado: 'Mais de 2.5 gols',
    odd: 2.1,
    oddOriginal: null,
    stake: 50,
  };

  it('sem candidato mantém o botão único de sempre', () => {
    const preview = buildBetPreview(extracted, 'Superbet', 1_757_000_000);
    expect(preview.reply_markup.inline_keyboard).toEqual([
      [{ text: '📊 Planilhar', callback_data: 'planilhar_ts:1757000000:1' }],
    ]);
    expect(preview.text).not.toContain('mesma aposta');
  });

  it('com candidato pergunta e oferece vincular ou planilhar como nova', () => {
    const preview = buildBetPreview(extracted, 'Superbet', 1_757_000_000, {
      matches: [{ tipId: 42, score: 0.9, label: 'Bahia x Palmeiras' }],
    });
    expect(preview.text).toContain('É a mesma aposta?');
    expect(preview.reply_markup.inline_keyboard[0][0].callback_data).toBe(
      'planilhar_ts:1757000000:1:42',
    );
    expect(preview.reply_markup.inline_keyboard[1][0].callback_data).toBe(
      'planilhar_ts:1757000000:1',
    );
  });
});

import { parseBetLocal } from './tip-extractors.util';

describe('parseBetLocal', () => {
  it('formato com emoji', () => {
    expect(
      parseBetLocal(
        '🏠 Bet7k\n🆚 Flamengo x Vasco\n⚽️ Futebol\n📌 Over 2.5\n🏷 1.85\n🛑 5%',
      ),
    ).toEqual({
      game: 'Flamengo x Vasco',
      sport: 'Futebol',
      market: 'Over 2.5',
      odd: 1.85,
    });
  });

  it('formato SOBRECARGA', () => {
    expect(
      parseBetLocal(
        'SOBRECARGA\n\nSuperbet\nFlamengo x Vasco\nFutebol\nOver 2.5\n1.85\nLimite da aposta: R$20\n0,75%\nR$ 15\nNão',
      ),
    ).toEqual({
      game: 'Flamengo x Vasco',
      sport: 'Futebol',
      market: 'Over 2.5',
      odd: 1.85,
    });
  });

  it('texto fora do padrão devolve null (cai pro Groq)', () => {
    expect(parseBetLocal('aposta no flamengo odd 1.85')).toBeNull();
  });
});

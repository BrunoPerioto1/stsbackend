import {
  extractCalcLinkFromEntities,
  parseBetLocal,
} from './tip-extractors.util';

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

describe('extractCalcLinkFromEntities', () => {
  // Formato real do canal: a URL do calculador não aparece no texto, só no
  // text_link; o link da casa vem antes e em texto puro.
  const text =
    '🏠 Esportiva Bet\n🆚 Atlético de Bilbao x Elche CF\n🏷 3.25\n\nhttps://esportiva.bet.br/sports?shareCode=YXRD30J35V9\n\nOdd justa: 3.154\n\n📊 Odd mudou? Clique AQUI e calcule quanto vale.';
  const calcUrl = 'https://calc.peixeesperto.com.br/?justa=3.154';

  it('pega o link do calculador, não o da casa', () => {
    const offset = text.indexOf('Clique AQUI');
    expect(
      extractCalcLinkFromEntities(text, [
        { type: 'url', offset: 0, length: 10 },
        {
          type: 'text_link',
          offset,
          length: 'Clique AQUI'.length,
          url: calcUrl,
        },
      ]),
    ).toBe(calcUrl);
  });

  it('cai pro rótulo do link quando o domínio não é o conhecido', () => {
    const offset = text.indexOf('calcule quanto vale');
    expect(
      extractCalcLinkFromEntities(text, [
        {
          type: 'text_link',
          offset: text.indexOf('Clique AQUI'),
          length: 'Clique AQUI'.length,
          url: 'https://t.me/canal',
        },
        {
          type: 'text_link',
          offset,
          length: 'calcule quanto vale'.length,
          url: 'https://outro-calc.com/?justa=3.154',
        },
      ]),
    ).toBe('https://outro-calc.com/?justa=3.154');
  });

  it('sem entities devolve null em vez do link da casa', () => {
    expect(extractCalcLinkFromEntities(text, null)).toBeNull();
  });
});

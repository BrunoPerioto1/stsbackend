import {
  buildSourceCard,
  parseTemplate,
  readTemplate,
  type TipTemplate,
} from './tip-template';
import {
  extractHouseFromText,
  extractLimitFromText,
  extractOddFromText,
  extractPercent,
  isAvisoMessage,
  parseBetLocal,
} from '../telegram/utils/tip-extractors.util';

const LABELED = [
  '🔥 TIP DO DIA 🔥',
  '',
  'Jogo: Flamengo x Palmeiras',
  'Mercado: Over 2.5 gols',
  'Odd: 1,85 na Bet365',
  'Stake 2% (máx R$ 1.500)',
].join('\n');

const LABELED_TEMPLATE: TipTemplate = {
  marker: 'TIP DO DIA',
  fields: {
    house: { after: 'na' , line: 4 },
    game: { after: 'Jogo' },
    sport: { fixed: 'Futebol' },
    market: { after: 'Mercado:' },
    odd: { after: 'Odd:' },
    percent: { after: 'Stake' },
    limit: { after: 'máx' },
  },
};

describe('readTemplate', () => {
  it('lê os campos por rótulo, fixo e linha+rótulo', () => {
    const { values, markerFound } = readTemplate(LABELED, LABELED_TEMPLATE);
    expect(markerFound).toBe(true);
    expect(values).toEqual({
      house: 'Bet365',
      game: 'Flamengo x Palmeiras',
      sport: 'Futebol',
      market: 'Over 2.5 gols',
      odd: 1.85,
      percent: 2,
      // "máx R$ 1.500" é dinheiro: mil e quinhentos, não 1,5.
      limit: 1500,
    });
  });

  it('o trecho marcado aponta só pro número', () => {
    const { fields } = readTemplate(LABELED, LABELED_TEMPLATE);
    const odd = fields.find((f) => f.field === 'odd')!;
    expect(LABELED.slice(...odd.span!)).toBe('1,85');
  });

  it('sem o identificador a mensagem não é desta fonte', () => {
    const outra = LABELED.replace('TIP DO DIA', 'BOM DIA');
    const reading = readTemplate(outra, LABELED_TEMPLATE);
    expect(reading.markerFound).toBe(false);
    expect(reading.values).toBeNull();
  });

  it('formato posicional, sem rótulo: linha N', () => {
    const text = 'ALERTA\n\nBetano\nReal x Barça\nFutebol\nAmbas marcam\n2.10\n1,5%';
    const reading = readTemplate(text, {
      fields: {
        house: { line: 2 },
        game: { line: 3 },
        sport: { line: 4 },
        market: { line: 5 },
        odd: { line: 6 },
        percent: { line: 7 },
      },
    });
    expect(reading.values).toMatchObject({ house: 'Betano', game: 'Real x Barça', odd: 2.1, percent: 1.5, limit: null });
  });

  it('`until` corta o valor no meio da linha; sem ele na linha vale a linha toda', () => {
    const template: TipTemplate = {
      fields: {
        house: { fixed: 'Bet365' },
        game: { line: 1, until: ' - ' },
        sport: { fixed: 'Futebol' },
        market: { line: 1, after: ' - ' },
        odd: { after: '@' },
        percent: { after: 'Stake' },
      },
    };
    const reading = readTemplate('Saint-Étienne x Lyon - Handicap -1.5\n@2.00\nStake 1%', template);
    // O traço grudado no número é sinal, não separador.
    expect(reading.values).toMatchObject({ game: 'Saint-Étienne x Lyon', market: 'Handicap -1.5' });

    const semSeparador = readTemplate('Saint-Étienne x Lyon\n@2.00\nStake 1%', {
      ...template,
      fields: { ...template.fields, market: { fixed: 'Vencedor' } },
    });
    expect(semSeparador.values?.game).toBe('Saint-Étienne x Lyon');
  });

  it('campo obrigatório que não aparece derruba a leitura; limite ausente não', () => {
    const semOdd = readTemplate(LABELED.replace('Odd: 1,85 na Bet365', 'Bet365'), {
      ...LABELED_TEMPLATE,
      fields: { ...LABELED_TEMPLATE.fields, house: { fixed: 'Bet365' } },
    });
    expect(semOdd.values).toBeNull();
    expect(semOdd.fields.find((f) => f.field === 'odd')!.error).toBe('Não achou na mensagem');

    const semLimite = readTemplate(LABELED.replace(' (máx R$ 1.500)', ''), LABELED_TEMPLATE);
    expect(semLimite.values?.limit).toBeNull();
  });

  it('odd que não é odd não passa', () => {
    const reading = readTemplate(LABELED.replace('1,85', '0,90'), LABELED_TEMPLATE);
    expect(reading.values).toBeNull();
    expect(reading.fields.find((f) => f.field === 'odd')!.error).toMatch(/maior que 1/);
  });
});

describe('buildSourceCard', () => {
  const values = readTemplate(LABELED, LABELED_TEMPLATE).values!;
  const card = buildSourceCard('Tipster X', values);

  // É o que garante que fan-out, Planilhar, Editar e /pendentes funcionam sem
  // mudança: eles só leem o card pelos extractors de sempre.
  it('os extractors de sempre leem o card', () => {
    expect(parseBetLocal(card)).toEqual({
      game: 'Flamengo x Palmeiras',
      sport: 'Futebol',
      market: 'Over 2.5 gols',
      odd: 1.85,
    });
    expect(extractHouseFromText(card)).toBe('Bet365');
    expect(extractOddFromText(card)).toBe(1.85);
    expect(extractPercent(card)).toBe(2);
    expect(extractLimitFromText(card)).toBe(1500);
    expect(isAvisoMessage(card)).toBe(false);
  });

  it('o ✏️ Editar acha odd e limite no card', () => {
    expect(card).toMatch(/🏷\s*([\d]+(?:[.,][\d]+)?)/);
    expect(card).toMatch(/(🚦[^\n]*R\$\s*)([\d.,]+)/);
    expect(card).toMatch(/^🏠\s*.*$/m);
  });

  it('% decimal sai em pt-BR e volta igual', () => {
    expect(extractPercent(buildSourceCard('X', { ...values, percent: 0.75 }))).toBe(0.75);
  });

  it('nome da fonte com "max" não puxa o número da linha seguinte como limite', () => {
    const semLimite = buildSourceCard('Max Tips', { ...values, house: 'Bet365', limit: null });
    expect(extractLimitFromText(`${semLimite}\n\n🎯 Recomendação de aposta: R$ 40,00`)).toBeNull();
  });

  it('% no meio do mercado não confunde a % da tip', () => {
    const c = buildSourceCard('X', { ...values, market: 'Over 50% dos escanteios' });
    expect(extractPercent(c)).toBe(2);
  });
});

describe('parseTemplate', () => {
  it('aceita o modelo e descarta regra vazia', () => {
    const t = parseTemplate({
      marker: '  TIP DO DIA ',
      fields: { ...LABELED_TEMPLATE.fields, limit: { after: '' } },
    });
    expect(t.marker).toBe('TIP DO DIA');
    expect(t.fields.limit).toBeUndefined();
  });

  it('recusa modelo sem campo obrigatório, dizendo qual', () => {
    expect(() =>
      parseTemplate({ fields: { ...LABELED_TEMPLATE.fields, odd: undefined, house: null } }),
    ).toThrow('Faltam regras para: Casa, Odd');
  });

  it('recusa linha fora do intervalo e texto que não é texto', () => {
    expect(() => parseTemplate({ fields: { ...LABELED_TEMPLATE.fields, game: { line: 0 } } })).toThrow(/game.line/);
    expect(() => parseTemplate({ fields: { ...LABELED_TEMPLATE.fields, game: { after: 3 } } })).toThrow(/game.after/);
  });
});

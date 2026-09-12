import { ResultIdEnum } from '../bet/dto/result-id.enum';
import { parseMarket } from './market-conditions';
import { settleBet } from './settle';

const TIMES = { home: 'Flamengo', away: 'Palmeiras' };
const placar = (home: number, away: number) => ({ home, away });

function liquida(market: string, home: number, away: number, times = TIMES) {
  return settleBet(market, times, placar(home, away), 'finished');
}

describe('total de gols', () => {
  it('ganha acima da linha', () => {
    expect(liquida('Mais de 2.5 - Total de gols', 2, 1).resultId).toBe(
      ResultIdEnum.WON,
    );
  });

  it('perde abaixo da linha', () => {
    expect(liquida('Mais de 2.5 - Total de gols', 1, 1).resultId).toBe(
      ResultIdEnum.LOST,
    );
  });

  it('menos de: ganha abaixo da linha', () => {
    expect(liquida('Menos de 2.5 gols', 1, 1).resultId).toBe(ResultIdEnum.WON);
  });

  it('aceita a abreviacao da casa (o2.5 / u1.5)', () => {
    expect(liquida('o2.5 gols', 2, 1).resultId).toBe(ResultIdEnum.WON);
    expect(liquida('u1.5 gols', 0, 1).resultId).toBe(ResultIdEnum.WON);
  });

  it('linha inteira empatada devolve a aposta', () => {
    const r = liquida('Mais de 2 - Total de gols', 1, 1);
    expect(r.resultId).toBe(ResultIdEnum.CANCELED);
    expect(r.explanation).toContain('exatamente a linha');
  });
});

describe('gols de um time', () => {
  // O placar traz os dois lados separados, entao "Flamengo mais de 1.5" e'
  // resolvivel: basta saber de que lado o time esta'.
  it('conta so os gols do mandante citado', () => {
    expect(liquida('Flamengo mais de 1.5 - Total de gols', 3, 0).resultId).toBe(
      ResultIdEnum.WON,
    );
    expect(liquida('Flamengo mais de 1.5 - Total de gols', 1, 4).resultId).toBe(
      ResultIdEnum.LOST,
    );
  });

  it('conta so os gols do visitante citado', () => {
    // 0x2: o jogo teve 2 gols, mas quem interessa e' o Palmeiras.
    expect(
      liquida('Palmeiras mais de 1.5 - Total de gols', 0, 2).resultId,
    ).toBe(ResultIdEnum.WON);
  });

  it('explica de quem sao os gols', () => {
    expect(liquida('Flamengo mais de 1.5 gols', 3, 0).explanation).toContain(
      'Flamengo fez 3',
    );
  });

  it('linha inteira na marca do time devolve a aposta', () => {
    expect(liquida('Flamengo mais de 2 gols', 2, 0).resultId).toBe(
      ResultIdEnum.CANCELED,
    );
  });

  it('time fora da selecao e o confronto carimbado, nao a linha', () => {
    // "Mais de 2.5 gols - Flamengo x Palmeiras": a casa colou o jogo no rotulo.
    // Ler isso como gols do Flamengo inverteria o resultado, entao recusa.
    const r = liquida('Mais de 2.5 gols - Flamengo x Palmeiras', 2, 1);
    expect(r.resultId).toBeNull();
    expect(r.reason).toBe('GOLS_DE_UM_TIME');
  });

  it('os dois times na selecao nao dizem de quem e a linha', () => {
    const r = liquida('Flamengo x Palmeiras mais de 2.5 gols', 2, 1);
    expect(r.resultId).toBeNull();
    expect(r.reason).toBe('GOLS_DE_UM_TIME');
  });
});

describe('duas condicoes no mesmo trecho', () => {
  // A cascata de parsers devolve no primeiro que reconhece. Sem esta trava, a
  // segunda perna sumia e a aposta era liquidada pela metade.
  it('NAO da ganhou quando a perna escondida perdeu', () => {
    // 1x1: ambas marcaram (ganha), mas o total foi 2 e "mais de 2.5" perdeu.
    const r = liquida('Ambas marcam e mais de 2.5', 1, 1);
    expect(r.resultId).toBeNull();
    expect(r.reason).toBe('COMBINADA_NAO_SEPARADA');
  });

  it('vale pra placar exato colado numa linha', () => {
    const r = liquida('Resultado correto 1-1 e mais de 2.5', 1, 1);
    expect(r.resultId).toBeNull();
    expect(r.reason).toBe('COMBINADA_NAO_SEPARADA');
  });

  it('vale pra resultado colado numa linha de gols', () => {
    const r = liquida(
      'Flamengo e mais de 3.5 - Resultado final e total de gols',
      4,
      0,
    );
    expect(r.resultId).toBeNull();
    expect(r.reason).toBe('COMBINADA_NAO_SEPARADA');
  });

  it('mercado de uma condicao so continua passando', () => {
    expect(liquida('Ambas marcam', 1, 1).resultId).toBe(ResultIdEnum.WON);
    expect(liquida('Mais de 2.5 - Total de gols', 2, 1).resultId).toBe(
      ResultIdEnum.WON,
    );
    expect(liquida('Flamengo - Resultado final', 2, 1).resultId).toBe(
      ResultIdEnum.WON,
    );
  });
});

describe('vitoria como rotulo de resultado', () => {
  const TIMES_DE = { home: 'VfB Stuttgart', away: 'Bayern' };

  it('reconhece "vitoria" do jeito que a casa escreve', () => {
    expect(liquida('VfB Stuttgart - vitória', 2, 1, TIMES_DE).resultId).toBe(
      ResultIdEnum.WON,
    );
    expect(liquida('VfB Stuttgart - vitória', 0, 3, TIMES_DE).resultId).toBe(
      ResultIdEnum.LOST,
    );
  });

  it('margem de vitoria nao e vitoria', () => {
    // 1x0 e' vitoria, mas nao por 2 de diferenca: ler como resultado simples
    // daria ganhou numa aposta perdida.
    const r = liquida('Flamengo vitória por 2 gols de diferença', 1, 0);
    expect(r.resultId).toBeNull();
  });
});

describe('total de gols (continuacao)', () => {
  it('recusa linha asiatica', () => {
    expect(liquida('Mais de 2.25 gols', 3, 0).resultId).toBeNull();
  });

  it('recusa linha implausivel para um jogo', () => {
    expect(liquida('Mais de 17.5 gols', 3, 0).resultId).toBeNull();
  });
});

describe('ambas marcam', () => {
  it('sim ganha com os dois marcando', () => {
    expect(liquida('Sim - Ambas marcam', 2, 1).resultId).toBe(ResultIdEnum.WON);
  });

  it('sim perde com um time zerado', () => {
    expect(liquida('Sim - Ambas marcam', 3, 0).resultId).toBe(
      ResultIdEnum.LOST,
    );
  });

  it('nao ganha no 0x0', () => {
    expect(liquida('Não - Ambas marcam', 0, 0).resultId).toBe(ResultIdEnum.WON);
  });

  it('nao perde com os dois marcando', () => {
    expect(liquida('Não - Ambos os times marcam', 1, 1).resultId).toBe(
      ResultIdEnum.LOST,
    );
  });
});

describe('resultado final', () => {
  it('mandante citado e mandante vence', () => {
    expect(liquida('Flamengo - Resultado final', 2, 1).resultId).toBe(
      ResultIdEnum.WON,
    );
  });

  it('mandante citado perde no empate', () => {
    expect(liquida('Flamengo - Resultado final', 1, 1).resultId).toBe(
      ResultIdEnum.LOST,
    );
  });

  it('visitante citado e visitante vence', () => {
    expect(liquida('Palmeiras - Resultado final', 0, 2).resultId).toBe(
      ResultIdEnum.WON,
    );
  });

  it('empate ganha no empate', () => {
    expect(liquida('Empate - Resultado final', 1, 1).resultId).toBe(
      ResultIdEnum.WON,
    );
  });

  it('o verbo decide quando os dois times aparecem', () => {
    const times = { home: 'VfL Wolfsburg', away: 'Energie Cottbus' };
    const r = settleBet(
      'Cottbus vence o Wolfsburg - Resultado final',
      times,
      placar(0, 1),
      'finished',
    );
    expect(r.resultId).toBe(ResultIdEnum.WON);
  });

  it('desempata times que dividem token pelo nome completo', () => {
    const times = { home: 'Real Madrid', away: 'Atlético Madrid' };
    const r = settleBet(
      'Atlético Madrid - Resultado final',
      times,
      placar(0, 2),
      'finished',
    );
    expect(r.resultId).toBe(ResultIdEnum.WON);
  });

  it('casa apelido do time', () => {
    const times = { home: 'Manchester City', away: 'Chelsea' };
    expect(
      settleBet('Man City - Resultado final', times, placar(3, 0), 'finished')
        .resultId,
    ).toBe(ResultIdEnum.WON);
  });

  it('time citado sem rotulo de mercado nao vira palpite', () => {
    expect(liquida('Flamengo', 2, 1).resultId).toBeNull();
  });
});

describe('resultado correto', () => {
  it('placar exato ganha', () => {
    expect(liquida('2-1 - Resultado correto', 2, 1).resultId).toBe(
      ResultIdEnum.WON,
    );
  });

  it('placar invertido perde', () => {
    expect(liquida('2-1 - Resultado correto', 1, 2).resultId).toBe(
      ResultIdEnum.LOST,
    );
  });

  it('varios placares no texto e alternativa', () => {
    const r = liquida('1-0 / 2-0 - Resultado correto', 1, 0);
    expect(r.resultId).toBeNull();
  });
});

// O que o usuario pediu pra incluir alem das simples.
describe('combinada do mesmo jogo', () => {
  it('ganha quando todas as pernas ganham', () => {
    const r = liquida(
      'Flamengo - Resultado final / Mais de 2.5 - Total de gols',
      3,
      1,
    );
    expect(r.resultId).toBe(ResultIdEnum.WON);
  });

  it('PERDE quando so uma perna ganha', () => {
    // O caso que motivou a regra: o time venceu, mas o jogo teve 2 gols.
    const r = liquida(
      'Flamengo - Resultado final / Mais de 2.5 - Total de gols',
      2,
      0,
    );
    expect(r.resultId).toBe(ResultIdEnum.LOST);
    expect(r.explanation).toContain('2 gols no jogo');
  });

  it('perde quando a perna do resultado falha', () => {
    const r = liquida(
      'Flamengo - Resultado final / Mais de 2.5 - Total de gols',
      1,
      3,
    );
    expect(r.resultId).toBe(ResultIdEnum.LOST);
  });

  it('junta tres pernas', () => {
    const r = liquida(
      'Flamengo - Resultado final / Mais de 1.5 - Total de gols / Sim - Ambas marcam',
      2,
      1,
    );
    expect(r.resultId).toBe(ResultIdEnum.WON);
  });

  it('perna nao reconhecida derruba a aposta inteira', () => {
    const r = liquida(
      'Flamengo - Resultado final / Mais de 9.5 - Escanteios',
      2,
      0,
    );
    expect(r.resultId).toBeNull();
    expect(r.reason).toBe('OUTRA_CATEGORIA');
  });

  it('perna anulada numa combinada fica pra decisao humana', () => {
    // Anular uma perna muda a odd das outras, e o app nao modela isso.
    const r = liquida(
      'Flamengo - Resultado final / Mais de 3 - Total de gols',
      2,
      1,
    );
    expect(r.resultId).toBeNull();
  });
});

describe('recusas que protegem a planilha', () => {
  const casos: [string, string][] = [
    ['Palmeiras - Escanteios 1x2', 'OUTRA_CATEGORIA'],
    ['Gabigol mais de 0.5 - Chutes a gol', 'OUTRA_CATEGORIA'],
    ['Vini Jr e Mbappe ambos marcam - Jogador para marcar', 'OUTRA_CATEGORIA'],
    ['Mais de 0.5 - Total de gols 1ºT', 'TEMPO_PARCIAL'],
    ['Flamengo - Resultado final 1º tempo', 'TEMPO_PARCIAL'],
    ['Menos de 2.5 gols nos 3 jogos', 'VARIOS_JOGOS'],
    ['Flamengo ou Empate - Resultado final', 'MERCADO_NAO_RECONHECIDO'],
    [
      'Flamengo para vencer de zero - Resultado final',
      'MERCADO_NAO_RECONHECIDO',
    ],
    ['Flamengo vencer sem tomar gols', 'MERCADO_NAO_RECONHECIDO'],
    ['Real Madrid 1-3 - Multi-gols', 'MERCADO_NAO_RECONHECIDO'],
    ['Flamengo -1.5 gols - Handicap', 'MERCADO_NAO_RECONHECIDO'],
  ];

  it.each(casos)('recusa %s', (market, reason) => {
    const r = liquida(market, 2, 1);
    expect(r.resultId).toBeNull();
    expect(r.reason).toBe(reason);
  });
});

describe('estado do jogo', () => {
  it('sem placar nao sugere', () => {
    const r = settleBet('Mais de 2.5 gols', TIMES, null, null);
    expect(r.reason).toBe('SEM_PLACAR');
  });

  it('jogo adiado nao sugere', () => {
    const r = settleBet('Mais de 2.5 gols', TIMES, placar(0, 0), 'postponed');
    expect(r.reason).toBe('JOGO_NAO_FINALIZADO');
  });
});

describe('parseMarket', () => {
  it('quebra combinada em uma condicao por perna', () => {
    const r = parseMarket(
      'Flamengo - Resultado final / Mais de 2.5 - Total de gols',
      TIMES,
    );
    expect(r.ok && r.conditions).toHaveLength(2);
  });

  it('mercado vazio nao vira condicao', () => {
    expect(parseMarket('', TIMES).ok).toBe(false);
  });
});

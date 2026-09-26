import { TipsService } from './tips.service';
import { TipAlreadyPlanilhadaException } from '../bet/bet.service';
import { DIAS_ANTES_RETIDOS } from '../infra/repository/sport-event.repository';
import { matchHouseIdByName } from '../common/utils/house-match.util';

const HOUSES = [
  { id: 3, name: 'Bet365', aliases: [] },
  { id: 7, name: 'Superbet', aliases: ['Superbet Brasil'] },
  { id: 9, name: 'Betano', aliases: [] },
];

const NL = String.fromCharCode(10);

function tipRow(id: number, houseLine: string) {
  return {
    id,
    createdAt: new Date('2026-09-01T12:00:00Z'),
    text: [`🏠 ${houseLine}`, '🆚 Flamengo x Vasco', '⚽️ Futebol', '📌 Over 2.5', '🏷 1.90'].join(NL),
    percent: 1,
    isAviso: false,
    betId: null,
    dismissalId: null,
    deliveryText: null,
    entities: null,
  };
}

// Repositório falso com a mesma semântica do SQL: status e busca filtram,
// mais recente primeiro, página por limit/offset.
function fakeTipsRepository(rows: any[]) {
  const statusOf = (r: any) => (r.betId != null ? 'planilhada' : r.dismissalId != null ? 'caiu' : 'pending');
  const filtered = (f: { status?: string; q?: string }) =>
    rows
      .filter(
        (r) =>
          (!f.status || statusOf(r) === f.status) &&
          (!f.q?.trim() || String(r.text).toLowerCase().includes(f.q.trim().toLowerCase())),
      )
      .sort((a, b) => +b.createdAt - +a.createdAt || b.id - a.id);
  const count = (status: string) => rows.filter((r) => statusOf(r) === status).length;
  return {
    findListRows: jest.fn(async (_u: number, _m: number | null, f: any, page?: { limit: number; offset: number }) => {
      const list = filtered(f);
      return page ? list.slice(page.offset, page.offset + page.limit) : list;
    }),
    countListRows: jest.fn(async (_u: number, _m: number | null, f: any) => filtered(f).length),
    countByStatus: jest.fn(async () => ({
      pending: count('pending'),
      planilhadas: count('planilhada'),
      caidas: count('caiu'),
    })),
  };
}

function makeService(rows: any[], eventos: any[] = []) {
  const tipsRepository = fakeTipsRepository(rows);
  const usersService = {
    findById: jest.fn().mockResolvedValue({ minPercentFilter: null }),
    getUserStake: jest.fn().mockResolvedValue(1000),
  };
  const houseService = { getAllHouses: jest.fn().mockResolvedValue(HOUSES) };
  // Cache de eventos vazio por padrão: o horário do jogo é consultivo e a
  // maioria destes testes é sobre extração/filtro. Quem cobre o casamento em
  // si é event-matching.spec.
  const sportEventRepository = { findCandidates: jest.fn().mockResolvedValue(eventos) };
  return new TipsService(
    tipsRepository as any,
    usersService as any,
    {} as any,
    houseService as any,
    sportEventRepository as any,
  );
}

describe('casamento de nome de casa', () => {
  it('reconhece alias cadastrado e nome com acento/caixa diferente', () => {
    expect(matchHouseIdByName('Superbet Brasil', HOUSES)).toBe(7);
    expect(matchHouseIdByName('betano', HOUSES)).toBe(9);
    expect(matchHouseIdByName('Casa que não existe', HOUSES)).toBeNull();
    expect(matchHouseIdByName(null, HOUSES)).toBeNull();
  });
});

describe('tips: filtro de casas', () => {
  const rows = [tipRow(1, 'Bet365'), tipRow(2, 'Superbet Brasil'), tipRow(3, 'Betano')];

  it('devolve o houseId resolvido em cada tip', async () => {
    const service = makeService(rows);
    const res = await service.listForUser(1, { page: 1, perPage: 30 });
    expect(res.data.map((t) => t.houseId).sort()).toEqual([3, 7, 9]);
  });

  it('filtra por múltiplas casas', async () => {
    const service = makeService(rows);
    const res = await service.listForUser(1, { page: 1, perPage: 30, houseIds: [3, 9] });
    expect(res.data.map((t) => t.id).sort()).toEqual([1, 3]);
    expect(res.total).toBe(2);
  });

  it('sem houseIds mantém a lista inteira, e o resumo ignora o filtro', async () => {
    const service = makeService(rows);
    const semFiltro = await service.listForUser(1, { page: 1, perPage: 30 });
    const comFiltro = await service.listForUser(1, { page: 1, perPage: 30, houseIds: [3] });
    expect(semFiltro.data).toHaveLength(3);
    expect(comFiltro.summary.pending).toBe(3);
    expect(comFiltro.total).toBe(1);
  });
});

describe('tips: horário do jogo', () => {
  const JOGO = new Date('2026-09-02T21:30:00Z');

  function evento(home: string, away: string) {
    return {
      externalId: `${home}-${away}`,
      provider: 'sofascore',
      startAt: JOGO,
      sport: 'Football',
      homeName: home,
      homeShort: null,
      homeCode: null,
      awayName: away,
      awayShort: null,
      awayCode: null,
    };
  }

  it('devolve o início do jogo quando o confronto casa com o cache', async () => {
    const service = makeService([tipRow(1, 'Bet365')], [evento('Flamengo', 'Vasco')]);
    const res = await service.listForUser(1, { page: 1, perPage: 30 });
    expect(res.data[0].eventStartAt).toEqual(JOGO);
  });

  it('fica null quando o cache não tem o confronto', async () => {
    const service = makeService([tipRow(1, 'Bet365')], [evento('Santos', 'Corinthians')]);
    const res = await service.listForUser(1, { page: 1, perPage: 30 });
    expect(res.data[0].eventStartAt).toBeNull();
  });

  it('tip planilhada usa o horário que a aposta gravou, sem depender do cache', async () => {
    // Producao: jogo de 2 dias atras ja tinha saido da janela de candidatos, e
    // a tip planilhada aparecia sem horario mesmo com a aposta guardando ele.
    const row = { ...tipRow(1, 'Bet365'), betId: 7, betEventStartAt: JOGO };
    const service = makeService([row], [evento('Santos', 'Corinthians')]);
    const res = await service.listForUser(1, { page: 1, perPage: 30 });
    expect(res.data[0].eventStartAt).toEqual(JOGO);
  });

  it('cache indisponível não derruba a lista', async () => {
    const service = makeService([tipRow(1, 'Bet365')]);
    (service as any).sportEventRepository.findCandidates = jest
      .fn()
      .mockRejectedValue(new Error('db fora'));
    const res = await service.listForUser(1, { page: 1, perPage: 30 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].eventStartAt).toBeNull();
  });
});

// Regressao de producao: o horario do jogo era resolvido dentro do map sobre
// TODAS as tips do historico, antes da paginacao. Casar nome custa Levenshtein
// contra a janela inteira de eventos, entao um historico grande travava o
// request e a tela ficava carregando pra sempre. O limite abaixo e' folgado de
// proposito — nao mede performance, so denuncia a volta do custo por historico
// (que era de dezenas de segundos neste mesmo cenario).
describe('tips: custo da lista nao acompanha o historico', () => {
  function eventos(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      externalId: String(i),
      provider: 'sofascore',
      startAt: new Date('2026-09-02T21:30:00Z'),
      sport: 'Football',
      homeName: `Clube Casa ${i}`,
      homeShort: null,
      homeCode: null,
      awayName: `Clube Fora ${i}`,
      awayShort: null,
      awayCode: null,
    }));
  }

  it('400 tips no historico com 500 eventos em cache, devolvendo 20', async () => {
    const rows = Array.from({ length: 400 }, (_, i) => tipRow(i + 1, 'Bet365'));
    const service = makeService(rows, eventos(500));

    const inicio = Date.now();
    const res = await service.listForUser(1, { page: 1, perPage: 20 });
    const levou = Date.now() - inicio;

    expect(res.data).toHaveLength(20);
    expect(res.total).toBe(400);
    expect(levou).toBeLessThan(3000);
  }, 30000);
});

// A criacao de aposta e a lista de tips querem janelas diferentes: aposta olha
// pra frente, a lista precisa do jogo que ja aconteceu pra nao mostrar "—" em
// tip de ontem. O teto e' a retencao do job (2 dias), nao um numero solto.
describe('tips: janela de busca de eventos', () => {
  it('varre tudo que o job ainda guarda, nao so 1 dia pra tras', async () => {
    const service = makeService([tipRow(1, 'Bet365')]);
    const repo = (service as any).sportEventRepository;
    await service.listForUser(1, { page: 1, perPage: 30 });

    expect(repo.findCandidates).toHaveBeenCalledWith(
      expect.any(Date),
      DIAS_ANTES_RETIDOS,
    );
  });
});

describe('tips: Planilhar do site', () => {
  const TEXT = ['🏠 Bet365', '🆚 Flamengo x Vasco', '⚽️ Futebol', '📌 Over 2.5', '🏷 1.90', '🛑 1.5%'].join(NL);

  function setup(deliveryText: string | null) {
    const tipsRepository = {
      findById: jest.fn().mockResolvedValue({ id: 4, text: TEXT, percent: '1.5' }),
      findDelivery: jest.fn().mockResolvedValue(deliveryText ? { text: deliveryText } : undefined),
    };
    const usersService = { getUserStake: jest.fn().mockResolvedValue(5000) };
    const betService = {
      findBetByTip: jest.fn().mockResolvedValue(undefined),
      createBet: jest.fn().mockImplementation((bet: object) => Promise.resolve({ id: 70, ...bet })),
    };
    const houseService = { resolveHouseIdFromText: jest.fn().mockResolvedValue(3) };
    const service = new TipsService(
      tipsRepository as any,
      usersService as any,
      betService as any,
      houseService as any,
      {} as any,
    );
    return { service, betService, usersService };
  }

  it('usa a stake que a entrega mostrou, não a banca de agora', async () => {
    const { service, betService, usersService } = setup(`${TEXT}${NL}${NL}🎯 Recomendação de aposta: R$ 12,34`);
    await service.planilharTip(4, 1);
    expect(betService.createBet.mock.calls[0][0]).toMatchObject({ stake: 12.34 });
    expect(usersService.getUserStake).not.toHaveBeenCalled();
  });

  it('sem banca e sem entrega, pede o valor em vez de inventar', async () => {
    const { service, betService, usersService } = setup(null);
    usersService.getUserStake.mockResolvedValue(null);
    await expect(service.planilharTip(4, 1)).rejects.toThrow('Não consegui calcular a stake');
    expect(betService.createBet).not.toHaveBeenCalled();
  });

  it('clique duplo barrado pelo índice devolve a aposta que já existe', async () => {
    const { service, betService } = setup(null);
    betService.createBet.mockRejectedValue(new TipAlreadyPlanilhadaException());
    betService.findBetByTip.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ id: 69 });
    await expect(service.planilharTip(4, 1)).resolves.toEqual({ bet: { id: 69 }, alreadyExisted: true });
  });
});

describe('tips: paginação no banco', () => {
  it('sem filtro de casa, pede só a página ao banco', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => tipRow(i + 1, 'Bet365'));
    const service = makeService(rows);
    const repo = (service as any).tipsRepository;
    const res = await service.listForUser(1, { page: 2, perPage: 10 });
    expect(res.data.map((t) => t.id)).toEqual([40, 39, 38, 37, 36, 35, 34, 33, 32, 31]);
    expect(res.total).toBe(50);
    expect(repo.findListRows).toHaveBeenCalledWith(1, null, expect.anything(), { limit: 10, offset: 10 });
  });

  it('busca e aba entram no filtro; contadores das abas não', async () => {
    const rows = [
      tipRow(1, 'Bet365'),
      { ...tipRow(2, 'Bet365'), text: tipRow(2, 'Bet365').text.replace('Flamengo', 'Palmeiras'), betId: 9 },
      { ...tipRow(3, 'Bet365'), dismissalId: 4 },
    ];
    const service = makeService(rows);
    const res = await service.listForUser(1, { page: 1, perPage: 30, status: 'planilhada', q: 'palmeiras' });
    expect(res.data.map((t) => t.id)).toEqual([2]);
    expect(res.summary).toMatchObject({ pending: 1, planilhadas: 1, caidas: 1 });
  });
});

describe('tips: contagem pro menu', () => {
  it('conta por status sem montar a lista, com o filtro de % do usuário', async () => {
    const rows = [
      tipRow(1, 'Bet365'),
      tipRow(2, 'Betano'),
      { ...tipRow(3, 'Betano'), dismissalId: 9 },
    ];
    const service = makeService(rows);
    const repo = (service as any).tipsRepository;
    expect(await service.countsForUser(1)).toEqual({ pending: 2, planilhadas: 0, caidas: 1 });
    expect(repo.countByStatus).toHaveBeenCalledWith(1, null);
    expect(repo.findListRows).not.toHaveBeenCalled();
  });
});

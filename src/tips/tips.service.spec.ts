import { TipsService } from './tips.service';
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

function makeService(rows: any[], eventos: any[] = []) {
  const tipsRepository = { findSummaryForUser: jest.fn().mockResolvedValue(rows) };
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

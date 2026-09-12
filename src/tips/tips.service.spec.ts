import { TipsService } from './tips.service';
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

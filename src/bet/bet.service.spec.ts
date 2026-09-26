import { BetService } from './bet.service';
import { BetRepository } from '../infra/repository/bet.repository';
import { SportEventRepository } from '../infra/repository/sport-event.repository';
import { CreateBetDto } from './dto/bet.dto';

describe('BetService ingestion', () => {
  const input = {
    userId: 1,
    houseId: 7,
    game: 'Turbinada - Real Madrid vs Barcelona',
    market: 'Mais de 2,5 gols - Criar aposta',
    sport: 'Futebol',
    odd: '2,10',
    stake: 'R$ 50,00',
  };
  function setup() {
    const repository = {
      findRecentCandidates: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation((data: object) =>
          Promise.resolve({ ...data, id: 43 }),
        ),
    };
    // Cache de eventos vazio: nenhum jogo casa, e a aposta tem que ser criada
    // do mesmo jeito. E' o caminho padrao pra esporte/liga fora da coleta.
    const sportEvents = { findCandidates: jest.fn().mockResolvedValue([]) };
    return {
      repository,
      sportEvents,
      service: new BetService(
        repository as unknown as BetRepository,
        sportEvents as unknown as SportEventRepository,
      ),
    };
  }
  it('normalizes and records app origin without trusting payload provenance', async () => {
    const { repository, service } = setup();
    await service.createBet({
      ...input,
      source: 'telegram',
      sourceType: 'image',
    } as unknown as CreateBetDto);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        game: 'Real Madrid vs Barcelona',
        market: 'Mais de 2,5 gols',
        stake: 50,
        odd: 2.1,
        source: 'app',
        sourceType: 'manual',
      }),
    );
  });
  it('signals duplicates and still inserts a new bet with server provenance', async () => {
    const { repository, service } = setup();
    repository.findRecentCandidates.mockResolvedValue([
      {
        ...input,
        game: 'Real Madrid x Barcelona',
        market: 'Mais de 2.5 gols',
        odd: 2.1,
        stake: 50,
        id: 42,
        createdAt: new Date(Date.now() - 1000),
      },
    ]);
    const result = await service.createBet(
      input as unknown as CreateBetDto,
      undefined,
      {
        source: 'telegram',
        sourceType: 'audio',
        telegramChatId: '123',
        telegramMessageId: 9,
      },
    );
    expect(result.duplicate).toEqual({
      isPotentialDuplicate: true,
      existingBetId: 42,
      existingCreatedAt: expect.any(Date),
      reason: 'same_event_market_odd_stake_recent',
    });
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'telegram',
        sourceType: 'audio',
        telegramMessageId: 9,
        telegramChatId: '123',
      }),
    );
  });
  it.each([
    { odd: 'abc' },
    { stake: '' },
    { game: 'Bilhete' },
    { market: 'Criar aposta' },
    { sport: null },
    { odd: 1 },
  ])(
    'rejects invalid normalized fields before DB access: %j',
    async (patch) => {
      const { repository, service } = setup();
      await expect(
        service.createBet({ ...input, ...patch } as unknown as CreateBetDto),
      ).rejects.toThrow('Dados da aposta inválidos.');
      expect(repository.findRecentCandidates).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    },
  );
});

describe('BetService.updateBet — casamento de evento', () => {
  const current = {
    id: 5,
    stake: '50.00',
    odd: '2.00',
    cashoutValue: null,
    resultId: 9,
    game: 'Flamengo x Vasco',
    market: 'Over 2.5',
    sport: 'Futebol',
    betTime: new Date('2026-09-20T18:00:00Z'),
  };

  function setup() {
    const repository = {
      findById: jest.fn().mockResolvedValue(current),
      update: jest
        .fn()
        .mockImplementation((id: number, patch: object) =>
          Promise.resolve({ id, ...patch }),
        ),
      replaceBetEvents: jest.fn().mockResolvedValue(undefined),
    };
    const sportEvents = { findCandidates: jest.fn().mockResolvedValue([]) };
    const service = new BetService(
      repository as unknown as BetRepository,
      sportEvents as unknown as SportEventRepository,
    );
    return { repository, sportEvents, service };
  }

  it('jogo novo refaz o casamento e limpa o evento antigo quando nada casa', async () => {
    const { repository, sportEvents, service } = setup();
    await service.updateBet(5, { game: 'Palmeiras x Santos', market: 'Over 2.5', sport: 'Futebol' }, 1);
    expect(sportEvents.findCandidates).toHaveBeenCalledWith(current.betTime);
    expect(repository.update).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        game: 'Palmeiras x Santos',
        eventExternalId: null,
        eventProvider: null,
        eventStartAt: null,
        eventMatchConfidence: null,
      }),
      1,
    );
    expect(repository.replaceBetEvents).toHaveBeenCalledWith(5, []);
  });

  it('o front reenviando o mesmo jogo não mexe no evento', async () => {
    const { repository, sportEvents, service } = setup();
    await service.updateBet(5, { game: 'Flamengo x Vasco', market: 'Over 2.5', sport: 'Futebol', stake: 60 }, 1);
    expect(sportEvents.findCandidates).not.toHaveBeenCalled();
    const [, patch] = repository.update.mock.calls[0] as [number, object];
    expect(patch).not.toHaveProperty('eventExternalId');
    expect(repository.replaceBetEvents).not.toHaveBeenCalled();
  });
});

describe('BetService: filtros novos da lista', () => {
  it('origem e "sem jogo identificado" chegam ao repositório', async () => {
    const repository = {
      findBets: jest.fn().mockResolvedValue([]),
      countBets: jest.fn().mockResolvedValue(0),
    };
    const service = new BetService(
      repository as unknown as BetRepository,
      { findCandidates: jest.fn() } as unknown as SportEventRepository,
    );
    await service.findBets({ userId: 1, origins: ['tip', 'print'], unmatched: true, page: 1, perPage: 30 } as any);
    expect(repository.findBets).toHaveBeenCalledWith(
      expect.objectContaining({ origins: ['tip', 'print'], unmatched: true }),
    );
  });
});

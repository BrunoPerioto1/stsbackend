import { BetService } from './bet.service';
import { BetRepository } from '../infra/repository/bet.repository';
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
    return {
      repository,
      service: new BetService(repository as unknown as BetRepository),
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

import { BetTextService } from './bet-text.service';
import { TelegramCallbackService } from './telegram-callback.service';
import { BetService } from '../bet/bet.service';
import { BetRepository } from '../infra/repository/bet.repository';
import { buildBetPreview } from './utils/bet-preview.util';

describe('Telegram ingestion through existing house resolver', () => {
  function setup() {
    const repository = {
      findRecentCandidates: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation((data: object) =>
          Promise.resolve({ ...data, id: 1, betTime: new Date() }),
        ),
    };
    const grok = {
      resolveHouseId: jest.fn().mockResolvedValue(7),
      parseBetMessage: jest.fn().mockResolvedValue({
        houseId: 999,
        game: 'Turbinada - Real Madrid vs Barcelona',
        market: 'Mais de 2.5 gols - Criar aposta',
        sport: 'Futebol',
        odd: '2,10',
        stake: 'R$ 50,00',
      }),
    };
    type Dependencies = ConstructorParameters<typeof BetTextService>;
    const service = new BetTextService(
      grok as unknown as Dependencies[0],
      new BetService(repository as unknown as BetRepository),
      {
        findByTelegramUserId: jest.fn().mockResolvedValue({ id: 10 }),
        getUserStake: jest.fn().mockResolvedValue(1000),
      } as unknown as Dependencies[2],
      {
        getAllHouses: jest.fn().mockResolvedValue([{ id: 7, name: 'Betfair' }]),
      } as unknown as Dependencies[3],
      {} as Dependencies[4],
      {} as Dependencies[5],
      {} as Dependencies[6],
    );
    const ctx = {
      from: { id: 20 },
      chat: { id: 30 },
      message: { message_id: 5, date: 1757000000 },
      reply: jest.fn(),
      answerCbQuery: jest.fn(),
      editMessageText: jest.fn(),
    };
    return { service, grok, repository, ctx };
  }
  it('uses resolved house ID instead of AI-provided ID for free text', async () => {
    const { service, grok, repository, ctx } = setup();
    await service.processBetText(ctx, '🏠 Betfair\nAposta fora do template');
    expect(grok.resolveHouseId).toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        houseId: 7,
        userId: 10,
        game: 'Real Madrid vs Barcelona',
        market: 'Mais de 2.5 gols',
        odd: 2.1,
        stake: 50,
        source: 'telegram',
        sourceType: 'text',
        telegramMessageId: 5,
      }),
    );
  });
  it.each(['image', 'audio'] as const)(
    'keeps %s provenance through preview and callback',
    async (sourceType) => {
      const { service, grok, repository, ctx } = setup();
      const preview = buildBetPreview(
        {
          evento: 'Real Madrid x Barcelona',
          esporte: 'Futebol',
          mercado: 'Mais de 2.5 gols',
          odd: 2.1,
          stake: 50,
        },
        'Betfair',
        ctx.message.date,
        { sourceType },
      );
      type Dependencies = ConstructorParameters<typeof TelegramCallbackService>;
      const callback = new TelegramCallbackService(
        {} as Dependencies[0],
        {} as Dependencies[1],
        service,
        {} as Dependencies[3],
        {} as Dependencies[4],
      );
      await callback.handle({
        ...ctx,
        message: undefined,
        callbackQuery: {
          data: preview.reply_markup.inline_keyboard[0][0].callback_data,
          message: {
            chat: ctx.chat,
            text: preview.text,
            message_id: 6,
            date: ctx.message.date + 20,
            reply_to_message: { message_id: 5 },
          },
        },
      });
      expect(grok.resolveHouseId).toHaveBeenCalledWith(preview.text);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          houseId: 7,
          source: 'telegram',
          sourceType,
          telegramMessageId: 5,
          telegramChatId: '30',
          betTime: new Date(ctx.message.date * 1000),
        }),
      );
    },
  );
  it('warns about a potential duplicate without blocking the insert', async () => {
    const { service, repository, ctx } = setup();
    repository.findRecentCandidates.mockResolvedValue([
      {
        id: 42,
        userId: 10,
        houseId: 7,
        game: 'Real Madrid x Barcelona',
        market: 'Mais de 2,5 gols',
        odd: '2.10',
        stake: '50.00',
        createdAt: new Date(Date.now() - 120_000),
      },
    ]);
    await service.processBetText(ctx, '🏠 Betfair\nAposta fora do template');
    expect(repository.create).toHaveBeenCalledTimes(1);
    const [reply] = ctx.reply.mock.calls.at(-1) as [string];
    expect(reply).toContain('⚠️ Possível aposta duplicada');
    expect(reply).toContain('há 2 min');
    expect(reply).toContain('✅ Aposta salva!');
  });
  it('rejects unresolved house even if the AI invents an ID', async () => {
    const { service, grok, repository, ctx } = setup();
    grok.resolveHouseId.mockResolvedValue(null);
    await expect(service.processBetText(ctx, 'texto livre')).rejects.toThrow(
      'CASA_INVALIDA',
    );
    expect(repository.create).not.toHaveBeenCalled();
  });
});

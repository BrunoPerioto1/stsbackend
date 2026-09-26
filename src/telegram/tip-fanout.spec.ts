import { TipFanoutService } from './tip-fanout.service';
import { BotCommandsService } from './bot-commands.service';
import type { BotContext } from './utils/bot-context';

const asCtx = (ctx: object) => ctx as unknown as BotContext;

const TIP = ['🏠 Bet365', '🆚 Flamengo x Vasco', '⚽️ Futebol', '📌 Over 2.5', '🏷 1.90', '🛑 1.5%'].join('\n');

function setupFanout({ created = true, banca = 1000 as number | null } = {}) {
  const bot = {
    telegram: {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 3 }),
      copyMessage: jest.fn().mockResolvedValue({ message_id: 3 }),
    },
  };
  const usersService = {
    getUsersForTipsFanout: jest
      .fn()
      .mockResolvedValue([{ id: 1, telegramUserId: 10, minPercentFilter: null }]),
    getUserStake: jest.fn().mockResolvedValue(banca),
  };
  const tipsService = {
    recordTip: jest.fn().mockResolvedValue({ tip: { id: 8, percent: '1.5' }, created }),
    saveDelivery: jest.fn().mockResolvedValue(undefined),
  };
  const tipsGroup = { isMember: jest.fn().mockResolvedValue(true) };
  const service = new TipFanoutService(
    bot as any,
    usersService as any,
    tipsService as any,
    tipsGroup as any,
  );
  return { service, bot, usersService };
}

describe('fan-out de tips', () => {
  it('reentrega do webhook não manda a DM de novo', async () => {
    const { service, bot, usersService } = setupFanout({ created: false });
    await service.handleTipsMessage(TIP, -100, 50, false);
    expect(usersService.getUsersForTipsFanout).not.toHaveBeenCalled();
    expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('entrega nova leva a recomendação calculada pela banca', async () => {
    const { service, bot } = setupFanout();
    await service.handleTipsMessage(TIP, -100, 50, false);
    const [, text] = bot.telegram.sendMessage.mock.calls[0] as [number, string];
    expect(text).toContain('🎯 Recomendação de aposta: R$ 15,00');
  });

  it('sem banca, a cópia pede o /stake em vez de recomendar sobre um valor inventado', async () => {
    const { service, bot } = setupFanout({ banca: null });
    await service.handleTipsMessage(TIP, -100, 50, false);
    const [, text] = bot.telegram.sendMessage.mock.calls[0] as [number, string];
    expect(text).not.toContain('Recomendação de aposta:');
    expect(text).toContain('/stake');
  });
});

describe('/stake', () => {
  it.each([
    ['2000', 2000],
    ['1.500', 1500],
    ['1500,50', 1500.5],
    ['1.500,50', 1500.5],
    ['R$2000', 2000],
  ])('"/stake %s" grava %p', async (arg, expected) => {
    const usersService = {
      findByTelegramUserId: jest.fn().mockResolvedValue({ id: 1 }),
      updateUserStake: jest.fn().mockResolvedValue(true),
    };
    const service = new BotCommandsService(usersService as any, {} as any, {} as any);
    await service.handleStake(asCtx({ message: { text: `/stake ${arg}` }, from: { id: 10 }, reply: jest.fn() }));
    expect(usersService.updateUserStake).toHaveBeenCalledWith(1, expected);
  });

  it('recusa valor que não é número', async () => {
    const usersService = { findByTelegramUserId: jest.fn(), updateUserStake: jest.fn() };
    const service = new BotCommandsService(usersService as any, {} as any, {} as any);
    await service.handleStake(asCtx({ message: { text: '/stake abc' }, from: { id: 10 }, reply: jest.fn() }));
    expect(usersService.updateUserStake).not.toHaveBeenCalled();
  });
});

describe('fan-out: banca e envio', () => {
  it('usa a banca que veio na query, sem um SELECT por usuário', async () => {
    const { service, bot, usersService } = setupFanout();
    usersService.getUsersForTipsFanout.mockResolvedValue([
      { id: 1, telegramUserId: 10, minPercentFilter: null, stake: '2000' },
      { id: 2, telegramUserId: 20, minPercentFilter: '3', stake: '2000' },
    ]);
    await service.handleTipsMessage(TIP, -100, 50, false);
    expect(usersService.getUserStake).not.toHaveBeenCalled();
    // O de filtro 3% não recebe uma tip de 1,5%.
    expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(1);
    const [, text] = bot.telegram.sendMessage.mock.calls[0] as [number, string];
    expect(text).toContain('R$ 30,00');
  });
});

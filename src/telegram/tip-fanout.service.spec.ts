import { TipFanoutService } from './tip-fanout.service';

const CARD = '🏠 Bet365\n🆚 A x B\n⚽️ Futebol\n📌 Over 2.5\n🏷 1.85\n🛑 2%\n📣 Fonte: Tipster X';

function setup(translated: { sourceId: number; card: string } | null, muted: number[] = []) {
  const bot = { telegram: { sendMessage: jest.fn().mockResolvedValue({ message_id: 99 }) } };
  const usersService = {
    getUsersForTipsFanout: jest.fn().mockResolvedValue([
      { id: 1, telegramUserId: 101, stake: 1000, minPercentFilter: null },
      { id: 2, telegramUserId: 102, stake: 1000, minPercentFilter: null },
    ]),
  };
  const tipsService = {
    recordTip: jest.fn().mockResolvedValue({ tip: { id: 7, percent: 2 }, created: true }),
    saveDelivery: jest.fn().mockResolvedValue(undefined),
  };
  const tipsGroup = { isMember: jest.fn().mockResolvedValue(true) };
  const tipSources = {
    translate: jest.fn().mockResolvedValue(translated),
    mutedUserIds: jest.fn().mockResolvedValue(new Set(muted)),
  };
  const service = new TipFanoutService(
    bot as any,
    usersService as any,
    tipsService as any,
    tipsGroup as any,
    tipSources as any,
  );
  return { service, bot, tipsService, tipSources };
}

describe('handleTipsMessage com fonte cadastrada', () => {
  const original = 'TIP DO DIA\nA x B\nOdd 1,85 na Bet365\nStake 2%';
  const entities = [{ type: 'bold' as const, offset: 0, length: 10 }];

  it('grava o card, a fonte e a mensagem original; sem as entidades do tipster', async () => {
    const { service, tipsService } = setup({ sourceId: 3, card: CARD });
    await service.handleTipsMessage(original, -100, 5, false, entities);

    expect(tipsService.recordTip).toHaveBeenCalledWith(
      expect.objectContaining({
        text: CARD,
        percent: 2,
        sourceId: 3,
        originalText: original,
        entities: null,
      }),
    );
  });

  it('a DM leva o card com a recomendação, e quem desligou a fonte não recebe', async () => {
    const { service, bot, tipSources } = setup({ sourceId: 3, card: CARD }, [2]);
    await service.handleTipsMessage(original, -100, 5, false, entities);

    expect(tipSources.mutedUserIds).toHaveBeenCalledWith(3);
    expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(1);
    const [chat, text] = bot.telegram.sendMessage.mock.calls[0] as [number, string];
    expect(chat).toBe(101);
    expect(text).toContain('🆚 A x B');
    expect(text).toContain('🎯 Recomendação de aposta: R$ 20,00');
    expect(text).toContain('💰 Lucro potencial: R$ 17,00');
  });

  it('nenhum modelo leu: segue como sempre, sem fonte e sem consultar quem desligou', async () => {
    const { service, tipsService, tipSources } = setup(null);
    await service.handleTipsMessage(CARD.replace('\n📣 Fonte: Tipster X', ''), -100, 5, false, entities);

    expect(tipsService.recordTip).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: null, originalText: null, entities }),
    );
    expect(tipSources.mutedUserIds).not.toHaveBeenCalled();
  });
});

import { BotCommandsService } from './bot-commands.service';

const DAY = 86_400_000;

function setup(user: object | null) {
  const usersService = {
    findByTelegramUserId: jest.fn().mockResolvedValue(user),
  };
  const service = new BotCommandsService(usersService as any, {} as any);
  return { service, usersService };
}

function privateMessage(text: string) {
  return {
    chat: { type: 'private' },
    from: { id: 7 },
    message: { text },
    reply: jest.fn(),
  };
}

describe('blockIfNoAccess', () => {
  beforeEach(() => {
    process.env.PIX_KEY = 'chave-teste';
    process.env.ACCESS_PRICE = '40';
  });

  it('vencido: não passa e responde com valor e chave PIX', async () => {
    const { service } = setup({
      isActive: true,
      accessUntil: new Date(Date.now() - DAY),
    });
    const ctx = privateMessage('Flamengo vence @1.80 50');

    await expect(service.blockIfNoAccess(ctx)).resolves.toBe(true);
    const [text, extra] = ctx.reply.mock.calls[0] as [
      string,
      {
        reply_markup: { inline_keyboard: { copy_text: { text: string } }[][] };
      },
    ];
    expect(text).toContain('Seu acesso venceu');
    expect(text).toContain('R$ 40,00');
    expect(text).toContain('chave-teste');
    expect(extra.reply_markup.inline_keyboard[0][0].copy_text.text).toBe(
      'chave-teste',
    );
  });

  it('vencido clicando em Planilhar: só pop-up, sem responder no chat', async () => {
    const { service } = setup({
      isActive: true,
      accessUntil: new Date(Date.now() - DAY),
    });
    const ctx = {
      chat: { type: 'private' },
      from: { id: 7 },
      callbackQuery: { data: 'planilhar:1' },
      answerCbQuery: jest.fn().mockResolvedValue(true),
      reply: jest.fn(),
    };

    await expect(service.blockIfNoAccess(ctx)).resolves.toBe(true);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      expect.stringContaining('chave-teste'),
      { show_alert: true },
    );
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('desativado: barra sem mostrar PIX', async () => {
    const { service } = setup({ isActive: false, accessUntil: null });
    const ctx = privateMessage('/pendentes');

    await expect(service.blockIfNoAccess(ctx)).resolves.toBe(true);
    const [text] = ctx.reply.mock.calls[0] as [string];
    expect(text).toContain('desativada');
    expect(text).not.toContain('chave-teste');
  });

  it('em dia, sem prazo ou sem vínculo: passa', async () => {
    for (const user of [
      { isActive: true, accessUntil: new Date(Date.now() + DAY) },
      { isActive: null, accessUntil: null },
      null,
    ]) {
      const { service } = setup(user);
      await expect(service.blockIfNoAccess(privateMessage('oi'))).resolves.toBe(
        false,
      );
    }
  });

  it('/start e /vincular passam mesmo vencido, sem consultar o banco', async () => {
    const { service, usersService } = setup({
      isActive: true,
      accessUntil: new Date(Date.now() - DAY),
    });
    await expect(
      service.blockIfNoAccess(privateMessage('/start')),
    ).resolves.toBe(false);
    await expect(
      service.blockIfNoAccess(privateMessage('/vincular 123456')),
    ).resolves.toBe(false);
    expect(usersService.findByTelegramUserId).not.toHaveBeenCalled();
  });

  it('grupo de Tips e banco fora do ar: passa', async () => {
    const { service } = setup(null);
    await expect(
      service.blockIfNoAccess({
        chat: { type: 'supergroup' },
        from: { id: 7, is_bot: true },
      }),
    ).resolves.toBe(false);

    const usersService = {
      findByTelegramUserId: jest.fn().mockRejectedValue(new Error('db')),
    };
    const failing = new BotCommandsService(usersService as any, {} as any);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(failing.blockIfNoAccess(privateMessage('oi'))).resolves.toBe(
      false,
    );
  });
});

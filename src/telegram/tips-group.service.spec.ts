import { TipsGroupService } from './tips-group.service';

const DAY = 86_400_000;
const GROUP = -100123;

function setup(user: object | null, member: object = { status: 'left' }) {
  process.env.TIPS_GROUP_CHAT_ID = String(GROUP);
  process.env.PIX_KEY = 'chave-teste';
  process.env.ACCESS_PRICE = '40';
  const telegram = {
    getChatMember: jest.fn().mockResolvedValue(member),
    banChatMember: jest.fn().mockResolvedValue(true),
    unbanChatMember: jest.fn().mockResolvedValue(true),
    createChatInviteLink: jest
      .fn()
      .mockResolvedValue({ invite_link: 'https://t.me/+convite' }),
    approveChatJoinRequest: jest.fn().mockResolvedValue(true),
    declineChatJoinRequest: jest.fn().mockResolvedValue(true),
    sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
  };
  const usersService = {
    findByTelegramUserId: jest.fn().mockResolvedValue(user),
  };
  const service = new TipsGroupService(
    { telegram } as any,
    usersService as any,
  );
  return { service, telegram, usersService };
}

const request = (chatId = GROUP) => ({
  chat: { id: chatId },
  from: { id: 7 },
  user_chat_id: 7,
});

describe('TipsGroupService.handleJoinRequest', () => {
  it('vinculado e em dia: aprova sem mandar mensagem', async () => {
    const { service, telegram } = setup({
      isActive: true,
      accessUntil: new Date(Date.now() + DAY),
    });
    await service.handleJoinRequest(request());

    expect(telegram.approveChatJoinRequest).toHaveBeenCalledWith(GROUP, 7);
    expect(telegram.declineChatJoinRequest).not.toHaveBeenCalled();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('sem prazo também entra', async () => {
    const { service, telegram } = setup({ isActive: null, accessUntil: null });
    await service.handleJoinRequest(request());
    expect(telegram.approveChatJoinRequest).toHaveBeenCalledWith(GROUP, 7);
  });

  it('vencido: manda o PIX antes de recusar', async () => {
    const { service, telegram } = setup({
      isActive: true,
      accessUntil: new Date(Date.now() - DAY),
    });
    await service.handleJoinRequest(request());

    const [chat, text, extra] = telegram.sendMessage.mock.calls[0] as [
      number,
      string,
      { reply_markup: { inline_keyboard: unknown[][] } },
    ];
    expect(chat).toBe(7);
    expect(text).toContain('Seu acesso venceu');
    expect(text).toContain('chave-teste');
    expect(extra.reply_markup.inline_keyboard).toHaveLength(1);
    expect(telegram.declineChatJoinRequest).toHaveBeenCalledWith(GROUP, 7);
    // O Telegram só deixa falar com quem pediu enquanto o pedido está aberto.
    expect(telegram.sendMessage.mock.invocationCallOrder[0]).toBeLessThan(
      telegram.declineChatJoinRequest.mock.invocationCallOrder[0],
    );
    expect(telegram.approveChatJoinRequest).not.toHaveBeenCalled();
  });

  it('sem vínculo: recusa explicando como vincular', async () => {
    const { service, telegram } = setup(null);
    await service.handleJoinRequest(request());

    const [, text] = telegram.sendMessage.mock.calls[0] as [number, string];
    expect(text).toContain('/vincular');
    expect(telegram.declineChatJoinRequest).toHaveBeenCalledWith(GROUP, 7);
  });

  it('desativado: recusa sem mostrar PIX', async () => {
    const { service, telegram } = setup({ isActive: false, accessUntil: null });
    await service.handleJoinRequest(request());

    const [, text] = telegram.sendMessage.mock.calls[0] as [number, string];
    expect(text).toContain('desativada');
    expect(text).not.toContain('chave-teste');
    expect(telegram.declineChatJoinRequest).toHaveBeenCalled();
  });

  it('recusa mesmo se a mensagem não sair', async () => {
    const { service, telegram } = setup(null);
    telegram.sendMessage.mockRejectedValue(new Error('blocked'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await service.handleJoinRequest(request());
    expect(telegram.declineChatJoinRequest).toHaveBeenCalledWith(GROUP, 7);
  });

  it('banco fora do ar: deixa o pedido pendente pro admin decidir', async () => {
    const { service, telegram, usersService } = setup(null);
    usersService.findByTelegramUserId.mockRejectedValue(new Error('db'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await service.handleJoinRequest(request());
    expect(telegram.approveChatJoinRequest).not.toHaveBeenCalled();
    expect(telegram.declineChatJoinRequest).not.toHaveBeenCalled();
  });

  it('pedido de outro grupo: ignora', async () => {
    const { service, telegram, usersService } = setup(null);
    await service.handleJoinRequest(request(-999));

    expect(usersService.findByTelegramUserId).not.toHaveBeenCalled();
    expect(telegram.declineChatJoinRequest).not.toHaveBeenCalled();
  });
});

describe('TipsGroupService.readmit', () => {
  const until = new Date('2026-10-25T02:30:00Z');

  it('ainda no grupo: não manda nada', async () => {
    for (const member of [
      { status: 'member' },
      { status: 'administrator' },
      { status: 'restricted', is_member: true },
    ]) {
      const { service, telegram } = setup(null, member);
      await expect(service.readmit(7, until)).resolves.toBeNull();
      expect(telegram.createChatInviteLink).not.toHaveBeenCalled();
      expect(telegram.sendMessage).not.toHaveBeenCalled();
    }
  });

  it('banido: tira o ban e manda convite de pedido de entrada', async () => {
    const { service, telegram } = setup(null, { status: 'kicked' });
    await expect(service.readmit(7, until)).resolves.toBe('sent');

    expect(telegram.unbanChatMember).toHaveBeenCalledWith(GROUP, 7, {
      only_if_banned: true,
    });
    const [chat, options] = telegram.createChatInviteLink.mock.calls[0] as [
      number,
      { creates_join_request: boolean; expire_date: number },
    ];
    expect(chat).toBe(GROUP);
    expect(options.creates_join_request).toBe(true);
    expect(options.expire_date * 1000).toBeGreaterThan(Date.now());
    const [to, text] = telegram.sendMessage.mock.calls[0] as [number, string];
    expect(to).toBe(7);
    expect(text).toContain('https://t.me/+convite');
    expect(text).toContain('24/10');
  });

  it('saiu sozinho: manda convite sem mexer em ban', async () => {
    const { service, telegram } = setup(null, { status: 'left' });
    await expect(service.readmit(7, null)).resolves.toBe('sent');
    expect(telegram.unbanChatMember).not.toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenCalled();
  });

  it('Telegram recusa: devolve failed', async () => {
    const { service, telegram } = setup(null, { status: 'kicked' });
    telegram.unbanChatMember.mockRejectedValue(new Error('not enough rights'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.readmit(7, until)).resolves.toBe('failed');
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('sem grupo configurado: nada a fazer', async () => {
    const { telegram } = setup(null);
    delete process.env.TIPS_GROUP_CHAT_ID;
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new TipsGroupService({ telegram } as any, {} as any);

    await expect(service.readmit(7, until)).resolves.toBeNull();
    expect(telegram.getChatMember).not.toHaveBeenCalled();
  });
});

describe('TipsGroupService.remove', () => {
  it('bane do grupo e avisa com o PIX', async () => {
    const { service, telegram } = setup(null);
    await service.remove(7);

    expect(telegram.banChatMember).toHaveBeenCalledWith(GROUP, 7);
    const [to, text] = telegram.sendMessage.mock.calls[0] as [number, string];
    expect(to).toBe(7);
    expect(text).toContain('chave-teste');
  });

  it('ban recusado: propaga o erro e não avisa', async () => {
    const { service, telegram } = setup(null);
    telegram.banChatMember.mockRejectedValue(new Error('not enough rights'));

    await expect(service.remove(7)).rejects.toThrow('not enough rights');
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('aviso que não sai não desfaz a remoção', async () => {
    const { service, telegram } = setup(null);
    telegram.sendMessage.mockRejectedValue(new Error('blocked'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.remove(7)).resolves.toBeUndefined();
  });
});

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
  const usersRepository = {
    findByTelegramUserId: jest.fn().mockResolvedValue(user),
    findAdminsWithTelegram: jest.fn().mockResolvedValue([{ telegramUserId: 500 }]),
    updateUser: jest.fn().mockResolvedValue(undefined),
  };
  const service = new TipsGroupService(
    { telegram } as any,
    usersRepository as any,
  );
  return { service, telegram, usersRepository };
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

  it('quem tinha saído do grupo e volta pelo link perde a marca de fora', async () => {
    const { service, telegram, usersRepository } = setup({
      id: 16,
      isActive: true,
      accessUntil: new Date(Date.now() + DAY),
      tipsGroupRemovedAt: new Date(),
    });
    await service.handleJoinRequest(request());

    expect(telegram.approveChatJoinRequest).toHaveBeenCalledWith(GROUP, 7);
    expect(usersRepository.updateUser).toHaveBeenCalledWith(16, { tipsGroupRemovedAt: null });
  });

  it('aprovar quem nunca saiu não escreve nada', async () => {
    const { service, usersRepository } = setup({ id: 16, isActive: true, accessUntil: null, tipsGroupRemovedAt: null });
    await service.handleJoinRequest(request());
    expect(usersRepository.updateUser).not.toHaveBeenCalled();
  });

  it('banco fora do ar: deixa o pedido pendente pro admin decidir', async () => {
    const { service, telegram, usersRepository } = setup(null);
    usersRepository.findByTelegramUserId.mockRejectedValue(new Error('db'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await service.handleJoinRequest(request());
    expect(telegram.approveChatJoinRequest).not.toHaveBeenCalled();
    expect(telegram.declineChatJoinRequest).not.toHaveBeenCalled();
  });

  it('pedido de outro grupo: ignora', async () => {
    const { service, telegram, usersRepository } = setup(null);
    await service.handleJoinRequest(request(-999));

    expect(usersRepository.findByTelegramUserId).not.toHaveBeenCalled();
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

  it('com intro, a primeira linha diz o motivo do convite', async () => {
    const { service, telegram } = setup(null, { status: 'left' });
    await service.readmit(7, until, '🔗 Telegram vinculado de novo.');
    const [, text] = telegram.sendMessage.mock.calls[0] as [number, string];
    expect(text.startsWith('🔗 Telegram vinculado de novo.')).toBe(true);
    expect(text).not.toContain('Acesso liberado');
    expect(text).toContain('https://t.me/+convite');
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

// Desvincular, trocar de Telegram ou excluir a conta: o grupo é só de conta
// vinculada. Antes a pessoa pagava, desvinculava e seguia lendo depois de
// vencer — sem o ID salvo, nem o painel alcançava ela.
describe('TipsGroupService.leave', () => {
  const pessoa = { telegramUserId: 7, telegramUsername: 'fulano', fullName: 'Fulano' };

  it('membro: tira (ban + unban, pra poder voltar) e avisa o motivo', async () => {
    const { service, telegram } = setup(null, { status: 'member' });
    await expect(service.leave(pessoa, 'unlinked')).resolves.toBe('removed');

    expect(telegram.banChatMember).toHaveBeenCalledWith(GROUP, 7);
    expect(telegram.unbanChatMember).toHaveBeenCalledWith(GROUP, 7, { only_if_banned: true });
    expect(telegram.banChatMember.mock.invocationCallOrder[0]).toBeLessThan(
      telegram.unbanChatMember.mock.invocationCallOrder[0],
    );
    const [to, text] = telegram.sendMessage.mock.calls[0] as [number, string];
    expect(to).toBe(7);
    expect(text).toContain('desvinculado');
    expect(text).toContain('saiu do grupo de Tips');
  });

  it('cada motivo tem o seu aviso', async () => {
    for (const [reason, trecho] of [
      ['relinked', 'outro Telegram'],
      ['deleted', 'excluída'],
    ] as const) {
      const { service, telegram } = setup(null, { status: 'member' });
      await service.leave(pessoa, reason);
      const [, text] = telegram.sendMessage.mock.calls[0] as [number, string];
      expect(text).toContain(trecho);
    }
  });

  it('ID do Telegram como string (BIGINT do pg) vira número', async () => {
    const { service, telegram } = setup(null, { status: 'member' });
    await service.leave({ ...pessoa, telegramUserId: '7' }, 'deleted');
    expect(telegram.getChatMember).toHaveBeenCalledWith(GROUP, 7);
    expect(telegram.banChatMember).toHaveBeenCalledWith(GROUP, 7);
  });

  it('fora do grupo, ou dono/admin dele: não mexe', async () => {
    for (const member of [
      { status: 'left' },
      { status: 'kicked' },
      { status: 'restricted', is_member: false },
      { status: 'creator' },
      { status: 'administrator' },
    ]) {
      const { service, telegram } = setup(null, member);
      await expect(service.leave(pessoa, 'unlinked')).resolves.toBeNull();
      expect(telegram.banChatMember).not.toHaveBeenCalled();
      expect(telegram.sendMessage).not.toHaveBeenCalled();
    }
  });

  it('membro restrito ainda está dentro: sai também', async () => {
    const { service, telegram } = setup(null, { status: 'restricted', is_member: true });
    await expect(service.leave(pessoa, 'unlinked')).resolves.toBe('removed');
    expect(telegram.banChatMember).toHaveBeenCalled();
  });

  it('sem Telegram ou sem grupo configurado: nada a fazer', async () => {
    const { service, telegram } = setup(null, { status: 'member' });
    await expect(service.leave({ ...pessoa, telegramUserId: null }, 'deleted')).resolves.toBeNull();
    expect(telegram.getChatMember).not.toHaveBeenCalled();

    delete process.env.TIPS_GROUP_CHAT_ID;
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const semGrupo = new TipsGroupService({ telegram } as any, {} as any);
    await expect(semGrupo.leave(pessoa, 'deleted')).resolves.toBeNull();
    expect(telegram.getChatMember).not.toHaveBeenCalled();
  });

  it('Telegram recusa: devolve failed e passa o ID pros admins tirarem à mão', async () => {
    const { service, telegram, usersRepository } = setup(null, { status: 'member' });
    telegram.banChatMember.mockRejectedValue({ response: { description: 'Bad Request: not enough rights' } });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.leave(pessoa, 'unlinked')).resolves.toBe('failed');

    expect(usersRepository.findAdminsWithTelegram).toHaveBeenCalledWith(1);
    const [to, text] = telegram.sendMessage.mock.calls[0] as [number, string];
    expect(to).toBe(500);
    expect(text).toContain('Fulano (@fulano)');
    expect(text).toContain('Telegram ID: 7');
    expect(text).toContain('not enough rights');
    // A pessoa não ouve "você saiu" de uma remoção que não aconteceu.
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('unban que falha não desfaz a saída', async () => {
    const { service, telegram } = setup(null, { status: 'member' });
    telegram.unbanChatMember.mockRejectedValue(new Error('flood'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(service.leave(pessoa, 'deleted')).resolves.toBe('removed');
    expect(telegram.sendMessage).toHaveBeenCalled();
  });
});

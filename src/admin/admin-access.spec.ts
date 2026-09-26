import { BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';

function setup() {
  const usersRepository = {
    findById: jest.fn().mockResolvedValue({ id: 16, accessUntil: null }),
    updateUser: jest.fn().mockResolvedValue(undefined),
  };
  const adminRepository = {
    listUsers: jest
      .fn()
      .mockResolvedValue([{ id: 16, telegramUserId: null, betCount: 0 }]),
  };
  const service = new AdminService(
    adminRepository as any,
    usersRepository as any,
    {} as any,
    {} as any,
  );
  return { service, usersRepository };
}

describe('AdminService.updateUser — vencimento exato', () => {
  it('grava a data enviada, respeitando o fuso', async () => {
    const { service, usersRepository } = setup();
    await service.updateUser(1, 16, {
      accessUntil: '2026-10-24T23:30:00-03:00',
    });

    const [, fields] = usersRepository.updateUser.mock.calls[0] as [
      number,
      { accessUntil: Date },
    ];
    expect(fields.accessUntil.toISOString()).toBe('2026-10-25T02:30:00.000Z');
  });

  it('null tira o prazo', async () => {
    const { service, usersRepository } = setup();
    await service.updateUser(1, 16, { accessUntil: null });

    const [, fields] = usersRepository.updateUser.mock.calls[0] as [
      number,
      { accessUntil: Date | null },
    ];
    expect(fields.accessUntil).toBeNull();
  });

  it('recusa data e +dias juntos, e prazo na própria conta', async () => {
    const { service } = setup();
    await expect(
      service.updateUser(1, 16, {
        extendDays: 30,
        accessUntil: '2026-10-24T23:30:00-03:00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateUser(16, 16, { accessUntil: '2026-10-24T23:30:00-03:00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AdminService.updateUser — grupo Tips', () => {
  const DAY = 86_400_000;
  const expired = () => new Date(Date.now() - DAY);

  function setupGroup(target: object, readmit: 'sent' | 'failed' | null = 'sent') {
    const usersRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 16,
        isActive: true,
        telegramUserId: 77,
        tipsGroupRemovedAt: null,
        ...target,
      }),
      updateUser: jest.fn().mockResolvedValue(undefined),
    };
    const adminRepository = {
      listUsers: jest
        .fn()
        .mockResolvedValue([{ id: 16, telegramUserId: 77, betCount: 0 }]),
    };
    const tipsGroup = {
      configured: true,
      remove: jest.fn().mockResolvedValue(undefined),
      readmit: jest.fn().mockResolvedValue(readmit),
    };
    const service = new AdminService(
      adminRepository as any,
      usersRepository as any,
      {} as any,
      tipsGroup as any,
    );
    return { service, usersRepository, tipsGroup };
  }

  it('tira do grupo quem venceu e marca a data', async () => {
    const { service, usersRepository, tipsGroup } = setupGroup({
      accessUntil: expired(),
    });
    await service.updateUser(1, 16, { tipsGroup: 'remove' });

    expect(tipsGroup.remove).toHaveBeenCalledWith(77, 16);
    const [id, fields] = usersRepository.updateUser.mock.calls[0] as [
      number,
      { tipsGroupRemovedAt: Date },
    ];
    expect(id).toBe(16);
    expect(fields.tipsGroupRemovedAt).toBeInstanceOf(Date);
  });

  it('recusa tirar quem está em dia ou sem Telegram', async () => {
    const inDay = setupGroup({ accessUntil: new Date(Date.now() + DAY) });
    await expect(
      inDay.service.updateUser(1, 16, { tipsGroup: 'remove' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(inDay.tipsGroup.remove).not.toHaveBeenCalled();

    const noTelegram = setupGroup({ accessUntil: expired(), telegramUserId: null });
    await expect(
      noTelegram.service.updateUser(1, 16, { tipsGroup: 'remove' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('Telegram recusa o ban: 400 com o motivo e nada gravado', async () => {
    const { service, usersRepository, tipsGroup } = setupGroup({
      accessUntil: expired(),
    });
    tipsGroup.remove.mockRejectedValue({
      response: { description: 'Bad Request: not enough rights' },
    });

    await expect(
      service.updateUser(1, 16, { tipsGroup: 'remove' }),
    ).rejects.toThrow('not enough rights');
    expect(usersRepository.updateUser).not.toHaveBeenCalled();
  });

  it('+30d em quem foi tirado: grava o prazo, convida e limpa a marca', async () => {
    const { service, usersRepository, tipsGroup } = setupGroup({
      accessUntil: expired(),
      tipsGroupRemovedAt: new Date(),
    });
    const result = await service.updateUser(1, 16, { extendDays: 30 });

    const [, access] = usersRepository.updateUser.mock.calls[0] as [
      number,
      { accessUntil: Date },
    ];
    expect(tipsGroup.readmit).toHaveBeenCalledWith(77, access.accessUntil);
    // O prazo vai pro banco antes do convite: o bot aprova a entrada lendo ele.
    expect(usersRepository.updateUser.mock.invocationCallOrder[0]).toBeLessThan(
      tipsGroup.readmit.mock.invocationCallOrder[0],
    );
    expect(usersRepository.updateUser).toHaveBeenLastCalledWith(16, {
      tipsGroupRemovedAt: null,
    });
    expect(result.groupInvite).toBe('sent');
  });

  it('convite falhou: mantém a marca pra dar pra repetir', async () => {
    const { service, usersRepository } = setupGroup(
      { accessUntil: expired(), tipsGroupRemovedAt: new Date() },
      'failed',
    );
    const result = await service.updateUser(1, 16, { extendDays: 30 });

    expect(usersRepository.updateUser).toHaveBeenCalledTimes(1);
    expect(result.groupInvite).toBe('failed');
  });

  it('vencido que nunca foi tirado também é chamado de volta', async () => {
    const { service, tipsGroup } = setupGroup({ accessUntil: expired() });
    await service.updateUser(1, 16, { accessUntil: null });
    expect(tipsGroup.readmit).toHaveBeenCalledWith(77, null);
  });

  it('renovação de quem está em dia e no grupo não mexe no Telegram', async () => {
    const { service, tipsGroup } = setupGroup({
      accessUntil: new Date(Date.now() + DAY),
    });
    const result = await service.updateUser(1, 16, { extendDays: 30 });
    expect(tipsGroup.readmit).not.toHaveBeenCalled();
    expect(result.groupInvite).toBeUndefined();
  });

  it('mudança que não é de acesso não dispara convite', async () => {
    const { service, tipsGroup } = setupGroup({
      accessUntil: new Date(Date.now() + DAY),
      tipsGroupRemovedAt: new Date(),
    });
    await service.updateUser(1, 16, { unlock: true });
    expect(tipsGroup.readmit).not.toHaveBeenCalled();
  });

  it('convidar de novo: só pra quem está em dia', async () => {
    const inDay = setupGroup({
      accessUntil: new Date(Date.now() + DAY),
      tipsGroupRemovedAt: new Date(),
    });
    const result = await inDay.service.updateUser(1, 16, { tipsGroup: 'invite' });
    expect(inDay.tipsGroup.readmit).toHaveBeenCalled();
    expect(result.groupInvite).toBe('sent');

    const late = setupGroup({ accessUntil: expired() });
    await expect(
      late.service.updateUser(1, 16, { tipsGroup: 'invite' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AdminService.updateUser — desativar conta', () => {
  it('grava is_active', async () => {
    const { service, usersRepository } = setup();
    await service.updateUser(1, 16, { isActive: false });
    expect(usersRepository.updateUser).toHaveBeenCalledWith(16, { isActive: false });
  });

  it('recusa desativar a própria conta', async () => {
    const { service, usersRepository } = setup();
    await expect(service.updateUser(16, 16, { isActive: false })).rejects.toBeInstanceOf(BadRequestException);
    expect(usersRepository.updateUser).not.toHaveBeenCalled();
  });
});

import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';

const DAY = 86_400_000;

function setup(
  user: Record<string, unknown> | undefined,
  leave: 'removed' | 'failed' | null = 'removed',
) {
  const usersRepository = {
    findById: jest.fn().mockResolvedValue(user),
    findByTelegramLinkCode: jest.fn().mockResolvedValue(user),
    findByTelegramUserId: jest.fn().mockResolvedValue(undefined),
    linkTelegram: jest.fn().mockResolvedValue(true),
    updateUser: jest.fn().mockResolvedValue(user),
    deleteUserAndData: jest.fn().mockResolvedValue(undefined),
  };
  const tipsGroup = {
    leave: jest.fn().mockResolvedValue(leave),
    readmit: jest.fn().mockResolvedValue('sent'),
  };
  const service = new UsersService(usersRepository as any, tipsGroup as any);
  return { service, usersRepository, tipsGroup };
}

describe('UsersService.deleteAccount', () => {
  it('apaga os dados e depois tira o Telegram do grupo Tips', async () => {
    const user = {
      id: 5,
      passwordHash: await bcrypt.hash('senha-certa', 4),
      telegramUserId: 77,
    };
    const { service, usersRepository, tipsGroup } = setup(user);

    await service.deleteAccount(5, 'senha-certa');

    expect(usersRepository.deleteUserAndData).toHaveBeenCalledWith(5);
    expect(tipsGroup.leave).toHaveBeenCalledWith(user, 'deleted');
    // A conta some mesmo que o Telegram recuse depois.
    expect(
      usersRepository.deleteUserAndData.mock.invocationCallOrder[0],
    ).toBeLessThan(tipsGroup.leave.mock.invocationCallOrder[0]);
  });

  it('senha errada não apaga nem mexe no grupo', async () => {
    const { service, usersRepository, tipsGroup } = setup({
      id: 5,
      passwordHash: await bcrypt.hash('senha-certa', 4),
      telegramUserId: 77,
    });

    await expect(service.deleteAccount(5, 'outra')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(usersRepository.deleteUserAndData).not.toHaveBeenCalled();
    expect(tipsGroup.leave).not.toHaveBeenCalled();
  });
});

describe('UsersService.desvincularTelegram', () => {
  it('tira do grupo antes de apagar o ID, e marca que saiu', async () => {
    const user = { id: 5, telegramUserId: 77 };
    const { service, usersRepository, tipsGroup } = setup(user, 'removed');

    await service.desvincularTelegram(5);

    expect(tipsGroup.leave).toHaveBeenCalledWith(user, 'unlinked');
    expect(tipsGroup.leave.mock.invocationCallOrder[0]).toBeLessThan(
      usersRepository.updateUser.mock.invocationCallOrder[0],
    );
    const [id, fields] = usersRepository.updateUser.mock.calls[0] as [
      number,
      Record<string, unknown>,
    ];
    expect(id).toBe(5);
    expect(fields).toMatchObject({
      telegramUserId: null,
      telegramLinkedAt: null,
      telegramUsername: null,
    });
    expect(fields.tipsGroupRemovedAt).toBeInstanceOf(Date);
  });

  it('fora do grupo ou Telegram recusando: desvincula sem marcar', async () => {
    for (const leave of [null, 'failed'] as const) {
      const { service, usersRepository } = setup(
        { id: 5, telegramUserId: 77 },
        leave,
      );
      await service.desvincularTelegram(5);

      const [, fields] = usersRepository.updateUser.mock.calls[0] as [
        number,
        Record<string, unknown>,
      ];
      expect(fields.telegramUserId).toBeNull();
      expect(fields).not.toHaveProperty('tipsGroupRemovedAt');
    }
  });
});

describe('UsersService.confirmTelegramLink', () => {
  const owner = (extra: Record<string, unknown> = {}) => ({
    id: 5,
    telegramLinkExpiresAt: new Date(Date.now() + 60_000),
    ...extra,
  });

  it('vinculou outro Telegram: o antigo sai do grupo', async () => {
    const atual = owner({ telegramUserId: '77' });
    const { service, usersRepository, tipsGroup } = setup(atual);

    await expect(
      service.confirmTelegramLink('123456', 88, 'novo'),
    ).resolves.toBe(atual);

    expect(usersRepository.linkTelegram).toHaveBeenCalledWith(5, 88, 'novo');
    expect(tipsGroup.leave).toHaveBeenCalledWith(atual, 'relinked');
  });

  it('primeiro vínculo, ou o mesmo Telegram: ninguém sai', async () => {
    // O pg devolve o BIGINT como string: "88" é o mesmo 88.
    for (const telegramUserId of [null, '88', 88]) {
      const { service, tipsGroup } = setup(owner({ telegramUserId }));
      await service.confirmTelegramLink('123456', 88);
      expect(tipsGroup.leave).not.toHaveBeenCalled();
    }
  });

  it('código vencido não vincula nem tira ninguém', async () => {
    const { service, usersRepository, tipsGroup } = setup(
      owner({
        telegramUserId: 77,
        telegramLinkExpiresAt: new Date(Date.now() - 1000),
      }),
    );
    await expect(service.confirmTelegramLink('123456', 88)).rejects.toThrow(
      'Código inválido',
    );
    expect(usersRepository.linkTelegram).not.toHaveBeenCalled();
    expect(tipsGroup.leave).not.toHaveBeenCalled();
  });
});

describe('UsersService.rejoinTipsGroup', () => {
  const emDia = {
    id: 5,
    isActive: true,
    accessUntil: new Date(Date.now() + DAY),
    tipsGroupRemovedAt: new Date(),
  };

  it('saiu do grupo e está em dia: manda o convite e limpa a marca', async () => {
    const { service, usersRepository, tipsGroup } = setup(undefined);
    await service.rejoinTipsGroup(emDia, 88);

    expect(tipsGroup.readmit).toHaveBeenCalledWith(
      88,
      emDia.accessUntil,
      '🔗 Telegram vinculado de novo.',
    );
    expect(usersRepository.updateUser).toHaveBeenCalledWith(5, {
      tipsGroupRemovedAt: null,
    });
  });

  it('convite que falha mantém a marca, pro painel oferecer "Convidar"', async () => {
    const { service, usersRepository, tipsGroup } = setup(undefined);
    tipsGroup.readmit.mockResolvedValue('failed');
    await service.rejoinTipsGroup(emDia, 88);
    expect(usersRepository.updateUser).not.toHaveBeenCalled();
  });

  it('vencido, desativado ou que nunca saiu: não convida', async () => {
    for (const user of [
      { ...emDia, accessUntil: new Date(Date.now() - DAY) },
      { ...emDia, isActive: false },
      { ...emDia, tipsGroupRemovedAt: null },
    ]) {
      const { service, tipsGroup } = setup(undefined);
      await service.rejoinTipsGroup(user, 88);
      expect(tipsGroup.readmit).not.toHaveBeenCalled();
    }
  });
});

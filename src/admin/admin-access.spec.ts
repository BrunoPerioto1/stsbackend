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

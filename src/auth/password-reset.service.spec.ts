import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PasswordResetService } from './password-reset.service';

function setup(user: Record<string, unknown> | undefined) {
  const usersRepository = {
    findByEmail: jest.fn().mockResolvedValue(user),
    updateUser: jest.fn().mockResolvedValue(undefined),
  };
  const bot = { telegram: { sendMessage: jest.fn().mockResolvedValue({}) } };
  const service = new PasswordResetService(usersRepository as any, bot as any);
  return { service, usersRepository, bot };
}

describe('Esqueci a senha pelo Telegram', () => {
  it('manda o código no privado do bot e guarda só o hash', async () => {
    const { service, usersRepository, bot } = setup({ id: 3, telegramUserId: 99, isActive: true });
    await service.request('a@b.com');

    const [chatId, text] = bot.telegram.sendMessage.mock.calls[0] as [number, string];
    expect(chatId).toBe(99);
    const code = /\*(\d{6})\*/.exec(text)?.[1] as string;
    const [, fields] = usersRepository.updateUser.mock.calls[0] as [number, { passwordResetCodeHash: string }];
    expect(fields.passwordResetCodeHash).not.toContain(code);
    await expect(bcrypt.compare(code, fields.passwordResetCodeHash)).resolves.toBe(true);
  });

  it('e-mail sem conta ou sem Telegram não manda nada (e não dá erro)', async () => {
    for (const user of [undefined, { id: 3, telegramUserId: null }]) {
      const { service, bot } = setup(user);
      await expect(service.request('x@y.com')).resolves.toBeUndefined();
      expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    }
  });

  it('código certo troca a senha e destrava o login', async () => {
    const { service, usersRepository } = setup({
      id: 3,
      passwordResetCodeHash: await bcrypt.hash('123456', 4),
      passwordResetExpiresAt: new Date(Date.now() + 60_000),
      passwordResetAttempts: 0,
    });
    await service.reset('a@b.com', '123456', 'nova-senha');
    const [, fields] = usersRepository.updateUser.mock.calls[0] as [number, Record<string, unknown>];
    expect(fields).toMatchObject({ passwordResetCodeHash: null, failedLoginAttempts: 0, lockedUntil: null });
    await expect(bcrypt.compare('nova-senha', fields.passwordHash as string)).resolves.toBe(true);
  });

  it('código errado conta tentativa; o quinto erro mata o código', async () => {
    const base = {
      id: 3,
      passwordResetCodeHash: await bcrypt.hash('123456', 4),
      passwordResetExpiresAt: new Date(Date.now() + 60_000),
    };
    const um = setup({ ...base, passwordResetAttempts: 0 });
    await expect(um.service.reset('a@b.com', '000000', 'x123456')).rejects.toBeInstanceOf(BadRequestException);
    expect(um.usersRepository.updateUser).toHaveBeenCalledWith(3, { passwordResetAttempts: 1 });

    const quinto = setup({ ...base, passwordResetAttempts: 4 });
    await expect(quinto.service.reset('a@b.com', '000000', 'x123456')).rejects.toBeInstanceOf(BadRequestException);
    expect(quinto.usersRepository.updateUser).toHaveBeenCalledWith(3, expect.objectContaining({ passwordResetCodeHash: null }));
  });

  it('código vencido é recusado sem comparar', async () => {
    const { service } = setup({
      id: 3,
      passwordResetCodeHash: await bcrypt.hash('123456', 4),
      passwordResetExpiresAt: new Date(Date.now() - 1000),
    });
    await expect(service.reset('a@b.com', '123456', 'nova-senha')).rejects.toBeInstanceOf(BadRequestException);
  });
});

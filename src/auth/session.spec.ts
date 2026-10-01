import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt/jwt.strategy';
import type { JwtPayload } from './jwt/jwt-payload';
import { sessionVersion } from './jwt/session-version';

process.env.JWT_SECRET = 'segredo-de-teste';

const DAY_SECONDS = 86_400;

async function setup() {
  const user = {
    id: 5,
    username: 'fulano',
    email: 'f@x.com',
    roleId: 3,
    isActive: true,
    accessUntil: null,
    lockedUntil: null,
    failedLoginAttempts: 0,
    passwordHash: await bcrypt.hash('senha-atual', 4),
  };
  // O que o banco tem agora: a troca de senha muda esta linha.
  const db = { user };
  const newHash = await bcrypt.hash('senha-nova', 4);
  const usersService = {
    findByEmail: jest.fn(async () => db.user),
    findById: jest.fn(async () => db.user),
    registerSuccessfulLogin: jest.fn(),
    registerFailedLogin: jest.fn(),
    setPassword: jest.fn(async () => {
      db.user = { ...db.user, passwordHash: newHash };
      return newHash;
    }),
  };
  const jwt = new JwtService({
    secret: 'segredo-de-teste',
    signOptions: { algorithm: 'HS256', expiresIn: '1d' },
  });
  const auth = new AuthService(usersService as any, jwt);
  const strategy = new JwtStrategy({
    findById: jest.fn(async () => db.user),
  } as any);
  const login = async (remember = false) => {
    const { access_token } = await auth.login({
      email: 'f@x.com',
      password: 'senha-atual',
      remember,
    });
    return jwt.decode<JwtPayload>(access_token);
  };
  return { auth, strategy, jwt, usersService, db, newHash, login };
}

describe('sessão presa à senha', () => {
  it('o token do login carrega a versão da senha atual', async () => {
    const { db, login } = await setup();
    const payload = await login();
    expect(payload.sv).toBe(sessionVersion(db.user.passwordHash));
    expect(payload.exp! - payload.iat!).toBe(DAY_SECONDS);
  });

  it('"Manter conectado" segue valendo 30 dias', async () => {
    const { login } = await setup();
    const payload = await login(true);
    expect(payload.exp! - payload.iat!).toBe(30 * DAY_SECONDS);
  });

  it('o token vale enquanto a senha é a mesma', async () => {
    const { strategy, login } = await setup();
    const payload = await login();
    await expect(strategy.validate(payload)).resolves.toMatchObject({
      userId: 5,
    });
  });

  it('trocar a senha derruba os tokens emitidos antes', async () => {
    const { auth, strategy, login } = await setup();
    const antigo = await login(true);

    await auth.changePassword(
      5,
      { currentPassword: 'senha-atual', newPassword: 'senha-nova' },
      antigo,
    );

    await expect(strategy.validate(antigo)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('quem trocou recebe um token novo, que vale e dura o mesmo que a sessão dele', async () => {
    const { auth, strategy, jwt, newHash, login } = await setup();
    const antigo = await login(true);

    const res = await auth.changePassword(
      5,
      { currentPassword: 'senha-atual', newPassword: 'senha-nova' },
      antigo,
    );

    const novo = jwt.decode<JwtPayload>(res.access_token);
    expect(novo.sv).toBe(sessionVersion(newHash));
    expect(novo.exp! - novo.iat!).toBe(30 * DAY_SECONDS);
    await expect(strategy.validate(novo)).resolves.toMatchObject({ userId: 5 });
  });

  it('token de antes da regra (sem a versão) não vale mais', async () => {
    const { strategy, login } = await setup();
    const { sv: _sv, ...legado } = await login();
    await expect(strategy.validate(legado)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('senha atual errada não troca nada', async () => {
    const { auth, usersService } = await setup();
    await expect(
      auth.changePassword(5, {
        currentPassword: 'errada',
        newPassword: 'senha-nova',
      }),
    ).rejects.toThrow('Senha atual incorreta');
    expect(usersService.setPassword).not.toHaveBeenCalled();
  });

  it('a versão muda com o hash e não expõe o hash', () => {
    const a = sessionVersion('$2b$10$hash-a');
    expect(a).not.toBe(sessionVersion('$2b$10$hash-b'));
    expect(a).not.toContain('hash-a');
    expect(sessionVersion('$2b$10$hash-a')).toBe(a);
  });
});

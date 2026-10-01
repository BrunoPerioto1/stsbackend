import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { assertAccess } from '../users/access';
import { ChangePasswordDTO, LoginDTO } from './dto/login.dto';
import type { JwtPayload } from './jwt/jwt-payload';
import { sessionVersion } from './jwt/session-version';
import * as bcrypt from 'bcrypt';

// Cinco erros seguidos travam a conta por quinze minutos. A contagem é por
// usuário e mora no banco: a API roda serverless, então um contador em memória
// (ou o @nestjs/throttler no padrão) zera junto com a instância e nunca chega a
// travar ninguém.
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

// "Manter conectado". Sem ele vale o padrão do módulo (1 dia).
const REMEMBER_SECONDS = 30 * 24 * 60 * 60;

type TokenUser = { id: number; username: string; email: string; roleId: number; passwordHash: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  // Único caminho pra trocar a senha, e pede a atual: com só o token, quem
  // pegasse a sessão aberta trocaria a senha e tomaria a conta.
  async changePassword(
    userId: number,
    dto: ChangePasswordDTO,
    session?: Pick<JwtPayload, 'iat' | 'exp'>,
  ) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('Usuário não encontrado');

    const isMatch = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isMatch) throw new UnauthorizedException('Senha atual incorreta');

    const passwordHash = await this.usersService.setPassword(userId, dto.newPassword);
    // A senha nova derruba todas as sessões, inclusive esta. Quem trocou
    // continua logado aqui com um token novo, da mesma duração (1 ou 30 dias).
    const lifetime = session?.iat && session.exp ? session.exp - session.iat : undefined;
    return { success: true, access_token: this.signToken({ ...user, passwordHash }, lifetime) };
  }

  private signToken(user: TokenUser, expiresInSeconds?: number) {
    // roleId no payload só pra UI; quem decide acesso é o AdminGuard, pelo banco.
    // O preço é a defasagem: quem for promovido/rebaixado carrega o papel
    // antigo até o token expirar (1d) ou relogar.
    const payload: JwtPayload = {
      name: user.username,
      email: user.email,
      userId: user.id,
      roleId: user.roleId,
      sv: sessionVersion(user.passwordHash),
    };
    return this.jwtService.sign(payload, expiresInSeconds ? { expiresIn: expiresInSeconds } : undefined);
  }

  async login(loginDTO: LoginDTO) {
    const user = await this.usersService.findByEmail(loginDTO.email);

    // E-mail que não existe sai pelo mesmo erro genérico da senha errada.
    if (!user) {
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }

    const lockedUntil = user.lockedUntil ? new Date(user.lockedUntil) : null;
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      throw new HttpException(
        {
          message: 'Muitas tentativas. Tente novamente mais tarde.',
          lockedUntil: lockedUntil.toISOString(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const isMatch = await bcrypt.compare(loginDTO.password, user.passwordHash);
    if (!isMatch) {
      // Um bloqueio vencido volta do zero — só o que veio depois dele conta.
      const previous = lockedUntil ? 0 : user.failedLoginAttempts;
      const attempts = previous + 1;

      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        const until = new Date(Date.now() + LOCK_MINUTES * 60_000);
        await this.usersService.registerFailedLogin(user.id, 0, until);
        throw new HttpException(
          {
            message: `Muitas tentativas. Tente de novo em ${LOCK_MINUTES} minutos.`,
            lockedUntil: until.toISOString(),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Mesma resposta do e-mail inexistente. Devolver `attemptsLeft` aqui
      // (e só aqui) confirmava a quem testava que o e-mail estava cadastrado.
      await this.usersService.registerFailedLogin(user.id, attempts, null);
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }

    // Depois da senha: vencimento/desativação só é revelado a quem é dono da conta.
    assertAccess(user);

    await this.usersService.registerSuccessfulLogin(user.id);

    return {
      // "Manter conectado" vale 30 dias; sem ele, 1 dia (o padrão do módulo).
      access_token: this.signToken(user, loginDTO.remember ? REMEMBER_SECONDS : undefined),
    };
  }
}

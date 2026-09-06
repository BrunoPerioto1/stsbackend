import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { ChangePasswordDTO, LoginDTO } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

// Cinco erros seguidos travam a conta por quinze minutos. A contagem é por
// usuário e mora no banco: a API roda serverless, então um contador em memória
// (ou o @nestjs/throttler no padrão) zera junto com a instância e nunca chega a
// travar ninguém.
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  // Trocar a senha pede a senha atual: o PATCH /users/me aceita `password` e
  // só exige o token, então quem pegasse a sessão aberta trocaria a senha sem
  // saber a antiga e tomaria a conta.
  async changePassword(userId: number, dto: ChangePasswordDTO) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('Usuário não encontrado');

    const isMatch = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isMatch) throw new UnauthorizedException('Senha atual incorreta');

    await this.usersService.updateMe(userId, { password: dto.newPassword });
    return { success: true };
  }

  async login(loginDTO: LoginDTO) {
    const user = await this.usersService.findByEmail(loginDTO.email);

    // E-mail que não existe sai pelo erro genérico, sem `attemptsLeft`: a
    // contagem só faz sentido pra uma conta real, e devolvê-la aqui diria a
    // quem está tentando que o e-mail existe.
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

      await this.usersService.registerFailedLogin(user.id, attempts, null);
      throw new UnauthorizedException({
        message: 'E-mail ou senha incorretos',
        attemptsLeft: MAX_LOGIN_ATTEMPTS - attempts,
      });
    }

    await this.usersService.registerSuccessfulLogin(user.id);

    const payload = {
      name: user.username,
      email: user.email,
      userId: user.id,
    };

    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}

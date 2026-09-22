import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UsersRepository } from '../../infra/repository/users.repository';
import type { UserId } from '../../db_types/Users';

// roles.id = 1, permissions ["*"]. Um número em vez de ler
// `roles.permissions`: existe um nível de acesso, não um sistema de permissões.
// Quando existir um segundo, aí vale generalizar.
export const ADMIN_ROLE_ID = 1;

/**
 * Sempre depois do AuthGuard('jwt') no mesmo @UseGuards — este guard não
 * autentica, só pega o userId do `req.user` que o Passport já montou.
 *
 * O papel vem do banco, não do payload do JWT: o token vale 1d, e um admin
 * rebaixado (ou desativado) continuaria admin até ele expirar. Custa um
 * SELECT por PK por request de admin — tela de manutenção, poucas chamadas.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly usersRepository: UsersRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest();
    const current = user?.userId ? await this.usersRepository.findById(user.userId as UserId) : undefined;
    if (current?.roleId !== ADMIN_ROLE_ID || current.isActive === false) {
      throw new ForbiddenException('Acesso restrito ao administrador');
    }
    return true;
  }
}

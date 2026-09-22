import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

// roles.id = 1, permissions ["*"]. Um número em vez de ler
// `roles.permissions`: existe um nível de acesso, não um sistema de permissões.
// Quando existir um segundo, aí vale generalizar.
export const ADMIN_ROLE_ID = 1;

/**
 * Sempre depois do AuthGuard('jwt') no mesmo @UseGuards — este guard não
 * autentica, só lê o `req.user` que o Passport já montou.
 *
 * Token emitido antes do roleId entrar no payload não tem o campo e cai no 403.
 * É o lado certo pra errar: o token expira em 1d e o relogin resolve.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (user?.roleId !== ADMIN_ROLE_ID) {
      throw new ForbiddenException('Acesso restrito ao administrador');
    }
    return true;
  }
}

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Rotas chamadas por agendador (cron da Vercel, job do GitHub Actions), não
 * por usuário. Os dois mandam `Authorization: Bearer <CRON_SECRET>`. Sem a
 * env definida a rota fica fechada — nunca aberta por esquecimento.
 */
@Injectable()
export class CronGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = process.env.CRON_SECRET;
    const auth = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>()
      .headers.authorization;
    if (!secret || auth !== `Bearer ${secret}`) throw new UnauthorizedException();
    return true;
  }
}

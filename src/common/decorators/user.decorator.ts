import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '../../auth/jwt/jwt-payload';

// `@User()` devolve o payload do JWT; `@User('userId')` só o campo. Os
// controllers liam `req.user` na mão, sem tipo.
export const User = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>().user;
    return data ? user?.[data] : user;
  },
);

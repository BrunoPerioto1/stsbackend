// O que vai no token (AuthService.login) e volta em `req.user` depois do
// JwtStrategy.validate. Quem decide acesso é o banco; isto só identifica.
export interface JwtPayload {
  userId: number;
  email: string;
  name: string;
  roleId: number;
  iat?: number;
  exp?: number;
}

import { createHmac } from 'crypto';

/**
 * Versão da sessão: muda quando a senha muda. Vai no JWT (`sv`) e o
 * JwtStrategy compara com a da senha atual a cada request — trocar a senha, ou
 * redefinir pelo bot, derruba os tokens emitidos antes, inclusive os de 30
 * dias do "Manter conectado". Antes eles valiam até expirar.
 *
 * Sai do hash da senha em vez de uma coluna: não precisa de migration, e
 * qualquer troca do hash (até uma feita direto no banco) já conta. HMAC com o
 * JWT_SECRET porque o valor fica legível no token: sem o segredo, ele não diz
 * nada sobre o hash.
 */
export function sessionVersion(passwordHash: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não definido');
  return createHmac('sha256', secret)
    .update(`session:${passwordHash}`)
    .digest('base64url')
    .slice(0, 22);
}

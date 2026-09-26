import { createHmac, timingSafeEqual } from 'crypto';

// Token curto que a resposta 402 entrega pra tela de renovação. A tela não tem
// sessão válida (quem venceu não recebe JWT), e sem isso não saberia de quem é
// o PIX nem quem apertou "Já paguei". Assinado com o JWT_SECRET, vale 1 dia e
// só serve pra essas duas coisas.
const TTL_MS = 86_400_000;

function sign(body: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não definido');
  return createHmac('sha256', secret).update(`pay:${body}`).digest('base64url');
}

export function createPayToken(userId: number, now = Date.now()): string {
  const body = `${userId}.${now + TTL_MS}`;
  return `${body}.${sign(body)}`;
}

/** userId do token, ou null se for inválido/vencido. */
export function readPayToken(token: string | undefined | null, now = Date.now()): number | null {
  const [id, exp, sig] = (token ?? '').split('.');
  if (!id || !exp || !sig) return null;
  const expected = sign(`${id}.${exp}`);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  if (!(Number(exp) > now)) return null;
  const userId = Number(id);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

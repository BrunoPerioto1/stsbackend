// Endereço público do front. Vem de env pra mensagem do bot não ficar presa no
// domínio da Vercel; o padrão é o de produção de hoje.
const DEFAULT_FRONT_URL = 'https://stsfront.vercel.app';

export function frontUrl(path = ''): string {
  const base = (process.env.FRONT_URL || DEFAULT_FRONT_URL).replace(/\/+$/, '');
  return `${base}${path}`;
}

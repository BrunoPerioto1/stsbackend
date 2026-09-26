import { frontUrl } from './front-url';

// Portas do Vite (dev e preview) pra rodar o front local contra a API local.
const DEV_ORIGINS = ['http://localhost:8080', 'http://localhost:4173', 'http://localhost:5173'];

/**
 * Origens que o navegador pode usar pra chamar a API. Antes era qualquer uma:
 * uma página de terceiro conseguia ler as respostas de quem estivesse logado.
 * CORS_ORIGINS (lista separada por vírgula) substitui o padrão; sem ela, vale
 * o FRONT_URL de produção e o localhost fora de produção.
 */
export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (configured.length) return configured;
  const front = frontUrl();
  return env.NODE_ENV === 'production' ? [front] : [front, ...DEV_ORIGINS];
}

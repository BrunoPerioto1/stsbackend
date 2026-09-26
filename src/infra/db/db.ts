import { defaults, Pool, types, type PoolConfig } from 'pg';

// As colunas são TIMESTAMP sem fuso guardando instante UTC. O pg lia e gravava
// essas colunas no fuso da máquina: na Vercel (UTC) batia, rodando local (UTC-3)
// tudo andava 3h — a aposta gravada às 12h voltava 09h. Fixa UTC nos dois
// sentidos, em qualquer máquina, sem depender de TZ no ambiente.
const TIMESTAMP_OID = 1114;
types.setTypeParser(TIMESTAMP_OID, (value: string) => new Date(`${value.replace(' ', 'T')}Z`));
defaults.parseInputDatesAsUTC = true;

/**
 * SSL do pool. O Supabase aceita conexão sem SSL, e sem PGSSLMODE a senha e os
 * dados trafegavam abertos. Agora:
 *  - banco local (localhost) sem configuração: sem SSL;
 *  - DB_SSL=disable: sem SSL (explícito);
 *  - DB_SSL_CA_BASE64 (certificado do painel do Supabase, em base64): SSL
 *    verificando o servidor — o jeito certo;
 *  - qualquer outro caso: SSL sem verificar o certificado. A CA do Supabase
 *    não está no Node, então verificar sem ela derruba a conexão; criptografar
 *    já tira a senha do texto aberto.
 */
export function sslConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig['ssl'] {
  const mode = (env.DB_SSL ?? env.PGSSLMODE ?? '').toLowerCase();
  if (mode === 'disable' || mode === 'false') return false;

  const caBase64 = env.DB_SSL_CA_BASE64;
  if (caBase64) return { ca: Buffer.from(caBase64, 'base64').toString('utf8') };
  if (mode === 'verify-full' || mode === 'verify-ca') return true;

  const host = (env.DB_HOST ?? '').toLowerCase();
  const local = !host || host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (local && !mode) return false;
  return { rejectUnauthorized: false };
}

// Criado quando o módulo do banco sobe (não no import do arquivo), depois que
// o .env já foi carregado e validado.
export function createPool(): Pool {
  return new Pool({
    user: process.env.DB_USER || '',
    host: process.env.DB_HOST || '',
    database: process.env.DB_NAME || '',
    password: process.env.DB_PASSWORD || '',
    port: Number(process.env.DB_PORT) || 5432,
    ssl: sslConfig(),
  });
}

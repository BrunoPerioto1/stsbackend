import { types } from 'pg';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prepareValue } = require('pg/lib/utils') as { prepareValue: (value: unknown) => string };
import { sslConfig } from './db';

describe('pool: fuso das colunas TIMESTAMP', () => {
  it('lê TIMESTAMP como UTC, qualquer que seja o fuso da máquina', () => {
    const parse = types.getTypeParser(1114, 'text') as (value: string) => Date;
    expect(parse('2026-09-25 12:00:00').toISOString()).toBe('2026-09-25T12:00:00.000Z');
    expect(parse('2026-09-25 12:00:00.123456').toISOString()).toBe('2026-09-25T12:00:00.123Z');
  });

  it('grava Date como UTC (o Postgres ignora o offset numa coluna sem fuso)', () => {
    expect(prepareValue(new Date('2026-09-25T12:00:00Z'))).toMatch(/^2026-09-25T12:00:00\.000\+00:00$/);
  });
});

describe('pool: SSL', () => {
  it('banco local sem configuração fica sem SSL', () => {
    expect(sslConfig({ DB_HOST: 'localhost' })).toBe(false);
  });

  it('host remoto sempre criptografa, mesmo sem PGSSLMODE', () => {
    expect(sslConfig({ DB_HOST: 'aws-0.pooler.supabase.com' })).toEqual({ rejectUnauthorized: false });
  });

  it('com a CA do Supabase, verifica o servidor', () => {
    const ca = '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----';
    expect(sslConfig({ DB_HOST: 'x.supabase.com', DB_SSL_CA_BASE64: Buffer.from(ca).toString('base64') })).toEqual({ ca });
  });

  it('DB_SSL=disable desliga explicitamente', () => {
    expect(sslConfig({ DB_HOST: 'x.supabase.com', DB_SSL: 'disable' })).toBe(false);
  });
});

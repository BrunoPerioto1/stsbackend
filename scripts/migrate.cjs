// Aplica as migrations de src/infra/db/migrations em ordem de nome e registra
// cada uma em schema_migrations. Antes não havia controle: quem subia um banco
// não sabia o que já tinha rodado.
//
//   npm run db:migrate                 aplica as pendentes
//   npm run db:migrate -- --dry-run    só lista as pendentes
//   npm run db:migrate -- --baseline <arquivo>
//       marca como aplicadas (sem rodar) todas até <arquivo>, inclusive.
//       Uma vez, num banco que já tinha as migrations aplicadas à mão.
//   npm run db:setup                   banco novo: schema.sql + todas as migrations
//
// Cada arquivo tem o próprio BEGIN/COMMIT; falhou um, para ali.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DIR = path.join(__dirname, '..', 'src', 'infra', 'db', 'migrations');
const SCHEMA = path.join(__dirname, '..', 'src', 'infra', 'db', 'schema.sql');

// Mesma regra do pool da API (src/infra/db/db.ts).
function ssl() {
  const mode = (process.env.DB_SSL || process.env.PGSSLMODE || '').toLowerCase();
  if (mode === 'disable' || mode === 'false') return false;
  if (process.env.DB_SSL_CA_BASE64)
    return { ca: Buffer.from(process.env.DB_SSL_CA_BASE64, 'base64').toString('utf8') };
  if (mode === 'verify-full' || mode === 'verify-ca') return true;
  const host = (process.env.DB_HOST || '').toLowerCase();
  if ((!host || host === 'localhost' || host === '127.0.0.1' || host === '::1') && !mode) return false;
  return { rejectUnauthorized: false };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const withSchema = args.includes('--schema');
  const baselineAt = args.indexOf('--baseline');
  const baseline = baselineAt >= 0 ? args[baselineAt + 1] : null;
  if (baselineAt >= 0 && !baseline) throw new Error('--baseline pede o nome do último arquivo já aplicado.');

  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  if (baseline && !files.includes(baseline)) throw new Error(`Arquivo não encontrado: ${baseline}`);

  const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT) || 5432,
    ssl: ssl(),
  });
  await client.connect();
  try {
    if (withSchema && !dryRun) {
      await client.query(fs.readFileSync(SCHEMA, 'utf8'));
      console.log('[MIGRATE] schema.sql aplicado');
    }
    // Dry-run não escreve nada, nem a tabela de controle.
    const exists = (await client.query("SELECT to_regclass('public.schema_migrations') AS t")).rows[0].t;
    if (!exists && !dryRun) {
      await client.query(`CREATE TABLE schema_migrations (
        name VARCHAR(200) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    }
    const applied = new Set(
      exists || !dryRun ? (await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name) : [],
    );

    if (baseline) {
      const marked = files.filter((f) => f <= baseline && !applied.has(f));
      for (const name of marked) {
        if (!dryRun) await client.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
        console.log(`[MIGRATE] baseline ${name}`);
      }
      console.log(`[MIGRATE] ${marked.length} marcadas como aplicadas${dryRun ? ' (dry-run)' : ''}`);
      return;
    }

    const pending = files.filter((f) => !applied.has(f));
    if (!pending.length) return console.log('[MIGRATE] nada pendente');
    for (const name of pending) {
      if (dryRun) {
        console.log(`[MIGRATE] pendente ${name}`);
        continue;
      }
      const startedAt = Date.now();
      await client.query(fs.readFileSync(path.join(DIR, name), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      console.log(`[MIGRATE] aplicada ${name} (${Date.now() - startedAt} ms)`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[MIGRATE] falhou:', error.message);
  process.exitCode = 1;
});

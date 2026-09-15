// Liga os jogos das múltiplas de vários jogos AINDA PENDENTES aos eventos do
// cache (bet_events), pra liquidação automática olhar cada perna.
//
// Só dá pra casar o que sport_events ainda tem: o coletor apaga o jogo 2 dias
// depois que ele acontece. Aposta nova já grava bet_events na criação; isto é
// só pras que nasceram antes da migration.
//
// Uso (depois de `npm run build`):
//   node scripts/backfill-bet-events.cjs           -> só mostra o que faria
//   node scripts/backfill-bet-events.cjs --apply   -> grava
//
// Exige a migration src/infra/db/migrations/20260915_bet_events.sql pra --apply.

require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const {
  createMatchCache,
  extractConfrontos,
  matchEvents,
} = require('../dist/bet/event-matching.js');

const APPLY = process.argv.includes('--apply');

async function main() {
  const db = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT) || 5432,
  });
  await db.connect();
  try {
    const { rows: [{ existe }] } = await db.query(
      `SELECT to_regclass('public.bet_events') IS NOT NULL AS existe`,
    );
    if (APPLY && !existe) throw new Error('tabela bet_events não existe: aplique a migration antes');

    const { rows: candidatos } = await db.query(`
      SELECT provider, external_id AS "externalId", sport, start_at AS "startAt",
             home_name AS "homeName", home_short AS "homeShort", home_code AS "homeCode",
             away_name AS "awayName", away_short AS "awayShort", away_code AS "awayCode"
        FROM sport_events`);

    const { rows: apostas } = await db.query(`
      SELECT b.id, b.game, b.market, b.sport
        FROM bets b
        JOIN bet_results br ON br.bet_id = b.id
       WHERE br.result_id = 9
         ${existe ? 'AND NOT EXISTS (SELECT 1 FROM bet_events be WHERE be.bet_id = b.id)' : ''}
       ORDER BY b.id`);

    const cache = createMatchCache();
    const linhas = [];
    let multiplas = 0;
    for (const aposta of apostas) {
      if (extractConfrontos(aposta.game, aposta.market).length < 2) continue;
      multiplas += 1;
      const confrontos = matchEvents(aposta.game, aposta.market, candidatos, aposta.sport, cache);
      const casados = confrontos.filter((c) => c.match);
      console.log(
        `#${aposta.id} ${casados.length}/${confrontos.length} jogos: ` +
          confrontos.map((c) => `${c.confronto} -> ${c.match ? c.match.externalId : '—'}`).join(' | '),
      );
      for (const { position, confronto, match } of casados) {
        linhas.push([aposta.id, position, confronto, match.provider, match.externalId, match.startAt, match.confidence]);
      }
    }

    console.log(`\n${multiplas} múltiplas pendentes, ${linhas.length} jogos casados`);
    if (!APPLY) {
      console.log('simulação: nada gravado (use --apply)');
      return;
    }

    await db.query('BEGIN');
    for (const linha of linhas) {
      await db.query(
        `INSERT INTO bet_events (bet_id, position, confronto, provider, external_id, start_at, match_confidence)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (bet_id, position) DO NOTHING`,
        linha,
      );
    }
    await db.query('COMMIT');
    console.log(`${linhas.length} linhas gravadas em bet_events`);
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

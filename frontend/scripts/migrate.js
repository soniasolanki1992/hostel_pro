#!/usr/bin/env node
/**
 * SQL migration runner.
 *
 * Reads `sql/*.sql` from the repo root in alphabetical order and applies any
 * file whose name is not yet recorded in the `schema_migrations` table.
 *
 * Usage (run from the `frontend/` folder):
 *   npm run migrate
 *   npm run migrate:status
 *   node scripts/migrate.js --only=005_alumni_schema.sql
 *   node scripts/migrate.js --only=005_alumni_schema.sql --force
 *   node scripts/migrate.js --mark-applied=005_alumni_schema.sql,006_workflow_statuses.sql
 *
 * Notes:
 * - Files are NOT wrapped in BEGIN/COMMIT. Some migrations use
 *   `ALTER TYPE ... ADD VALUE` which Postgres restricts inside transactions.
 *   Each .sql file is responsible for its own atomicity.
 * - Reads DATABASE_URL from process env first, falling back to ../.env.local.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

loadEnvFile(path.join(__dirname, '..', '.env.local'));

const SQL_DIR = path.resolve(__dirname, '..', '..', 'sql');

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set (checked env and frontend/.env.local).');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedSet(client) {
  const { rows } = await client.query('SELECT filename FROM schema_migrations');
  return new Set(rows.map((r) => r.filename));
}

function listSqlFiles() {
  if (!fs.existsSync(SQL_DIR)) {
    throw new Error(`SQL directory not found: ${SQL_DIR}`);
  }
  return fs
    .readdirSync(SQL_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function runMigration(client, file) {
  const fullPath = path.join(SQL_DIR, file);
  const sql = fs.readFileSync(fullPath, 'utf8');
  console.log(`\n→ Applying ${file} ...`);
  await client.query(sql);
  await client.query(
    'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
    [file],
  );
  console.log(`✓ ${file}`);
}

async function main() {
  const args = process.argv.slice(2);
  const onlyArg = args.find((a) => a.startsWith('--only='));
  const markArg = args.find((a) => a.startsWith('--mark-applied='));
  const force = args.includes('--force');
  const showStatus = args.includes('--status');
  const target = onlyArg ? onlyArg.split('=')[1] : null;
  const markTargets = markArg ? markArg.split('=')[1].split(',') : null;

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    if (markTargets) {
      for (const f of markTargets) {
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
          [f],
        );
        console.log(`marked ${f} as applied (without running)`);
      }
      return;
    }

    const applied = await appliedSet(client);
    const all = listSqlFiles();

    if (showStatus) {
      console.log('Applied:');
      const appliedFiles = all.filter((f) => applied.has(f));
      if (appliedFiles.length === 0) console.log('  (none)');
      else appliedFiles.forEach((f) => console.log(`  ✓ ${f}`));
      console.log('\nPending:');
      const pending = all.filter((f) => !applied.has(f));
      if (pending.length === 0) console.log('  (none)');
      else pending.forEach((f) => console.log(`  • ${f}`));
      return;
    }

    const todo = (target ? all.filter((f) => f === target) : all).filter(
      (f) => force || !applied.has(f),
    );

    if (target && todo.length === 0 && !force) {
      console.log(
        `Nothing to do — ${target} already applied. Pass --force to re-run.`,
      );
      return;
    }
    if (todo.length === 0) {
      console.log('All migrations already applied. Nothing to do.');
      return;
    }

    console.log(`Will apply ${todo.length} migration(s):`);
    todo.forEach((f) => console.log(`  • ${f}`));

    for (const file of todo) {
      if (force && applied.has(file)) {
        await client.query(
          'DELETE FROM schema_migrations WHERE filename = $1',
          [file],
        );
      }
      await runMigration(client, file);
    }

    console.log('\nMigrations complete.');
  } catch (err) {
    console.error('\nMigration failed:', err.message);
    if (err.detail) console.error('  detail:', err.detail);
    if (err.hint) console.error('  hint:', err.hint);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

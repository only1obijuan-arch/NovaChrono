/**
 * Database migration runner.
 *
 * Usage:
 *   node scripts/migrate.js           # apply all pending migrations
 *   node scripts/migrate.js --status  # show which migrations have been applied
 *
 * Requires DATABASE_URL in the environment (or a .env.local file).
 *
 * Convention: migration files live in migrations/ and are named
 *   NNNN_description.sql  (e.g. 0001_initial.sql, 0002_add_push_token.sql)
 * They are applied in lexicographic order, each inside its own transaction.
 * Applied migrations are recorded in the schema_migrations table.
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Bootstrap env from .env.local if present (no dotenv dependency needed)
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvFile(filePath) {
  try {
    const lines = readFileSync(filePath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // file doesn't exist — ignore
  }
}

loadEnvFile(join(root, ".env.local"));
loadEnvFile(join(root, ".env"));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Split a SQL script into individual statements, handling dollar-quoted blocks
 * (e.g. DO $$ ... $$) so that the closing $$ is never mistaken for a statement
 * terminator, and stripping single-line comments so that semicolons inside
 * comments never trigger a false split.
 */
export function splitStatements(sql) {
  const out = [];
  let buf = "";
  let i = 0;
  let dollarTag = null;

  while (i < sql.length) {
    // Inside a dollar-quoted block — only watch for the matching closing tag
    if (dollarTag !== null) {
      if (sql.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
      } else {
        buf += sql[i++];
      }
      continue;
    }

    // Strip single-line comments (advance past them without adding to buf)
    if (sql[i] === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }

    // Dollar-quote open: $$ or $tag$
    const dm = sql.slice(i).match(/^\$[A-Za-z_0-9]*\$/);
    if (dm) {
      dollarTag = dm[0];
      buf += dollarTag;
      i += dollarTag.length;
      continue;
    }

    // Statement terminator
    if (sql[i] === ";") {
      buf += ";";
      const stmt = buf.trim();
      if (stmt !== ";") out.push(stmt);
      buf = "";
      i++;
      continue;
    }

    buf += sql[i++];
  }

  // Trailing content without a terminating semicolon (shouldn't normally occur)
  const tail = buf.trim();
  if (tail) out.push(tail);

  // Drop any entries that are only whitespace
  return out.filter((s) => /\S/.test(s));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         SERIAL      PRIMARY KEY,
      name       TEXT        NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getApplied(client) {
  const { rows } = await client.query(
    "SELECT name FROM schema_migrations ORDER BY id"
  );
  return new Set(rows.map((r) => r.name));
}

export const GATE4A_MIGRATION = "0008_gate4a_league_operations.sql";
export const INCOMPLETE_GATE4A_MESSAGE = "old/incomplete 0008 detected; forward repair migration required";

export async function assertGate4aCompatibility(client, applied) {
  if (!applied.has(GATE4A_MIGRATION)) return;

  const { rows } = await client.query(`
    SELECT
      to_regprocedure('public.nova_planned_date(date)') IS NOT NULL AS date_function,
      to_regprocedure('public.nova_planned_date(timestamp with time zone)') IS NOT NULL AS timestamptz_function,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'matches'
          AND column_name = 'result_type'
          AND is_nullable = 'NO'
          AND column_default ILIKE '%played%'
      ) AS result_type_column,
      EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = to_regclass('public.matches')
          AND conname = 'matches_result_type_check'
          AND convalidated
          AND pg_get_constraintdef(oid) ILIKE '%played%'
          AND pg_get_constraintdef(oid) ILIKE '%forfeit_home_win%'
          AND pg_get_constraintdef(oid) ILIKE '%forfeit_away_win%'
      ) AS result_type_constraint,
      to_regclass('public.matches_active_schedule_lookup') IS NOT NULL
        AND pg_get_indexdef(to_regclass('public.matches_active_schedule_lookup')) ILIKE '%nova_planned_date%'
        AND pg_get_indexdef(to_regclass('public.matches_active_schedule_lookup')) ILIKE '%time_slot%'
        AND pg_get_indexdef(to_regclass('public.matches_active_schedule_lookup')) ILIKE '%field_number%'
        AND pg_get_indexdef(to_regclass('public.matches_active_schedule_lookup')) ILIKE '%league_id%'
        AND pg_get_indexdef(to_regclass('public.matches_active_schedule_lookup')) ILIKE '%scheduled%'
        AND pg_get_indexdef(to_regclass('public.matches_active_schedule_lookup')) ILIKE '%live%'
        AS schedule_index,
      to_regclass('public.matches_active_referee_schedule_lookup') IS NOT NULL
        AND pg_get_indexdef(to_regclass('public.matches_active_referee_schedule_lookup')) ILIKE '%nova_planned_date%'
        AND pg_get_indexdef(to_regclass('public.matches_active_referee_schedule_lookup')) ILIKE '%referee_id%'
        AND pg_get_indexdef(to_regclass('public.matches_active_referee_schedule_lookup')) ILIKE '%time_slot%'
        AND pg_get_indexdef(to_regclass('public.matches_active_referee_schedule_lookup')) ILIKE '%scheduled%'
        AND pg_get_indexdef(to_regclass('public.matches_active_referee_schedule_lookup')) ILIKE '%live%'
        AS referee_index
  `);
  const state = rows[0] ?? {};
  if (!Object.values(state).every(Boolean)) {
    throw new Error(INCOMPLETE_GATE4A_MESSAGE);
  }
}

export async function getAppliedReadOnly(client) {
  const { rows: relationRows } = await client.query(
    "SELECT to_regclass('public.schema_migrations') AS relation"
  );

  if (!relationRows[0]?.relation) return new Set();
  return getApplied(client);
}

export function getMigrationFiles() {
  const dir = join(root, "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export async function run({
  showStatus = false,
  connectionString = process.env.DATABASE_URL,
  logger = console,
  poolFactory = async (options) => {
    const packageName = process.env.DATABASE_DRIVER === "pg"
      ? "pg"
      : "@neondatabase/serverless";
    const { Pool } = await import(packageName);
    return new Pool(options);
  },
} = {}) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  const pool = await poolFactory({ connectionString });
  const client = await pool.connect();
  try {
    const files = getMigrationFiles();

    if (showStatus) {
      const applied = await getAppliedReadOnly(client);
      await assertGate4aCompatibility(client, applied);
      logger.log("\nMigration status:");
      for (const f of files) {
        const mark = applied.has(f) ? "✓" : "○";
        logger.log(`  ${mark}  ${f}`);
      }
      logger.log();
      return;
    }

    await ensureMigrationsTable(client);
    const applied = await getApplied(client);
    await assertGate4aCompatibility(client, applied);
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      logger.log("No pending migrations.");
      return;
    }

    for (const file of pending) {
      const sql = readFileSync(join(root, "migrations", file), "utf8");
      logger.log(`Applying ${file} …`);
      await client.query("BEGIN");
      try {
        const stmts = splitStatements(sql);
        for (const stmt of stmts) {
          await client.query(stmt);
        }
        await client.query(
          "INSERT INTO schema_migrations (name) VALUES ($1)",
          [file]
        );
        await client.query("COMMIT");
        logger.log(`  ✓ done (${stmts.length} statements)`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${err.message}`, { cause: err });
      }
    }

    logger.log(`\n${pending.length} migration(s) applied.`);
  } finally {
    client.release();
    await pool.end();
  }
}

const invokedDirectly = process.argv[1]
  ? resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
  : false;

if (invokedDirectly) {
  run({ showStatus: process.argv.includes("--status") }).catch((err) => {
    console.error(`ERROR: ${err.message}`);
    process.exitCode = 1;
  });
}

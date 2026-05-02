#!/usr/bin/env node
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
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Pool } from "@neondatabase/serverless";

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
function splitStatements(sql) {
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
const showStatus = process.argv.includes("--status");

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

function getMigrationFiles() {
  const dir = join(root, "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function run() {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getApplied(client);
    const files = getMigrationFiles();

    if (showStatus) {
      console.log("\nMigration status:");
      for (const f of files) {
        const mark = applied.has(f) ? "✓" : "○";
        console.log(`  ${mark}  ${f}`);
      }
      console.log();
      return;
    }

    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log("No pending migrations.");
      return;
    }

    for (const file of pending) {
      const sql = readFileSync(join(root, "migrations", file), "utf8");
      console.log(`Applying ${file} …`);
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
        console.log(`  ✓ done (${stmts.length} statements)`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`  ✗ failed: ${err.message}`);
        process.exit(1);
      }
    }

    console.log(`\n${pending.length} migration(s) applied.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

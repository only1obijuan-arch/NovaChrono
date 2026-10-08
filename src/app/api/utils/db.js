import { Pool as NeonPool } from "@neondatabase/serverless";
import pg from "pg";

const { Pool: NodePostgresPool } = pg;

// Singleton pool for the entire process. Neon remains the production default;
// the standard PostgreSQL driver is opt-in for local migration/E2E databases.
//
// The `globalThis` guard prevents Next.js HMR from creating a fresh Pool
// on every hot-reload in development. In production the module is loaded
// once so the guard is a no-op, but it doesn't hurt.
const globalForDb = globalThis;

if (!globalForDb._novaPool) {
  const Pool = process.env.DATABASE_DRIVER === "pg" ? NodePostgresPool : NeonPool;
  globalForDb._novaPool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
}

export const pool = globalForDb._novaPool;

// Tagged-template sql helper — same call signature as the neon() HTTP client
// so all existing  sql`SELECT ...`  queries work without changes.
// Uses the shared pool so only one connection mechanism is active.
export async function sql(strings, ...values) {
  let text = "";
  const params = [];
  strings.forEach((string, i) => {
    text += string;
    if (i < values.length) {
      params.push(values[i]);
      text += `$${params.length}`;
    }
  });
  const { rows } = await pool.query(text, params);
  return rows;
}

// Runs `fn(txSql)` inside a single database transaction.
// `txSql` is a tagged-template helper bound to the checked-out client so
// every query in the callback shares the same connection and therefore the
// same BEGIN/COMMIT scope.  On any throw the transaction is rolled back and
// the error is re-thrown to the caller.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    function txSql(strings, ...values) {
      let text = "";
      const params = [];
      strings.forEach((string, i) => {
        text += string;
        if (i < values.length) {
          params.push(values[i]);
          text += `$${params.length}`;
        }
      });
      return client.query(text, params).then((r) => r.rows);
    }

    const result = await fn(txSql);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

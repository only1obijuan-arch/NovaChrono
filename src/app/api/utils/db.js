import { Pool } from "@neondatabase/serverless";

// Singleton pool — one WebSocket connection pool for the entire process.
//
// The `globalThis` guard prevents Next.js HMR from creating a fresh Pool
// on every hot-reload in development. In production the module is loaded
// once so the guard is a no-op, but it doesn't hurt.
const globalForDb = globalThis;

if (!globalForDb._neonPool) {
  globalForDb._neonPool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
}

export const pool = globalForDb._neonPool;

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

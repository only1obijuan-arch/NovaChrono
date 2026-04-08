import { pool } from "./db";

export async function rateLimit(identifier, { max = 5, windowMinutes = 15 } = {}) {
  const now = new Date();
  const window = new Date(now.getTime() - windowMinutes * 60 * 1000);

  await pool.query(
    `DELETE FROM api_rate_limits WHERE identifier = $1 AND created_at < $2`,
    [identifier, window]
  );

  const result = await pool.query(
    `SELECT COUNT(*) FROM api_rate_limits WHERE identifier = $1`,
    [identifier]
  );

  const count = parseInt(result.rows[0].count);
  if (count >= max) {
    return { allowed: false };
  }

  await pool.query(
    `INSERT INTO api_rate_limits (identifier, created_at) VALUES ($1, $2)`,
    [identifier, now]
  );

  return { allowed: true };
}

import { pool } from "./db";

export async function rateLimit(identifier, { max = 5, windowMinutes = 15 } = {}) {
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  const result = await pool.query(
    `INSERT INTO api_rate_limits (identifier, window_start, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (identifier, window_start)
     DO UPDATE SET count = api_rate_limits.count + 1
     RETURNING count`,
    [identifier, windowStart]
  );

  const count = result.rows[0].count;
  return { allowed: count <= max };
}

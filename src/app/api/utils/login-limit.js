import { pool } from "@/app/api/utils/db";

const MAX_ATTEMPTS = 5;
export const loginIdentifier = (email) => email.toLowerCase().trim();

// Reserve before checking credentials. One atomic statement caps simultaneous
// attempts too; public status requests never increment, extend or clear it.
export async function reserveLoginAttempt(email) {
  const result = await pool.query(
    `INSERT INTO auth_rate_limits (identifier, attempts, last_attempt, locked_until)
     VALUES ($1, 1, NOW(), NULL)
     ON CONFLICT (identifier) DO UPDATE SET
       attempts = CASE WHEN auth_rate_limits.last_attempt <= NOW() - INTERVAL '15 minutes'
         THEN 1 ELSE auth_rate_limits.attempts + 1 END,
       last_attempt = NOW(),
       locked_until = CASE
         WHEN auth_rate_limits.last_attempt <= NOW() - INTERVAL '15 minutes' THEN NULL
         WHEN auth_rate_limits.attempts + 1 >= $2 THEN NOW() + INTERVAL '15 minutes'
         ELSE NULL END
     WHERE (auth_rate_limits.locked_until IS NULL OR auth_rate_limits.locked_until <= NOW())
       AND (auth_rate_limits.attempts < $2 OR auth_rate_limits.last_attempt <= NOW() - INTERVAL '15 minutes')
     RETURNING attempts`,
    [loginIdentifier(email), MAX_ATTEMPTS]
  );
  return result.rows.length > 0;
}

export async function clearLoginAttempts(email) {
  await pool.query("DELETE FROM auth_rate_limits WHERE identifier = $1", [loginIdentifier(email)]);
}

export async function loginLimitStatus(email) {
  const result = await pool.query("SELECT attempts, last_attempt, locked_until FROM auth_rate_limits WHERE identifier = $1", [loginIdentifier(email)]);
  const record = result.rows[0];
  const now = Date.now();
  const remaining = record?.locked_until ? new Date(record.locked_until).getTime() - now : 0;
  if (remaining > 0) {
    const minutesLeft = Math.ceil(remaining / 60000);
    return { allowed: false, locked: true, minutesLeft, message: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.` };
  }
  const attempts = record && new Date(record.last_attempt).getTime() > now - 15 * 60000 ? record.attempts : 0;
  return { allowed: true, attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts), warning: attempts >= 3 };
}

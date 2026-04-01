import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;
const LOCKOUT_MINUTES = 15;

export async function POST(request) {
  try {
    const { email, success } = await request.json();
    if (!email) return Response.json({ error: "No identifier" }, { status: 400 });

    const identifier = email.toLowerCase().trim();

    // If login was successful, clear their record
    if (success) {
      await pool.query("DELETE FROM auth_rate_limits WHERE identifier = $1", [identifier]);
      return Response.json({ allowed: true });
    }

    const now = new Date();
    const result = await pool.query(
      "SELECT * FROM auth_rate_limits WHERE identifier = $1",
      [identifier]
    );
    const existing = result.rows[0];

    if (existing) {
      // If currently locked, check if lockout has expired
      if (existing.locked_until) {
        const lockedUntil = new Date(existing.locked_until);
        if (now < lockedUntil) {
          const minutesLeft = Math.ceil((lockedUntil - now) / 1000 / 60);
          return Response.json({
            allowed: false, locked: true, minutesLeft,
            message: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`,
          });
        } else {
          await pool.query("DELETE FROM auth_rate_limits WHERE identifier = $1", [identifier]);
          return Response.json({ allowed: true });
        }
      }

      // Check if within the window
      const lastAttempt = new Date(existing.last_attempt);
      const windowExpiry = new Date(lastAttempt.getTime() + WINDOW_MINUTES * 60 * 1000);

      if (now > windowExpiry) {
        await pool.query("DELETE FROM auth_rate_limits WHERE identifier = $1", [identifier]);
        return Response.json({ allowed: true });
      }

      const newAttempts = existing.attempts + 1;

      if (newAttempts >= MAX_ATTEMPTS) {
        const lockedUntil = new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000);
        await pool.query(
          `UPDATE auth_rate_limits 
           SET attempts=$2, last_attempt=$3, locked_until=$4
           WHERE identifier=$1`,
          [identifier, newAttempts, now.toISOString(), lockedUntil.toISOString()]
        );
        return Response.json({
          allowed: false, locked: true, minutesLeft: LOCKOUT_MINUTES,
          message: `Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.`,
        });
      }

      await pool.query(
        `UPDATE auth_rate_limits SET attempts=$2, last_attempt=$3 WHERE identifier=$1`,
        [identifier, newAttempts, now.toISOString()]
      );
      return Response.json({
        allowed: true,
        attemptsLeft: MAX_ATTEMPTS - newAttempts,
        warning: newAttempts >= 3,
      });

    } else {
      // First failed attempt
      await pool.query(
        `INSERT INTO auth_rate_limits (identifier, attempts, last_attempt)
         VALUES ($1, 1, $2)`,
        [identifier, now.toISOString()]
      );
      return Response.json({ allowed: true, attemptsLeft: MAX_ATTEMPTS - 1 });
    }
  } catch (error) {
    // Fail open — don't block login if rate limit check fails
    return Response.json({ allowed: true });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  if (!email) return Response.json({ allowed: true });

  const identifier = email.toLowerCase().trim();
  const now = new Date();

  try {
    const result = await pool.query(
      "SELECT * FROM auth_rate_limits WHERE identifier = $1",
      [identifier]
    );
    const existing = result.rows[0];
    if (!existing) return Response.json({ allowed: true });

    if (existing.locked_until) {
      const lockedUntil = new Date(existing.locked_until);
      if (now < lockedUntil) {
        const minutesLeft = Math.ceil((lockedUntil - now) / 1000 / 60);
        return Response.json({
          allowed: false, locked: true, minutesLeft,
          message: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`,
        });
      }
    }
    return Response.json({ allowed: true });
  } catch {
    return Response.json({ allowed: true });
  }
}
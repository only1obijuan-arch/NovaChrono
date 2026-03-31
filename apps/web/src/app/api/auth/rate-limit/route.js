import sql from "@/app/api/utils/sql";

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;
const LOCKOUT_MINUTES = 15;

export async function POST(request) {
  try {
    const { email, success } = await request.json();
    if (!email)
      return Response.json({ error: "No identifier" }, { status: 400 });

    const identifier = email.toLowerCase().trim();

    // If login was successful, clear their record
    if (success) {
      await sql`DELETE FROM auth_rate_limits WHERE identifier = ${identifier}`;
      return Response.json({ allowed: true });
    }

    const now = new Date();

    // Check existing record
    const [existing] = await sql`
      SELECT * FROM auth_rate_limits WHERE identifier = ${identifier}
    `;

    if (existing) {
      // If currently locked, check if lockout has expired
      if (existing.locked_until) {
        const lockedUntil = new Date(existing.locked_until);
        if (now < lockedUntil) {
          const secondsLeft = Math.ceil((lockedUntil - now) / 1000);
          const minutesLeft = Math.ceil(secondsLeft / 60);
          return Response.json({
            allowed: false,
            locked: true,
            minutesLeft,
            message: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`,
          });
        } else {
          // Lockout expired — reset
          await sql`DELETE FROM auth_rate_limits WHERE identifier = ${identifier}`;
          return Response.json({ allowed: true });
        }
      }

      // Check if within the window
      const lastAttempt = new Date(existing.last_attempt);
      const windowExpiry = new Date(
        lastAttempt.getTime() + WINDOW_MINUTES * 60 * 1000,
      );

      if (now > windowExpiry) {
        // Window expired — reset
        await sql`DELETE FROM auth_rate_limits WHERE identifier = ${identifier}`;
        return Response.json({ allowed: true });
      }

      // Increment attempts
      const newAttempts = existing.attempts + 1;

      if (newAttempts >= MAX_ATTEMPTS) {
        const lockedUntil = new Date(
          now.getTime() + LOCKOUT_MINUTES * 60 * 1000,
        );
        await sql`
          UPDATE auth_rate_limits 
          SET attempts = ${newAttempts}, last_attempt = ${now.toISOString()}, locked_until = ${lockedUntil.toISOString()}
          WHERE identifier = ${identifier}
        `;
        return Response.json({
          allowed: false,
          locked: true,
          minutesLeft: LOCKOUT_MINUTES,
          message: `Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.`,
        });
      }

      await sql`
        UPDATE auth_rate_limits 
        SET attempts = ${newAttempts}, last_attempt = ${now.toISOString()}
        WHERE identifier = ${identifier}
      `;

      return Response.json({
        allowed: true,
        attemptsLeft: MAX_ATTEMPTS - newAttempts,
        warning: newAttempts >= 3,
      });
    } else {
      // First failed attempt
      await sql`
        INSERT INTO auth_rate_limits (identifier, attempts, last_attempt)
        VALUES (${identifier}, 1, ${now.toISOString()})
      `;
      return Response.json({ allowed: true, attemptsLeft: MAX_ATTEMPTS - 1 });
    }
  } catch (error) {
    console.error("Rate limit error:", error);
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
    const [existing] = await sql`
      SELECT * FROM auth_rate_limits WHERE identifier = ${identifier}
    `;

    if (!existing) return Response.json({ allowed: true });

    if (existing.locked_until) {
      const lockedUntil = new Date(existing.locked_until);
      if (now < lockedUntil) {
        const minutesLeft = Math.ceil((lockedUntil - now) / 1000 / 60);
        return Response.json({
          allowed: false,
          locked: true,
          minutesLeft,
          message: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`,
        });
      }
    }

    return Response.json({ allowed: true });
  } catch {
    return Response.json({ allowed: true });
  }
}

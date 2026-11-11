import { pool } from "@/app/api/utils/db";
import { rateLimit } from "@/app/api/utils/rate-limit";
import { verify } from "argon2";
import { SignJWT } from "jose";
import { randomUUID } from "crypto";
import { z } from "zod";
import { canonicalizeEmail } from "@/app/api/utils/email";
import { getTrustedClientIp } from "@/app/api/utils/client-ip";
import { getAuthSecretKey } from "@/app/api/utils/auth-secret";

const signinSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
}).strict();

// A valid Argon2id hash used only to keep the missing-account path comparable
// to a real password check. It is not an account credential or an access key.
const NON_ACCOUNT_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$iNsKaHwWLkaqdktKKcpm7Q$KhwUCFuZOlVKT+RkexkL8sBXIoD/qc+6XYixFfe+4fc";

const invalidCredentials = () =>
  Response.json({ error: "Invalid email or password" }, { status: 401 });

// Returns a signed JWT for mobile app sessions.
// This endpoint is intentionally public: authentication depends on verified
// credentials and server-side controls, never a secret embedded in the app.
export async function POST(request) {
  try {
    const ip = getTrustedClientIp(request);
    const { allowed: ipAllowed } = await rateLimit(
      `mobile-signin:ip:${ip}`,
      { max: 20, windowMinutes: 15 },
    );
    if (!ipAllowed) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    const parsed = signinSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }
    const { password } = parsed.data;
    const email = canonicalizeEmail(parsed.data.email);

    const { allowed: emailAllowed } = await rateLimit(
      `mobile-signin:email:${email}`,
      { max: 5, windowMinutes: 15 },
    );
    if (!emailAllowed) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }

    // Hold the user row through credential verification and session creation.
    // Password reset advances the same row's session boundary and deletes JTIs;
    // this lock makes either operation win completely instead of allowing a
    // reset to miss a not-yet-committed mobile session.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const userResult = await client.query(
        "SELECT * FROM auth_users WHERE email = $1 FOR UPDATE",
        [email],
      );
      if (userResult.rowCount === 0) {
        await verify(NON_ACCOUNT_PASSWORD_HASH, password);
        await client.query("ROLLBACK");
        return invalidCredentials();
      }
      const user = userResult.rows[0];

      if (user.account_status !== "active") {
        await verify(NON_ACCOUNT_PASSWORD_HASH, password);
        await client.query("ROLLBACK");
        return invalidCredentials();
      }

      const accountResult = await client.query(
        `SELECT * FROM auth_accounts WHERE "userId" = $1 AND provider = 'credentials'`,
        [user.id],
      );
      if (accountResult.rowCount === 0 || !accountResult.rows[0].password) {
        await verify(NON_ACCOUNT_PASSWORD_HASH, password);
        await client.query("ROLLBACK");
        return invalidCredentials();
      }

      const isValid = await verify(accountResult.rows[0].password, password);
      if (!isValid) {
        await client.query("ROLLBACK");
        return invalidCredentials();
      }

      if (!user.emailVerified) {
        await client.query("ROLLBACK");
        return Response.json(
          { error: "Please verify your email before signing in." },
          { status: 403 },
        );
      }

      // Build JWT - 7-day expiry; jti ties it to a revocable mobile_sessions row.
      const jti = randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const secret = getAuthSecretKey();
      const token = await new SignJWT({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        venue_id: user.venue_id,
        organization_id: user.organization_id,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setJti(jti)
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(secret);

      await client.query(
        "INSERT INTO mobile_sessions (jti, user_id, expires_at) VALUES ($1, $2, $3)",
        [jti, user.id, expiresAt],
      );
      await client.query("COMMIT");

      return Response.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          venue_id: user.venue_id,
          organization_id: user.organization_id,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[mobile-signin]", error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

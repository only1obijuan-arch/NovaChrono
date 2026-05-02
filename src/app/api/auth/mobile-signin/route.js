import { pool } from "@/app/api/utils/db";
import { verify } from "argon2";
import { SignJWT } from "jose";
import { randomUUID } from "crypto";
import { z } from "zod";

const signinSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

// Returns a signed JWT for mobile app sessions.
// Protected by MOBILE_SECRET header so only the app can call it.
export async function POST(request) {
  try {
    const mobileSecret = request.headers.get("x-mobile-secret");
    if (!mobileSecret || mobileSecret !== process.env.MOBILE_SECRET) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = signinSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.format() }, { status: 400 });
    }
    const { email, password } = parsed.data;

    // Fetch user + credentials account
    const userResult = await pool.query(
      "SELECT * FROM auth_users WHERE email = $1",
      [email.toLowerCase().trim()]
    );
    if (userResult.rowCount === 0) {
      return Response.json({ error: "Invalid email or password" }, { status: 401 });
    }
    const user = userResult.rows[0];

    const accountResult = await pool.query(
      `SELECT * FROM auth_accounts WHERE "userId" = $1 AND provider = 'credentials'`,
      [user.id]
    );
    if (accountResult.rowCount === 0 || !accountResult.rows[0].password) {
      return Response.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const isValid = await verify(accountResult.rows[0].password, password);
    if (!isValid) {
      return Response.json({ error: "Invalid email or password" }, { status: 401 });
    }

    if (!user.emailVerified) {
      return Response.json({ error: "Please verify your email before signing in." }, { status: 403 });
    }

    // Build JWT — 7-day expiry; jti ties it to a revocable mobile_sessions row.
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
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

    await pool.query(
      "INSERT INTO mobile_sessions (jti, user_id, expires_at) VALUES ($1, $2, $3)",
      [jti, user.id, expiresAt]
    );

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
    console.error("[mobile-signin]", error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

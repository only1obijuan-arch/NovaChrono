import { jwtVerify, SignJWT } from "jose";
import { pool } from "@/app/api/utils/db";
import { randomUUID } from "crypto";

// Silently exchanges a valid (non-expired, non-revoked) mobile token for a
// fresh 7-day token. Call this before the token expires so the user is never
// logged out mid-season. The old session is atomically revoked.
export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return Response.json({ error: "Missing token" }, { status: 401 });
    }

    const raw = authHeader.slice(7);
    let payload;
    try {
      const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
      ({ payload } = await jwtVerify(raw, secret));
    } catch {
      return Response.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    if (!payload.jti) {
      return Response.json({ error: "Invalid token" }, { status: 401 });
    }

    // Confirm the session is still active and fetch live user data.
    const sessionResult = await pool.query(
      `SELECT u.id, u.role, u.venue_id, u.organization_id, u.email, u.name
       FROM mobile_sessions ms
       JOIN auth_users u ON u.id = ms.user_id
       WHERE ms.jti = $1
         AND ms.expires_at > NOW()
         AND to_timestamp($2) >= u.sessions_valid_after`,
      [payload.jti, payload.iat]
    );

    if (sessionResult.rowCount === 0) {
      return Response.json({ error: "Session not found or revoked" }, { status: 401 });
    }

    const user = sessionResult.rows[0];
    const newJti = randomUUID();
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
      .setJti(newJti)
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

    // Swap old session for new one atomically.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM mobile_sessions WHERE jti = $1", [payload.jti]);
      await client.query(
        "INSERT INTO mobile_sessions (jti, user_id, expires_at) VALUES ($1, $2, $3)",
        [newJti, user.id, expiresAt]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

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
    console.error("[mobile-refresh]", error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

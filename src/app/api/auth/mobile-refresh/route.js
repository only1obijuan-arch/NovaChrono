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

    const newJti = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // DELETE ... RETURNING is the single-use claim. Concurrent refreshes
      // serialize on this row and only one can receive replacement credentials.
      const claimed = await client.query(
        `DELETE FROM mobile_sessions AS ms
         USING auth_users AS u
         WHERE ms.jti = $1
           AND u.id = ms.user_id
           AND ms.expires_at > NOW()
           AND to_timestamp($2) >= u.sessions_valid_after
         RETURNING u.id, u.role, u.venue_id, u.organization_id, u.email, u.name`,
        [payload.jti, payload.iat]
      );

      if (claimed.rowCount === 0) {
        await client.query("ROLLBACK");
        return Response.json({ error: "Session not found or revoked" }, { status: 401 });
      }

      const user = claimed.rows[0];
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

      await client.query(
        "INSERT INTO mobile_sessions (jti, user_id, expires_at) VALUES ($1, $2, $3)",
        [newJti, user.id, expiresAt]
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
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error("[mobile-refresh]", error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

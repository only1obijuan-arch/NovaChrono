import { jwtVerify } from "jose";
import { pool } from "@/app/api/utils/db";

// Verifies the mobile Bearer token against the active-sessions table.
// Returns live user data from DB (not stale JWT claims), or null if the
// token is missing, invalid, expired, or has been revoked.
export async function verifyMobileToken(request) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;

  const raw = authHeader.slice(7);
  if (!raw) return null;

  let payload;
  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    ({ payload } = await jwtVerify(raw, secret));
  } catch {
    return null;
  }

  if (!payload.jti) return null;

  // Single query: confirm the session hasn't been revoked and return live
  // role/venue so a role change or deactivation takes effect immediately.
  const result = await pool.query(
    `SELECT u.id, u.role, u.venue_id, u.organization_id, u.email, u.name
     FROM mobile_sessions ms
     JOIN auth_users u ON u.id = ms.user_id
     WHERE ms.jti = $1
       AND ms.expires_at > NOW()
       AND to_timestamp($2) >= u.sessions_valid_after`,
    [payload.jti, payload.iat]
  );

  if (result.rowCount === 0) return null;

  const u = result.rows[0];
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    venue_id: u.venue_id,
    organization_id: u.organization_id,
  };
}

import { jwtVerify } from "jose";
import { pool } from "@/app/api/utils/db";
import { getAuthSecretKey } from "@/app/api/utils/auth-secret";

// Revokes the mobile session so the token cannot be used again.
// The mobile app should call this on logout.
export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return Response.json({ error: "Missing token" }, { status: 401 });
    }

    const raw = authHeader.slice(7);
    let payload;
    try {
      const secret = getAuthSecretKey();
      ({ payload } = await jwtVerify(raw, secret, {
        algorithms: ["HS256"],
        requiredClaims: ["iat", "exp", "jti"],
      }));
    } catch {
      return Response.json({ error: "Invalid token" }, { status: 401 });
    }

    if (!payload.jti || !Number.isFinite(payload.iat)) {
      return Response.json({ error: "Invalid token" }, { status: 401 });
    }

    await pool.query("DELETE FROM mobile_sessions WHERE jti = $1", [payload.jti]);

    return Response.json({ success: true });
  } catch (error) {
    console.error("[mobile-signout]", error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

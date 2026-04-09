import sql from "@/app/api/utils/sql";
import crypto from "crypto";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return Response.redirect(new URL("/account/verify?error=missing_token", request.url));
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const rows = await sql`
      SELECT identifier, expires
      FROM auth_verification_token
      WHERE token = ${tokenHash}
    `;

    if (rows.length === 0) {
      return Response.redirect(new URL("/account/verify?error=invalid_token", request.url));
    }

    const { identifier: email, expires } = rows[0];

    if (new Date(expires) < new Date()) {
      await sql`DELETE FROM auth_verification_token WHERE token = ${tokenHash}`;
      return Response.redirect(new URL("/account/verify?error=expired_token", request.url));
    }

    await sql`
      UPDATE auth_users
      SET "emailVerified" = NOW()
      WHERE LOWER(email) = LOWER(${email})
      AND "emailVerified" IS NULL
    `;

    await sql`DELETE FROM auth_verification_token WHERE token = ${tokenHash}`;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return Response.redirect(new URL("/account/signin?verified=true", appUrl));
  } catch (error) {
    console.error("Email verification error:", error);
    return Response.redirect(new URL("/account/verify?error=server_error", request.url));
  }
}

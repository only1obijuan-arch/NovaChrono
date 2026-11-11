import sql, { withTransaction } from "@/app/api/utils/sql";
import crypto from "crypto";
import { canonicalizeEmail } from "@/app/api/utils/email";

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

    const { expires } = rows[0];
    const email = canonicalizeEmail(rows[0].identifier);

    if (new Date(expires) < new Date()) {
      await sql`DELETE FROM auth_verification_token WHERE token = ${tokenHash}`;
      return Response.redirect(new URL("/account/verify?error=expired_token", request.url));
    }

    const verified = await withTransaction(async (txSql) => {
      const [user] = await txSql`
        SELECT id, account_status
        FROM auth_users
        WHERE lower(email) = ${email}
        FOR UPDATE
      `;
      if (!user || user.account_status !== 'active') {
        await txSql`DELETE FROM auth_verification_token WHERE token = ${tokenHash}`;
        return false;
      }
      const consumed = await txSql`
        DELETE FROM auth_verification_token
        WHERE token = ${tokenHash} AND expires > NOW()
        RETURNING token
      `;
      if (consumed.length === 0) return false;
      await txSql`
        UPDATE auth_users
        SET "emailVerified" = NOW()
        WHERE id = ${user.id} AND "emailVerified" IS NULL
      `;
      return true;
    });

    if (!verified) {
      return Response.redirect(new URL("/account/verify?error=invalid_token", request.url));
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return Response.redirect(new URL("/account/signin?verified=true", appUrl));
  } catch (error) {
    console.error("Email verification error:", error);
    return Response.redirect(new URL("/account/verify?error=server_error", request.url));
  }
}

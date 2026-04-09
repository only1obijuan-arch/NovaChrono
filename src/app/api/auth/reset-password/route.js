import sql from "@/app/api/utils/sql";
import { hash } from "argon2";
import { rateLimit } from "@/app/api/utils/rate-limit";
import crypto from "crypto";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return Response.json({ valid: false }, { status: 400 });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const tokens = await sql`
      SELECT id, user_id, expires_at, used
      FROM password_reset_tokens
      WHERE token = ${tokenHash}
    `;

    if (tokens.length === 0) {
      return Response.json({ valid: false });
    }

    const resetToken = tokens[0];

    if (resetToken.used || new Date(resetToken.expires_at) < new Date()) {
      return Response.json({ valid: false });
    }

    return Response.json({ valid: true });
  } catch (error) {
    console.error("Error validating token:", error);
    return Response.json({ valid: false }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return Response.json(
        { error: "Token and password are required" },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return Response.json(
        { error: "Password must be at least 8 characters long" },
        { status: 400 },
      );
    }

    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    const { allowed } = await rateLimit(`reset-attempt:${ip}`, { max: 10, windowMinutes: 15 });
    if (!allowed) {
      return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const tokens = await sql`
      SELECT id, user_id, expires_at, used
      FROM password_reset_tokens
      WHERE token = ${tokenHash}
    `;

    if (tokens.length === 0) {
      return Response.json(
        { error: "Invalid or expired reset token" },
        { status: 400 },
      );
    }

    const resetToken = tokens[0];

    if (resetToken.used) {
      return Response.json(
        { error: "This reset token has already been used" },
        { status: 400 },
      );
    }

    if (new Date(resetToken.expires_at) < new Date()) {
      return Response.json(
        { error: "This reset token has expired" },
        { status: 400 },
      );
    }

    const hashedPassword = await hash(password);

    await sql`
      UPDATE auth_accounts
      SET password = ${hashedPassword}
      WHERE "userId" = ${resetToken.user_id}
      AND provider = 'credentials'
    `;

    await sql`
      UPDATE password_reset_tokens
      SET used = TRUE
      WHERE id = ${resetToken.id}
    `;

    return Response.json({
      success: true,
      message: "Password has been reset successfully",
    });
  } catch (error) {
    console.error("Error resetting password:", error);
    return Response.json(
      { error: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}

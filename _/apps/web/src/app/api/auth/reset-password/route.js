import sql from "@/app/api/utils/sql";
import { hash } from "argon2";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return Response.json({ valid: false }, { status: 400 });
    }

    // Find valid token
    const tokens = await sql`
      SELECT id, user_id, expires_at, used
      FROM password_reset_tokens
      WHERE token = ${token}
    `;

    if (tokens.length === 0) {
      return Response.json({ valid: false });
    }

    const resetToken = tokens[0];

    // Check if token has been used or expired
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

    // Validate password strength
    if (password.length < 8) {
      return Response.json(
        { error: "Password must be at least 8 characters long" },
        { status: 400 },
      );
    }

    // Find valid token
    const tokens = await sql`
      SELECT id, user_id, expires_at, used
      FROM password_reset_tokens
      WHERE token = ${token}
    `;

    if (tokens.length === 0) {
      return Response.json(
        { error: "Invalid or expired reset token" },
        { status: 400 },
      );
    }

    const resetToken = tokens[0];

    // Check if token has been used
    if (resetToken.used) {
      return Response.json(
        { error: "This reset token has already been used" },
        { status: 400 },
      );
    }

    // Check if token has expired
    if (new Date(resetToken.expires_at) < new Date()) {
      return Response.json(
        { error: "This reset token has expired" },
        { status: 400 },
      );
    }

    // Hash the new password
    const hashedPassword = await hash(password);

    // Update user's password
    await sql`
      UPDATE auth_accounts
      SET password = ${hashedPassword}
      WHERE "userId" = ${resetToken.user_id}
      AND provider = 'credentials'
    `;

    // Mark token as used
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
      { error: "Failed to reset password", details: error.message },
      { status: 500 },
    );
  }
}

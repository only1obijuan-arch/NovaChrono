import sql, { withTransaction } from "@/app/api/utils/sql";
import { hash } from "argon2";
import { rateLimit } from "@/app/api/utils/rate-limit";
import crypto from "crypto";
import { z } from "zod";

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(512),
  password: z.string().min(8).max(128),
});

async function fetchResetToken(token) {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const [row] = await sql`
    SELECT id, user_id, expires_at, used
    FROM password_reset_tokens
    WHERE token = ${tokenHash}
    LIMIT 1
  `;
  return row ?? null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return Response.json({ valid: false }, { status: 400 });
    }

    const resetToken = await fetchResetToken(token);

    if (!resetToken || resetToken.used || new Date(resetToken.expires_at) < new Date()) {
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
    const parsed = resetPasswordSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.format() }, { status: 400 });
    }
    const { token, password } = parsed.data;

    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    const { allowed } = await rateLimit(`reset-attempt:${ip}`, { max: 10, windowMinutes: 15 });
    if (!allowed) {
      return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const resetToken = await fetchResetToken(token);

    if (!resetToken) {
      return Response.json(
        { error: "Invalid or expired reset token" },
        { status: 400 },
      );
    }

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

    await withTransaction(async (txSql) => {
      await txSql`
        INSERT INTO auth_accounts ("userId", provider, type, "providerAccountId", password)
        VALUES (${resetToken.user_id}, 'credentials', 'credentials', ${resetToken.user_id}, ${hashedPassword})
        ON CONFLICT ("userId", provider) DO UPDATE SET password = ${hashedPassword}
      `;
      await txSql`
        UPDATE password_reset_tokens
        SET used = TRUE
        WHERE id = ${resetToken.id}
      `;
    });

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

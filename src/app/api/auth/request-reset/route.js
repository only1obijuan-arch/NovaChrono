import sql from "@/app/api/utils/sql";
import { sendEmail } from "@/app/api/utils/send-email";
import { rateLimit } from "@/app/api/utils/rate-limit";
import crypto from "crypto";

export async function POST(request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return Response.json({ error: "Email is required" }, { status: 400 });
    }

    const { allowed } = await rateLimit(`reset:${email}`, { max: 3, windowMinutes: 15 });
    if (!allowed) {
      return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }

    // Find user by email
    const users = await sql`
      SELECT id, email, name, role
      FROM auth_users
      WHERE LOWER(email) = LOWER(${email})
    `;

    // Always return success even if user not found (security best practice)
    if (users.length === 0) {
      return Response.json({
        success: true,
        message:
          "If an account exists with that email, a reset link has been sent.",
      });
    }

    const user = users[0];

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await sql`
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES (${user.id}, ${tokenHash}, ${expiresAt})
    `;

    const resetUrl = `${
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    }/account/reset-password?token=${token}`;

    const subject = "NovaChrono — Reset Your Password";
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="margin:0;padding:0;background:#091833;font-family:'Helvetica Neue',Arial,sans-serif;">
          <div style="max-width:520px;margin:40px auto;padding:20px;">
            <div style="text-align:center;margin-bottom:32px;">
              <div style="display:inline-block;background:rgba(0,245,212,0.08);border:2px solid rgba(0,245,212,0.4);border-radius:8px;padding:16px 24px;">
                <p style="margin:0;font-size:22px;font-weight:900;color:#00F5D4;letter-spacing:6px;font-family:monospace;">NOVACHRONO</p>
                <p style="margin:4px 0 0;font-size:9px;color:rgba(0,245,212,0.4);letter-spacing:4px;font-family:monospace;">TIME PAUSES. YOUR LEAGUE NEVER DOES.</p>
              </div>
            </div>
            <div style="background:#0D1B2E;border:1px solid rgba(0,245,212,0.2);border-radius:8px;overflow:hidden;">
              <div style="height:3px;background:linear-gradient(90deg,transparent,#00F5D4,transparent);"></div>
              <div style="padding:32px;">
                <p style="margin:0 0 8px;font-size:10px;color:rgba(0,245,212,0.5);letter-spacing:4px;font-family:monospace;">SYSTEM MESSAGE</p>
                <h1 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#F4F4F9;letter-spacing:2px;font-family:monospace;">PASSWORD RESET</h1>
                <p style="margin:0 0 8px;font-size:15px;color:rgba(180,200,220,0.7);line-height:1.6;">Hi ${
                  user.name || "there"
                },</p>
                <p style="margin:0 0 24px;font-size:15px;color:rgba(180,200,220,0.7);line-height:1.6;">
                  We received a request to reset the password for your NovaChrono account. Click the button below to set a new password.
                </p>
                <div style="text-align:center;margin:32px 0;">
                  <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,rgba(0,245,212,0.2),rgba(0,245,212,0.1));border:1px solid rgba(0,245,212,0.5);color:#00F5D4;font-family:monospace;font-size:13px;font-weight:700;letter-spacing:3px;padding:16px 40px;border-radius:4px;text-decoration:none;">
                    RESET PASSWORD →
                  </a>
                </div>
                <div style="background:rgba(0,245,212,0.04);border:1px solid rgba(0,245,212,0.15);border-radius:4px;padding:16px;margin-bottom:24px;">
                  <p style="margin:0 0 6px;font-size:9px;color:rgba(0,245,212,0.4);letter-spacing:3px;font-family:monospace;">RESET LINK</p>
                  <p style="margin:0;font-size:11px;color:rgba(180,200,220,0.4);font-family:monospace;word-break:break-all;">${resetUrl}</p>
                </div>
                <div style="border-top:1px solid rgba(0,245,212,0.08);padding-top:20px;">
                  <p style="margin:0;font-size:12px;color:rgba(180,200,220,0.4);line-height:1.8;">
                    ⏱ This link expires in <strong style="color:rgba(0,245,212,0.6);">1 hour</strong>.<br>
                    🔒 If you didn't request this, you can safely ignore this email.<br>
                    ⚠ Never share this link with anyone.
                  </p>
                </div>
              </div>
            </div>
            <p style="text-align:center;margin-top:24px;font-size:9px;color:rgba(180,200,220,0.15);letter-spacing:3px;font-family:monospace;">
              © 2025 NOVACHRONO. ALL RIGHTS RESERVED.
            </p>
          </div>
        </body>
      </html>
    `;
    const text = `NovaChrono — Password Reset\n\nHi ${
      user.name || "there"
    },\n\nClick the link below to reset your password:\n${resetUrl}\n\nThis link expires in 1 hour.\nIf you didn't request this, ignore this email.`;

    await sendEmail({ to: user.email, subject, html, text });

    return Response.json({
      success: true,
      message:
        "If an account exists with that email, a reset link has been sent.",
    });
  } catch (error) {
    console.error("Error requesting password reset:", error);
    return Response.json(
      { error: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}

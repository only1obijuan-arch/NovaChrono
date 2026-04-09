import sql from "@/app/api/utils/sql";
import { sendEmail } from "@/app/api/utils/send-email";
import { hash } from "argon2";
import { createHash } from "crypto";

export async function POST(request) {
  try {
    const { token, name, password } = await request.json();

    if (!token || !name || !password) {
      return Response.json(
        { error: "All fields are required" },
        { status: 400 },
      );
    }
    if (password.length < 8) {
      return Response.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    // Validate token
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [invite] = await sql`
      SELECT it.*, o.name as organization_name
      FROM invite_tokens it
      LEFT JOIN organizations o ON o.id = it.organization_id
      WHERE it.token = ${tokenHash}
      AND it.used = FALSE
      AND it.expires_at > NOW()
    `;

    if (!invite) {
      return Response.json(
        {
          error: "Invalid or expired invite link. Please request a new invite.",
        },
        { status: 400 },
      );
    }

    // Check email not already taken
    const [existing] = await sql`
      SELECT id FROM auth_users WHERE LOWER(email) = LOWER(${invite.email})
    `;
    if (existing) {
      return Response.json(
        { error: "An account with this email already exists. Please sign in." },
        { status: 400 },
      );
    }

    const hashedPassword = await hash(password);

    // Create user — include venue_id if present in invite token
    const [newUser] = await sql`
      INSERT INTO auth_users (name, email, role, organization_id, venue_id)
      VALUES (
        ${name},
        ${invite.email},
        ${invite.role},
        ${invite.organization_id},
        ${invite.venue_id || null}
      )
      RETURNING id, name, email, role
    `;

    await sql`
      INSERT INTO auth_accounts (
        "userId", provider, type, "providerAccountId", password
      )
      VALUES (
        ${newUser.id}, 'credentials', 'credentials', ${invite.email}, ${hashedPassword}
      )
    `;

    // Mark token as used
    await sql`UPDATE invite_tokens SET used = TRUE WHERE token = ${tokenHash}`;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Send welcome email
    await sendEmail({
      to: invite.email,
      subject: `Welcome to NovaChrono — Your account is ready`,
      html: `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"></head>
          <body style="margin:0;padding:0;background:#091833;font-family:'Helvetica Neue',Arial,sans-serif;">
            <div style="max-width:520px;margin:40px auto;padding:20px;">
              <div style="text-align:center;margin-bottom:32px;">
                <div style="display:inline-block;background:rgba(0,245,212,0.08);border:2px solid rgba(0,245,212,0.4);border-radius:8px;padding:16px 32px;">
                  <p style="margin:0;font-size:22px;font-weight:900;color:#00F5D4;letter-spacing:6px;font-family:monospace;">NOVACHRONO</p>
                </div>
              </div>
              <div style="background:#0D1B2E;border:1px solid rgba(255,0,204,0.2);border-radius:8px;overflow:hidden;">
                <div style="height:3px;background:linear-gradient(90deg,transparent,#FF00CC,transparent);"></div>
                <div style="padding:32px;">
                  <p style="margin:0 0 8px;font-size:10px;color:rgba(255,0,204,0.5);letter-spacing:4px;font-family:monospace;">// WELCOME ABOARD</p>
                  <h1 style="margin:0 0 20px;font-size:22px;font-weight:900;color:#F4F4F9;letter-spacing:2px;font-family:monospace;">ACCOUNT ACTIVATED!</h1>
                  <p style="margin:0 0 24px;font-size:15px;color:rgba(180,200,220,0.7);line-height:1.7;">
                    Hi ${name}, your NovaChrono account is ready. You're now managing
                    <strong style="color:#F4F4F9;">${invite.organization_name}</strong>.
                  </p>
                  <div style="text-align:center;">
                    <a href="${appUrl}/account/signin" style="display:inline-block;background:linear-gradient(135deg,#FF00CC,#AA0088);color:#F4F4F9;font-family:monospace;font-size:13px;font-weight:700;letter-spacing:3px;padding:16px 40px;border-radius:4px;text-decoration:none;">
                      SIGN IN NOW →
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `Welcome ${name}! Sign in at ${appUrl}/account/signin`,
    }).catch(() => {});

    return Response.json({
      success: true,
      message: "Account created successfully!",
    });
  } catch (err) {
    console.error("Accept invite error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

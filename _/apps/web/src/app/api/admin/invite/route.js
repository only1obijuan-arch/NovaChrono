import sql from "@/app/api/utils/sql";
import { sendEmail } from "@/app/api/utils/send-email";
import { auth } from "@/auth";
import { randomBytes } from "crypto";

async function getSession() {
  const session = await auth();
  return session?.user ?? null;
}

export async function POST(request) {
  try {
    const user = await getSession();
    if (!user || user.role !== "super_admin") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email, organizationId, role = "org_admin" } = await request.json();

    if (!email || !organizationId) {
      return Response.json(
        { error: "Email and organization are required" },
        { status: 400 }
      );
    }

    // Check if email already has an account
    const existingUsers = await sql`
      SELECT id FROM auth_users WHERE LOWER(email) = LOWER(${email})
    `;
    if (existingUsers.length > 0) {
      return Response.json(
        { error: "An account with this email already exists." },
        { status: 400 }
      );
    }

    // Check for existing unused invite
    const existingInvite = await sql`
      SELECT id FROM invite_tokens
      WHERE LOWER(email) = LOWER(${email})
      AND used = FALSE
      AND expires_at > NOW()
    `;
    if (existingInvite.length > 0) {
      return Response.json(
        { error: "An active invite already exists for this email." },
        { status: 400 }
      );
    }

    // Get organization details
    const orgs = await sql`
      SELECT id, name FROM organizations WHERE id = ${organizationId}
    `;
    if (orgs.length === 0) {
      return Response.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }
    const org = orgs[0];

    // Generate secure token
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store invite token
    await sql`
      INSERT INTO invite_tokens (token, email, role, organization_id, invited_by, expires_at)
      VALUES (${token}, ${email.toLowerCase()}, ${role}, ${organizationId}, ${
      user.id
    }, ${expiresAt})
    `;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const inviteUrl = `${appUrl}/account/accept-invite?token=${token}`;

    // Send invite email
    await sendEmail({
      to: email,
      subject: `You've been invited to manage ${org.name} on NovaChrono`,
      html: `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
          <body style="margin:0;padding:0;background:#091833;font-family:'Helvetica Neue',Arial,sans-serif;">
            <div style="max-width:520px;margin:40px auto;padding:20px;">

              <!-- Header -->
              <div style="text-align:center;margin-bottom:32px;">
                <div style="display:inline-block;background:rgba(0,245,212,0.08);border:2px solid rgba(0,245,212,0.4);border-radius:8px;padding:16px 32px;">
                  <p style="margin:0;font-size:22px;font-weight:900;color:#00F5D4;letter-spacing:6px;font-family:monospace;">NOVACHRONO</p>
                  <p style="margin:4px 0 0;font-size:9px;color:rgba(0,245,212,0.4);letter-spacing:4px;font-family:monospace;">// TIME PAUSES. YOUR LEAGUE NEVER DOES.</p>
                </div>
              </div>

              <!-- Main card -->
              <div style="background:#0D1B2E;border:1px solid rgba(255,0,204,0.2);border-radius:8px;overflow:hidden;">
                <div style="height:3px;background:linear-gradient(90deg,transparent,#FF00CC,transparent);"></div>
                <div style="padding:32px;">
                  <p style="margin:0 0 8px;font-size:10px;color:rgba(255,0,204,0.5);letter-spacing:4px;font-family:monospace;">// YOU'VE BEEN INVITED</p>
                  <h1 style="margin:0 0 20px;font-size:22px;font-weight:900;color:#F4F4F9;letter-spacing:2px;font-family:monospace;">JOIN NOVACHRONO</h1>

                  <p style="margin:0 0 24px;font-size:15px;color:rgba(180,200,220,0.7);line-height:1.7;">
                    You've been invited to manage <strong style="color:#F4F4F9;">${org.name}</strong> on NovaChrono as an organisation admin.
                  </p>

                  <!-- Details -->
                  <div style="background:rgba(255,0,204,0.04);border:1px solid rgba(255,0,204,0.15);border-radius:6px;padding:20px;margin-bottom:28px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,0,204,0.08);">
                      <span style="font-size:10px;color:rgba(255,0,204,0.5);font-family:monospace;letter-spacing:3px;">ORGANISATION</span>
                      <span style="font-size:14px;color:#F4F4F9;font-weight:700;">${org.name}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,0,204,0.08);">
                      <span style="font-size:10px;color:rgba(255,0,204,0.5);font-family:monospace;letter-spacing:3px;">ROLE</span>
                      <span style="font-size:14px;color:#F4F4F9;font-weight:700;">Organisation Admin</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
                      <span style="font-size:10px;color:rgba(255,0,204,0.5);font-family:monospace;letter-spacing:3px;">EXPIRES</span>
                      <span style="font-size:14px;color:#FFD700;font-weight:700;">24 HOURS</span>
                    </div>
                  </div>

                  <!-- CTA -->
                  <div style="text-align:center;margin-bottom:20px;">
                    <a href="${inviteUrl}" style="display:inline-block;background:linear-gradient(135deg,#FF00CC,#AA0088);color:#F4F4F9;font-family:monospace;font-size:13px;font-weight:700;letter-spacing:3px;padding:16px 40px;border-radius:4px;text-decoration:none;">
                      ACCEPT INVITE →
                    </a>
                  </div>

                  <p style="margin:0;font-size:11px;color:rgba(180,200,220,0.3);text-align:center;font-family:monospace;line-height:1.6;">
                    This link expires in 24 hours.<br/>
                    If you didn't expect this invite, you can safely ignore it.
                  </p>
                </div>
              </div>

              <!-- Footer -->
              <p style="text-align:center;margin-top:24px;font-size:9px;color:rgba(180,200,220,0.15);letter-spacing:3px;font-family:monospace;">
                © 2025 NOVACHRONO. ALL RIGHTS RESERVED.
              </p>
            </div>
          </body>
        </html>
      `,
      text: `You've been invited to manage ${org.name} on NovaChrono. Accept your invite at: ${inviteUrl} (expires in 24 hours)`,
    });

    return Response.json({ success: true, message: `Invite sent to ${email}` });
  } catch (error) {
    console.error("Invite error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  // Validate invite token
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return Response.json({ error: "Token required" }, { status: 400 });
  }

  const invites = await sql`
    SELECT it.*, o.name as organization_name
    FROM invite_tokens it
    LEFT JOIN organizations o ON o.id = it.organization_id
    WHERE it.token = ${token}
    AND it.used = FALSE
    AND it.expires_at > NOW()
  `;

  if (invites.length === 0) {
    return Response.json(
      { error: "Invalid or expired invite link." },
      { status: 400 }
    );
  }

  const invite = invites[0];
  return Response.json({
    valid: true,
    email: invite.email,
    role: invite.role,
    organizationName: invite.organization_name,
    organizationId: invite.organization_id,
  });
}
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { sendEmail } from "@/app/api/utils/send-email";
import { randomBytes, createHash } from "crypto";

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const rows = await sql`SELECT role FROM auth_users WHERE id = ${session.user.id}`;
  return rows[0]?.role === "super_admin" ? session : null;
}

export async function POST(request) {
  try {
    const session = await requireSuperAdmin();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 403 });

    const { email, venueId } = await request.json();
    if (!email || !venueId) {
      return Response.json({ error: "Email and venue are required" }, { status: 400 });
    }

    const [venue] = await sql`
      SELECT v.*, o.name as org_name
      FROM venues v
      JOIN organizations o ON o.id = v.organization_id
      WHERE v.id = ${venueId}
    `;
    if (!venue) return Response.json({ error: "Venue not found" }, { status: 404 });

    const [existing] = await sql`
      SELECT id FROM auth_users WHERE LOWER(email) = LOWER(${email})
    `;
    if (existing) return Response.json({ error: "An account with this email already exists." }, { status: 400 });

    const [existingInvite] = await sql`
      SELECT id FROM invite_tokens
      WHERE LOWER(email) = LOWER(${email})
      AND used = FALSE AND expires_at > NOW()
    `;
    if (existingInvite) return Response.json({ error: "An active invite already exists for this email." }, { status: 400 });

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await sql`
      INSERT INTO invite_tokens (token, email, role, organization_id, venue_id, invited_by, expires_at)
      VALUES (${tokenHash}, ${email.toLowerCase()}, 'venue_admin', ${venue.organization_id}, ${venueId}, ${session.user.id}, ${expiresAt})
    `;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const inviteUrl = `${appUrl}/account/accept-invite?token=${rawToken}`;

    await sendEmail({
      to: email,
      subject: `You've been invited to manage ${venue.name} on NovaChrono`,
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
                  <p style="margin:0 0 8px;font-size:10px;color:rgba(255,0,204,0.5);letter-spacing:4px;font-family:monospace;">// VENUE ADMIN INVITE</p>
                  <h1 style="margin:0 0 20px;font-size:22px;font-weight:900;color:#F4F4F9;letter-spacing:2px;font-family:monospace;">YOU'VE BEEN INVITED</h1>
                  <p style="margin:0 0 24px;font-size:15px;color:rgba(180,200,220,0.7);line-height:1.7;">
                    You've been invited to manage <strong style="color:#F4F4F9;">${venue.name}</strong> on NovaChrono.
                  </p>
                  <div style="background:rgba(255,0,204,0.04);border:1px solid rgba(255,0,204,0.15);border-radius:6px;padding:20px;margin-bottom:28px;">
                    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,0,204,0.08);">
                      <span style="font-size:10px;color:rgba(255,0,204,0.5);font-family:monospace;letter-spacing:3px;">ORGANISATION</span>
                      <span style="font-size:14px;color:#F4F4F9;font-weight:700;">${venue.org_name}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,0,204,0.08);">
                      <span style="font-size:10px;color:rgba(255,0,204,0.5);font-family:monospace;letter-spacing:3px;">VENUE</span>
                      <span style="font-size:14px;color:#F4F4F9;font-weight:700;">${venue.name}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:8px 0;">
                      <span style="font-size:10px;color:rgba(255,0,204,0.5);font-family:monospace;letter-spacing:3px;">ROLE</span>
                      <span style="font-size:14px;color:#FF00CC;font-weight:700;">Venue Admin</span>
                    </div>
                  </div>
                  <div style="text-align:center;margin-bottom:20px;">
                    <a href="${inviteUrl}" style="display:inline-block;background:linear-gradient(135deg,#FF00CC,#AA0088);color:#F4F4F9;font-family:monospace;font-size:13px;font-weight:700;letter-spacing:3px;padding:16px 40px;border-radius:4px;text-decoration:none;">
                      ACCEPT INVITE →
                    </a>
                  </div>
                  <p style="margin:0;font-size:11px;color:rgba(180,200,220,0.3);text-align:center;font-family:monospace;">
                    This link expires in 24 hours.
                  </p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `You've been invited to manage ${venue.name} on NovaChrono. Accept at: ${inviteUrl}`,
    });

    return Response.json({ success: true, message: `Invite sent to ${email}` });
  } catch (err) {
    console.error("POST /api/super-admin/invite-venue-admin error:", err);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

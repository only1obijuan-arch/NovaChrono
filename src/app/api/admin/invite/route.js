import sql from "@/app/api/utils/sql";
import { requireRole } from "@/app/api/utils/auth";
import { canonicalizeEmail } from "@/app/api/utils/email";
import { sendEmail } from "@/app/api/utils/send-email";
import { inviteOrgAdminEmail } from "@/emails/inviteOrgAdminEmail";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";

const inviteSchema = z.object({
  email: z.string().email().max(254),
  organizationId: z.string().min(1),
  role: z.enum(["org_admin"]).default("org_admin"),
});

// Send an invite to become org_admin for an organization.
// Called by the super-admin portal.
export async function POST(request) {
  try {
    const user = await requireRole(request, "super_admin");
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = inviteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.format() }, { status: 400 });
    }
    const { organizationId, role } = parsed.data;
    const email = canonicalizeEmail(parsed.data.email);

    // Reject if account already exists
    const [existingUser] = await sql`
      SELECT id FROM auth_users WHERE lower(email) = ${email} LIMIT 1
    `;
    if (existingUser) {
      return Response.json({ error: "An account with this email already exists." }, { status: 400 });
    }

    // Reject if an unused invite is already pending
    const [existingInvite] = await sql`
      SELECT id FROM invite_tokens
      WHERE lower(email) = ${email}
      AND used = FALSE
      AND expires_at > NOW()
      LIMIT 1
    `;
    if (existingInvite) {
      return Response.json({ error: "An active invite already exists for this email." }, { status: 400 });
    }

    const [org] = await sql`SELECT id, name FROM organizations WHERE id = ${organizationId} LIMIT 1`;
    if (!org) {
      return Response.json({ error: "Organization not found" }, { status: 404 });
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await sql`
      INSERT INTO invite_tokens (token, email, role, organization_id, invited_by, expires_at)
      VALUES (${tokenHash}, ${email}, ${role}, ${organizationId}, ${user.id}, ${expiresAt})
    `;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const inviteUrl = `${appUrl}/account/accept-invite?token=${token}`;

    await sendEmail({
      to: email,
      subject: `You've been invited to manage ${org.name} on NovaChrono`,
      html: inviteOrgAdminEmail({ orgName: org.name, inviteUrl }),
      text: `You've been invited to manage ${org.name} on NovaChrono. Accept your invite at: ${inviteUrl} (expires in 24 hours)`,
    });

    return Response.json({ success: true, message: `Invite sent to ${email}` });
  } catch (err) {
    console.error("POST /api/admin/invite error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Validate an invite token (used by the accept-invite page)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    if (!token) return Response.json({ error: "Token required" }, { status: 400 });

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [invite] = await sql`
      SELECT it.*, o.name AS organization_name
      FROM invite_tokens it
      LEFT JOIN organizations o ON o.id = it.organization_id
      WHERE it.token = ${tokenHash}
      AND it.used = FALSE
      AND it.expires_at > NOW()
      LIMIT 1
    `;

    if (!invite) {
      return Response.json({ error: "Invalid or expired invite link." }, { status: 400 });
    }
    return Response.json({
      valid: true,
      email: invite.email,
      role: invite.role,
      organizationName: invite.organization_name,
      organizationId: invite.organization_id,
    });
  } catch (err) {
    console.error("GET /api/admin/invite error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

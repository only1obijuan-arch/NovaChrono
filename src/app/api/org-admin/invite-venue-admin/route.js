import sql from "@/app/api/utils/sql";
import { sendEmail } from "@/app/api/utils/send-email";
import { inviteVenueAdminEmail } from "@/emails/inviteVenueAdminEmail";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { requireRole } from "@/app/api/utils/auth";
import { canonicalizeEmail } from "@/app/api/utils/email";

const inviteVenueAdminSchema = z.object({
  email: z.string().email().max(254),
  venueId: z.string().min(1),
});

export async function POST(request) {
  try {
    const currentUser = await requireRole(request, "org_admin", "super_admin");
    if (!currentUser)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [inviter] = await sql`
      SELECT au.*, o.name as org_name
      FROM auth_users au
      LEFT JOIN organizations o ON o.id = au.organization_id
      WHERE au.id = ${currentUser.id}
    `;
    if (!inviter || !["org_admin", "super_admin"].includes(inviter.role)) {
      return Response.json(
        { error: "Org admin access required" },
        { status: 403 },
      );
    }

    const parsed = inviteVenueAdminSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.format() }, { status: 400 });
    }
    const { venueId } = parsed.data;
    const email = canonicalizeEmail(parsed.data.email);

    const [venue] = await sql`
      SELECT * FROM venues WHERE id = ${venueId} AND organization_id = ${inviter.organization_id}
    `;
    if (!venue)
      return Response.json({ error: "Venue not found" }, { status: 404 });

    const [existing] = await sql`
      SELECT id FROM auth_users WHERE lower(email) = ${email} LIMIT 1
    `;
    if (existing)
      return Response.json(
        { error: "An account with this email already exists." },
        { status: 400 },
      );

    const [existingInvite] = await sql`
      SELECT id FROM invite_tokens
      WHERE lower(email) = ${email}
      AND used = FALSE AND expires_at > NOW()
      LIMIT 1
    `;
    if (existingInvite)
      return Response.json(
        { error: "An active invite already exists for this email." },
        { status: 400 },
      );

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await sql`
      INSERT INTO invite_tokens (token, email, role, organization_id, venue_id, invited_by, expires_at)
      VALUES (${tokenHash}, ${email}, 'venue_admin', ${
        inviter.organization_id
      }, ${venueId}, ${inviter.id}, ${expiresAt})
    `;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const inviteUrl = `${appUrl}/account/accept-invite?token=${rawToken}`;

    await sendEmail({
      to: email,
      subject: `You've been invited to manage ${venue.name} on NovaChrono`,
      html: inviteVenueAdminEmail({
        inviterName: inviter.name || inviter.email,
        orgName: inviter.org_name,
        venueName: venue.name,
        inviteUrl,
      }),
      text: `You've been invited to manage ${venue.name} on NovaChrono. Accept at: ${inviteUrl}`,
    });

    return Response.json({ success: true, message: `Invite sent to ${email}` });
  } catch (err) {
    console.error("POST /api/org-admin/invite-venue-admin error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

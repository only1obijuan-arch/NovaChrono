import sql from "@/app/api/utils/sql";
import { sendEmail } from "@/app/api/utils/send-email";
import { inviteVenueAdminEmail } from "@/emails/inviteVenueAdminEmail";
import { auth } from "@/auth";
import { randomBytes, createHash } from "crypto";

export async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [inviter] = await sql`
      SELECT au.*, o.name as org_name
      FROM auth_users au
      LEFT JOIN organizations o ON o.id = au.organization_id
      WHERE au.id = ${session.user.id}
    `;
    if (!inviter || !["org_admin", "super_admin"].includes(inviter.role)) {
      return Response.json(
        { error: "Org admin access required" },
        { status: 403 },
      );
    }

    const { email, venueId } = await request.json();
    if (!email || !venueId) {
      return Response.json(
        { error: "Email and venue are required" },
        { status: 400 },
      );
    }

    const [venue] = await sql`
      SELECT * FROM venues WHERE id = ${venueId} AND organization_id = ${inviter.organization_id}
    `;
    if (!venue)
      return Response.json({ error: "Venue not found" }, { status: 404 });

    const [existing] = await sql`
      SELECT id FROM auth_users WHERE LOWER(email) = LOWER(${email}) LIMIT 1
    `;
    if (existing)
      return Response.json(
        { error: "An account with this email already exists." },
        { status: 400 },
      );

    const [existingInvite] = await sql`
      SELECT id FROM invite_tokens
      WHERE LOWER(email) = LOWER(${email})
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
      VALUES (${tokenHash}, ${email.toLowerCase()}, 'venue_admin', ${
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

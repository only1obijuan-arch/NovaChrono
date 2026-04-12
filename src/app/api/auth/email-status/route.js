import sql from "@/app/api/utils/sql";
import { rateLimit } from "@/app/api/utils/rate-limit";

export async function GET(request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const { allowed } = await rateLimit(`email-status:${ip}`, {
      max: 30,
      windowMinutes: 5,
    });
    if (!allowed) return Response.json({ unverified: false });

    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    if (!email) return Response.json({ unverified: false });

    const [user] = await sql`
      SELECT "emailVerified"
      FROM auth_users
      WHERE LOWER(email) = LOWER(${email})
    `;

    // Only return true when the account exists AND is not yet verified.
    // "unverified: false" intentionally covers both "no account" and "already
    // verified" so callers cannot distinguish the two cases.
    return Response.json({ unverified: !!(user && !user.emailVerified) });
  } catch {
    return Response.json({ unverified: false });
  }
}

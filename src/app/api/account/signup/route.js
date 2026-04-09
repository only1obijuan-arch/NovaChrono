import sql from "@/app/api/utils/sql";
import { hash } from "argon2";
import { rateLimit } from "@/app/api/utils/rate-limit";

export async function POST(request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`signup:${ip}`, { max: 5, windowMinutes: 60 });
    if (!allowed) {
      return Response.json({ error: "Too many signup attempts. Try again later." }, { status: 429 });
    }

    const { joinCode, name, email, password, teamName } = await request.json();

    if (!joinCode || !name || !email || !password || !teamName) {
      return Response.json(
        { error: "All fields are required" },
        { status: 400 },
      );
    }

    // Validate league code
    const [league] = await sql`
      SELECT id, name FROM leagues
      WHERE UPPER(join_code) = UPPER(${joinCode})
      AND status IN ('registration', 'active')
    `;
    if (!league) {
      return Response.json(
        { error: "Invalid or expired league code" },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return Response.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    // Check email not already taken
    const [existing] = await sql`
      SELECT id FROM auth_users WHERE LOWER(email) = LOWER(${email})
    `;
    if (existing) {
      return Response.json(
        { error: "An account with this email already exists" },
        { status: 400 },
      );
    }

    const hashedPassword = await hash(password);

    const [newUser] = await sql`
      INSERT INTO auth_users (name, email, role)
      VALUES (${name}, ${email}, 'captain')
      RETURNING id, name, email, role
    `;

    await sql`
      INSERT INTO auth_accounts (
        "userId", provider, type, "providerAccountId", password
      )
      VALUES (
        ${newUser.id}, 'credentials', 'credentials', ${newUser.id}, ${hashedPassword}
      )
    `;

    // Send welcome email (fire-and-forget, don't block on failure)
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (!baseUrl) throw new Error("NEXT_PUBLIC_APP_URL not configured");

      await fetch(`${baseUrl}/api/auth/captain-welcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, teamName, joinCode }),
      });
    } catch (emailErr) {
      console.error("Welcome email failed:", emailErr);
    }

    return Response.json({ success: true, leagueId: league.id });
  } catch (err) {
    console.error("Signup error:", err);
    console.error("Signup error:", err);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

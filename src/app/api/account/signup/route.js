import { sendCaptainWelcome } from "@/app/api/utils/captain-welcome";
import { isValidJoinCode } from "@/utils/join-code";
import sql, { withTransaction } from "@/app/api/utils/sql";
import { hash } from "argon2";
import { rateLimit } from "@/app/api/utils/rate-limit";
import { sendEmail } from "@/app/api/utils/send-email";
import { verifyEmail } from "@/emails/verifyEmail";
import crypto from "crypto";
import { z } from "zod";
import { canonicalizeEmail } from "@/app/api/utils/email";

const signupSchema = z.object({
  joinCode: z.string().trim().refine(isValidJoinCode, "League code must be 6 or 8 letters or digits"),
  name: z.string().min(1).max(100),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  teamName: z.string().min(1).max(100),
});

export async function POST(request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`signup:${ip}`, { max: 5, windowMinutes: 60 });
    if (!allowed) {
      return Response.json({ error: "Too many signup attempts. Try again later." }, { status: 429 });
    }

    const parsed = signupSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.format() }, { status: 400 });
    }
    const { joinCode, name, password, teamName } = parsed.data;
    const email = canonicalizeEmail(parsed.data.email);

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

    const hashedPassword = await hash(password);

    // Generate email verification token before the transaction so it's ready
    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyTokenHash = crypto.createHash("sha256").update(verifyToken).digest("hex");
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await withTransaction(async (txSql) => {
      // Lock the slot inside the transaction to prevent concurrent signups
      // claiming the same slot. FOR UPDATE SKIP LOCKED lets a second concurrent
      // request skip this row and claim the next free slot rather than blocking.
      const [claimedSlot] = await txSql`
        SELECT ls.id
        FROM league_slots ls
        LEFT JOIN teams t ON t.slot_id = ls.id AND t.status = 'active'
        WHERE ls.league_id = ${league.id} AND t.id IS NULL
        ORDER BY ls.slot_number
        LIMIT 1
        FOR UPDATE OF ls SKIP LOCKED
      `;
      if (!claimedSlot) {
        const err = new Error("This league is full. No slots are available.");
        err.code = "LEAGUE_FULL";
        throw err;
      }

      let newUser;
      try {
        [newUser] = await txSql`
          INSERT INTO auth_users (name, email, role)
          VALUES (${name}, ${email}, 'captain')
          RETURNING id, name, email, role
        `;
      } catch (insertErr) {
        if (insertErr.code === "23505") {
          const err = new Error("An account with this email already exists");
          err.code = "DUPLICATE_EMAIL";
          throw err;
        }
        throw insertErr;
      }

      await txSql`
        INSERT INTO auth_accounts (
          "userId", provider, type, "providerAccountId", password
        )
        VALUES (
          ${newUser.id}, 'credentials', 'credentials', ${newUser.id}, ${hashedPassword}
        )
      `;

      await txSql`
        INSERT INTO teams (league_id, slot_id, name, captain_user_id)
        VALUES (${league.id}, ${claimedSlot.id}, ${teamName}, ${newUser.id})
      `;

      await txSql`
        INSERT INTO auth_verification_token (identifier, token, expires)
        VALUES (${email}, ${verifyTokenHash}, ${verifyExpires})
      `;
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const verifyUrl = `${appUrl}/account/verify?token=${verifyToken}`;

    // Send verification email (fire-and-forget)
    sendEmail({
      to: email,
      subject: "NovaChrono — Verify Your Email",
      html: verifyEmail({ name, verifyUrl }),
      text: `NovaChrono — Verify Your Email\n\nHi ${name},\n\nClick the link below to verify your email:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
    }).catch((err) => console.error("Verification email failed:", err));

    await sendCaptainWelcome({ email, name, teamName, joinCode }).catch((err) => {
      console.error("Welcome email failed:", err);
    });

    return Response.json({ success: true, requiresVerification: true });
  } catch (err) {
    if (err.code === "LEAGUE_FULL" || err.code === "DUPLICATE_EMAIL") {
      return Response.json({ error: err.message }, { status: 400 });
    }
    console.error("Signup error:", err);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

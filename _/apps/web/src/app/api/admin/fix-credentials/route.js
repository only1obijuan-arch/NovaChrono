import sql from "@/app/api/utils/sql";
import { hash } from "argon2";

/**
 * ONE-TIME UTILITY: Fix missing credentials for users 1 & 2
 * This properly hashes passwords and creates auth_accounts records
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { secret } = body;

    // Safety check
    if (secret !== "fix-credentials-now") {
      return Response.json({ error: "Invalid secret" }, { status: 403 });
    }

    const tempPassword = "TempPassword123!";
    const hashedPassword = await hash(tempPassword);

    console.log("🔧 Hashing password with argon2...");
    console.log("🔧 Hash generated:", hashedPassword.substring(0, 30) + "...");

    // Delete existing broken records
    await sql`DELETE FROM auth_accounts WHERE "userId" IN (1, 2)`;
    console.log("🔧 Deleted old broken credentials");

    // Create proper credentials for user 1
    await sql`
      INSERT INTO auth_accounts ("userId", provider, type, "providerAccountId", password)
      VALUES (1, 'credentials', 'credentials', '1', ${hashedPassword})
    `;
    console.log("✅ Created credentials for user 1 (admin@leaguepro.com)");

    // Create proper credentials for user 2
    await sql`
      INSERT INTO auth_accounts ("userId", provider, type, "providerAccountId", password)
      VALUES (2, 'credentials', 'credentials', '2', ${hashedPassword})
    `;
    console.log("✅ Created credentials for user 2 (venue@leaguepro.com)");

    // Verify the records were created
    const verification = await sql`
      SELECT 
        a."userId",
        u.email,
        a.provider,
        LENGTH(a.password) as password_length,
        SUBSTRING(a.password, 1, 20) as password_preview
      FROM auth_accounts a
      JOIN auth_users u ON a."userId" = u.id
      WHERE a."userId" IN (1, 2)
      ORDER BY a."userId"
    `;

    return Response.json({
      success: true,
      message: "Credentials fixed successfully",
      tempPassword: "TempPassword123!",
      verification,
    });
  } catch (err) {
    console.error("❌ Error fixing credentials:", err);
    return Response.json(
      { error: "Failed to fix credentials", details: err.message },
      { status: 500 },
    );
  }
}

import sql from "@/app/api/utils/sql";
import { hash } from "argon2";

export async function POST() {
  try {
    const newPassword = "TempPassword123!";
    const hashedPassword = await hash(newPassword);

    const result = await sql`
      UPDATE auth_accounts
      SET password = ${hashedPassword}
      WHERE provider = 'credentials'
      RETURNING "userId"
    `;

    return Response.json({
      success: true,
      message: `Reset ${result.length} passwords to: ${newPassword}`,
      updatedCount: result.length,
    });
  } catch (error) {
    console.error("Error resetting passwords:", error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}

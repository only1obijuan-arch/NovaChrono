import { hash } from "argon2";
import sql from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    // Hash the password with argon2id
    const hashedPassword = await hash(password, {
      type: 2, // argon2id
    });

    // Update the password
    const result = await sql`
      UPDATE auth_accounts 
      SET password = ${hashedPassword}
      WHERE "providerAccountId" = ${email}
      RETURNING id, "userId", provider, "providerAccountId"
    `;

    if (result.length === 0) {
      return Response.json({ error: "Account not found" }, { status: 404 });
    }

    return Response.json({
      success: true,
      message: "Password updated successfully",
      account: result[0],
    });
  } catch (error) {
    console.error("Error updating password:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

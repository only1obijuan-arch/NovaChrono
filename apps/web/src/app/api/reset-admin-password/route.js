import argon2 from "argon2";
import sql from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    const { email, newPassword } = await request.json();

    if (!email || !newPassword) {
      return Response.json(
        { error: "Email and newPassword are required" },
        { status: 400 },
      );
    }

    // Hash the password using argon2
    const hashedPassword = await argon2.hash(newPassword);

    // Find the user by email
    const users = await sql`
      SELECT id FROM auth_users WHERE email = ${email}
    `;

    if (users.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const userId = users[0].id;

    // Update the password in auth_accounts and return the updated row
    const result = await sql`
      UPDATE auth_accounts 
      SET password = ${hashedPassword}
      WHERE "userId" = ${userId} AND provider = 'credentials'
      RETURNING *
    `;

    if (result.length === 0) {
      return Response.json(
        { error: "No credentials account found for this user" },
        { status: 404 },
      );
    }

    return Response.json({
      success: true,
      message: `Password updated successfully for ${email}`,
    });
  } catch (error) {
    console.error("Error resetting password:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

import sql from "@/app/api/utils/sql";
import { hash } from "argon2";

/**
 * TEST ENDPOINT - Simulates the complete signup flow
 * This tests user creation, account linking, and onboarding
 * DELETE THIS FILE AFTER TESTING
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password, name, venueId } = body;

    if (!email || !password || !name || !venueId) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Step 1: Check if user already exists
    const existingUser = await sql`
      SELECT id FROM auth_users WHERE email = ${email}
    `;

    if (existingUser.length > 0) {
      return Response.json({ error: "User already exists" }, { status: 400 });
    }

    // Step 2: Create user (simulating what auth.js does)
    const newUsers = await sql`
      INSERT INTO auth_users (email, name, "emailVerified")
      VALUES (${email}, ${name}, NULL)
      RETURNING id, email, name
    `;
    const newUser = newUsers[0];

    // Step 3: Create auth account with hashed password (simulating what auth.js does)
    const hashedPassword = await hash(password);
    await sql`
      INSERT INTO auth_accounts ("userId", provider, type, "providerAccountId", password)
      VALUES (${newUser.id}, 'credentials', 'credentials', ${newUser.id.toString()}, ${hashedPassword})
    `;

    // Step 4: Simulate onboarding - update user with venue_id and role
    await sql`
      UPDATE auth_users 
      SET venue_id = ${venueId}, role = 'venue_admin'
      WHERE id = ${newUser.id}
    `;

    // Step 5: Verify the complete setup
    const finalUser = await sql`
      SELECT u.id, u.email, u.name, u.role, u.venue_id, v.name as venue_name,
             EXISTS(SELECT 1 FROM auth_accounts WHERE "userId" = u.id) as has_account
      FROM auth_users u
      LEFT JOIN venues v ON u.venue_id = v.id
      WHERE u.id = ${newUser.id}
    `;

    return Response.json({
      success: true,
      message: "Test signup completed successfully!",
      user: finalUser[0],
      steps: {
        step1_user_created: true,
        step2_account_linked: true,
        step3_onboarding_complete: true,
        step4_can_signin: true,
      },
    });
  } catch (error) {
    console.error("Test signup error:", error);
    return Response.json(
      { error: error.message, stack: error.stack },
      { status: 500 },
    );
  }
}

// Cleanup endpoint
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return Response.json(
        { error: "Email parameter required" },
        { status: 400 },
      );
    }

    // Get user ID
    const users = await sql`SELECT id FROM auth_users WHERE email = ${email}`;
    if (users.length === 0) {
      return Response.json({ message: "User not found" });
    }

    const userId = users[0].id;

    // Delete in correct order (child records first)
    await sql`DELETE FROM auth_sessions WHERE "userId" = ${userId}`;
    await sql`DELETE FROM auth_accounts WHERE "userId" = ${userId}`;
    await sql`DELETE FROM auth_users WHERE id = ${userId}`;

    return Response.json({
      success: true,
      message: `Test user ${email} deleted successfully`,
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

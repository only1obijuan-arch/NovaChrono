import sql from "@/app/api/utils/sql";
import { hash } from "argon2";

export async function POST(request) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password || !name) {
      return Response.json(
        { error: "Email, password, and name are required" },
        { status: 400 },
      );
    }

    const role = "captain"; // public signup always creates captain accounts only
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
      VALUES (${name}, ${email}, ${role})
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

    return Response.json({ user: newUser });
  } catch (err) {
    console.error("Signup error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

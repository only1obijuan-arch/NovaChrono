import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { hash } from "argon2";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const [user] =
    await sql`SELECT * FROM auth_users WHERE id = ${session.user.id}`;
  if (!user || !["venue_admin", "super_admin"].includes(user.role)) return null;
  return user;
}

export async function GET(request) {
  try {
    const admin = await requireAdmin();
    if (!admin)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get("venueId");

    if (!venueId)
      return Response.json({ error: "venueId required" }, { status: 400 });

    const referees = await sql`
      SELECT 
        au.id, au.name, au.email, au.field_number, au.role,
        v.name as venue_name
      FROM auth_users au
      LEFT JOIN venues v ON au.venue_id = v.id
      WHERE au.venue_id = ${venueId} AND au.role = 'referee'
      ORDER BY au.field_number ASC
    `;

    return Response.json({ referees });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    if (!admin)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { venueId, fieldNumber } = await request.json();

    if (!venueId || !fieldNumber) {
      return Response.json(
        { error: "venueId and fieldNumber required" },
        { status: 400 },
      );
    }

    // Get venue details for email format
    const [venue] = await sql`SELECT * FROM venues WHERE id = ${venueId}`;
    if (!venue)
      return Response.json({ error: "Venue not found" }, { status: 404 });

    // Slugify venue name for email
    const venueSlug = venue.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const email = `ref-field${fieldNumber}@${venueSlug}.novachrono.com`;
    const name = `Referee — Field ${fieldNumber}`;

    // Check if already exists
    const [existing] = await sql`
      SELECT au.*, aa.password as hashed_password
      FROM auth_users au
      LEFT JOIN auth_accounts aa ON aa."userId" = au.id AND aa.provider = 'credentials'
      WHERE au.email = ${email}
    `;

    if (existing) {
      // Return existing — but we can't recover the plain password
      // So we regenerate and update
      const newPassword = generatePassword(fieldNumber, venueSlug);
      const hashedPassword = await hash(newPassword);

      await sql`
        UPDATE auth_accounts SET password = ${hashedPassword}
        WHERE "userId" = ${existing.id} AND provider = 'credentials'
      `;

      return Response.json({
        referee: {
          id: existing.id,
          name: existing.name,
          email,
          fieldNumber,
          password: newPassword,
          venueName: venue.name,
          isExisting: true,
        },
      });
    }

    // Generate a deterministic but secure password
    const password = generatePassword(fieldNumber, venueSlug);
    const hashedPassword = await hash(password);

    // Create the user
    const [newUser] = await sql`
      INSERT INTO auth_users (name, email, role, venue_id, field_number)
      VALUES (${name}, ${email}, 'referee', ${venueId}, ${fieldNumber})
      RETURNING *
    `;

    // Create credentials account
    await sql`
      INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password)
      VALUES (${newUser.id}, 'credentials', 'credentials', ${email}, ${hashedPassword})
    `;

    return Response.json({
      referee: {
        id: newUser.id,
        name,
        email,
        fieldNumber,
        password,
        venueName: venue.name,
        isExisting: false,
      },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const admin = await requireAdmin();
    if (!admin)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const refereeId = searchParams.get("id");

    if (!refereeId)
      return Response.json({ error: "id required" }, { status: 400 });

    await sql`DELETE FROM auth_accounts WHERE "userId" = ${refereeId}`;
    await sql`DELETE FROM auth_users WHERE id = ${refereeId} AND role = 'referee'`;

    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function generatePassword(fieldNumber, venueSlug) {
  // Memorable but secure: VenueField + number pattern
  const base = venueSlug.substring(0, 4).toUpperCase();
  const suffix = String(fieldNumber).padStart(2, "0");
  const salt = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${base}-F${suffix}-${salt}`;
}

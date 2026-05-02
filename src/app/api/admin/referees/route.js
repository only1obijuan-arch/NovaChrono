import sql, { withTransaction } from "@/app/api/utils/sql";
import { requireRole } from "@/app/api/utils/auth";
import { hash } from "argon2";
import { randomBytes } from "crypto";
import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const createRefereeSchema = z.object({
  venueId: z.string().min(1),
  fieldNumber: z.coerce.number().int().min(1).max(999),
  name: z.string().min(1).max(100).optional(),
});

export async function GET(request) {
  try {
    const admin = await requireRole(request, "venue_admin", "super_admin");
    if (!admin)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get("venueId");

    if (!venueId)
      return Response.json({ error: "venueId required" }, { status: 400 });

    if (admin.role !== "super_admin" && venueId !== admin.venue_id)
      return Response.json({ error: "Forbidden" }, { status: 403 });

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
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const admin = await requireRole(request, "venue_admin", "super_admin");
    if (!admin)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = createRefereeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.format() }, { status: 400 });
    }
    const { venueId, fieldNumber, name } = parsed.data;

    if (admin.role !== "super_admin" && venueId !== admin.venue_id)
      return Response.json({ error: "Forbidden" }, { status: 403 });

    const [venue] = await sql`SELECT * FROM venues WHERE id = ${venueId}`;
    if (!venue)
      return Response.json({ error: "Venue not found" }, { status: 404 });

    const venueSlug = venue.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const email = `ref-field${fieldNumber}@${venueSlug}.novachrono.com`;
    const refName = name?.trim() || `Referee — Field ${fieldNumber}`;

    const [existing] = await sql`
      SELECT au.*, aa.password as hashed_password
      FROM auth_users au
      LEFT JOIN auth_accounts aa ON aa."userId" = au.id AND aa.provider = 'credentials'
      WHERE au.email = ${email}
    `;

    if (existing) {
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

    const password = generatePassword(fieldNumber, venueSlug);
    const hashedPassword = await hash(password);

    const [newUser] = await sql`
      INSERT INTO auth_users (name, email, role, venue_id, field_number, "emailVerified")
      VALUES (${refName}, ${email}, 'referee', ${venueId}, ${fieldNumber}, NOW())
      RETURNING *
    `;

    await sql`
      INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password)
      VALUES (${newUser.id}, 'credentials', 'credentials', ${email}, ${hashedPassword})
    `;

    return Response.json({
      referee: {
        id: newUser.id,
        name: refName,
        email,
        fieldNumber,
        password,
        venueName: venue.name,
        isExisting: false,
      },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const admin = await requireRole(request, "venue_admin", "super_admin");
    if (!admin)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const refereeId = searchParams.get("id");

    if (!refereeId)
      return Response.json({ error: "id required" }, { status: 400 });

    if (!UUID_RE.test(refereeId))
      return Response.json({ error: "Invalid id" }, { status: 400 });

    if (admin.role !== "super_admin") {
      const [referee] = await sql`
        SELECT venue_id FROM auth_users WHERE id = ${refereeId} AND role = 'referee'
      `;
      if (!referee)
        return Response.json({ error: "Referee not found" }, { status: 404 });
      if (referee.venue_id !== admin.venue_id)
        return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    await withTransaction(async (txSql) => {
      await txSql`DELETE FROM auth_accounts WHERE "userId" = ${refereeId}`;
      await txSql`DELETE FROM auth_users WHERE id = ${refereeId} AND role = 'referee'`;
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

function generatePassword(fieldNumber, venueSlug) {
  const base = venueSlug.substring(0, 4).toUpperCase();
  const suffix = String(fieldNumber).padStart(2, "0");
  const salt = randomBytes(4).toString("hex").toUpperCase();
  return `${base}-F${suffix}-${salt}`;
}

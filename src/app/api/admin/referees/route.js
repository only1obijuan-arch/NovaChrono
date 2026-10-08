import sql, { withTransaction } from "@/app/api/utils/sql";
import { requireRole } from "@/app/api/utils/auth";
import { hash } from "argon2";
import { randomBytes } from "crypto";
import { z } from "zod";
import { canonicalizeEmail } from "@/app/api/utils/email";
import { invalidateUserSessions } from "@/app/api/utils/session-security";

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
    const email = canonicalizeEmail(`ref-field${fieldNumber}@${venueSlug}.novachrono.com`);
    const refName = name?.trim() || `Referee — Field ${fieldNumber}`;

    const [existing] = await sql`
      SELECT au.*, aa.password as hashed_password
      FROM auth_users au
      LEFT JOIN auth_accounts aa ON aa."userId" = au.id AND aa.provider = 'credentials'
      WHERE au.email = ${email}
    `;

    if (existing) {
      if (existing.role !== "referee" || existing.venue_id !== venueId) {
        return Response.json(
          { error: "Generated referee identity is already assigned elsewhere" },
          { status: 409 },
        );
      }

      const newPassword = generatePassword(fieldNumber, venueSlug);
      const hashedPassword = await hash(newPassword);

      await withTransaction(async (txSql) => {
        await txSql`
          INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password)
          VALUES (${existing.id}, 'credentials', 'credentials', ${email}, ${hashedPassword})
          ON CONFLICT ("userId", provider)
          DO UPDATE SET password = EXCLUDED.password
        `;
        await invalidateUserSessions(txSql, existing.id);
      });

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

    const newUser = await withTransaction(async (txSql) => {
      const [created] = await txSql`
        INSERT INTO auth_users (name, email, role, venue_id, organization_id, field_number, "emailVerified")
        VALUES (${refName}, ${email}, 'referee', ${venueId}, ${venue.organization_id}, ${fieldNumber}, NOW())
        RETURNING *
      `;
      await txSql`
        INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password)
        VALUES (${created.id}, 'credentials', 'credentials', ${email}, ${hashedPassword})
      `;
      return created;
    });

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

    await withTransaction(async (txSql) => {
      const [referee] = await txSql`
        SELECT id, venue_id
        FROM auth_users
        WHERE id = ${refereeId} AND role = 'referee'
        FOR UPDATE
      `;
      if (!referee) throw routeError("REFEREE_NOT_FOUND");
      if (admin.role !== "super_admin" && referee.venue_id !== admin.venue_id) {
        throw routeError("REFEREE_FORBIDDEN");
      }

      await txSql`UPDATE matches SET referee_id = NULL WHERE referee_id = ${refereeId}`;
      await txSql`DELETE FROM auth_users WHERE id = ${refereeId}`;
    });

    return Response.json({ success: true });
  } catch (error) {
    if (error.message === "REFEREE_NOT_FOUND") {
      return Response.json({ error: "Referee not found" }, { status: 404 });
    }
    if (error.message === "REFEREE_FORBIDDEN") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error.code === "23503") {
      return Response.json(
        { error: "Referee is retained by historical records" },
        { status: 409 },
      );
    }
    console.error(error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

function routeError(message) {
  return Object.assign(new Error(message), { expose: true });
}

function generatePassword(fieldNumber, venueSlug) {
  const base = venueSlug.substring(0, 4).toUpperCase();
  const suffix = String(fieldNumber).padStart(2, "0");
  const salt = randomBytes(4).toString("hex").toUpperCase();
  return `${base}-F${suffix}-${salt}`;
}

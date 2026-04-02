import sql from "@/app/api/utils/sql";

export async function GET() {
  try {
    const venues = await sql`SELECT * FROM venues ORDER BY name`;
    return Response.json(venues);
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

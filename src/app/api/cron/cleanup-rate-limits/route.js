import { pool } from "@/app/api/utils/db";

export async function POST(request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const r1 = await pool.query(
      "DELETE FROM api_rate_limits WHERE window_start < NOW() - INTERVAL '1 day'"
    );
    const r2 = await pool.query(
      "DELETE FROM auth_rate_limits WHERE locked_until < NOW() - INTERVAL '1 day'"
    );
    return Response.json({ deleted: r1.rowCount + r2.rowCount });
  } catch (error) {
    console.error("[cleanup-rate-limits]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

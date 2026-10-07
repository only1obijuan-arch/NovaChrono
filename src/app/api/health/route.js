import { pool } from "@/app/api/utils/db";

export const dynamic = "force-dynamic";

function applicationVersion() {
  return (
    process.env.APP_VERSION ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    "unknown"
  );
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  const base = {
    service: "novachrono-web",
    version: applicationVersion(),
    environment: process.env.APP_ENV || process.env.NODE_ENV || "unknown",
    checkedAt,
  };

  try {
    const readiness = await pool.query(`
      SELECT
        1 AS ready,
        to_regclass('public.schema_migrations')::text AS migrations_table
    `);

    let migration = null;
    if (readiness.rows[0]?.migrations_table) {
      const result = await pool.query(
        "SELECT name FROM schema_migrations ORDER BY id DESC LIMIT 1"
      );
      migration = result.rows[0]?.name ?? null;
    }

    return Response.json({
      ...base,
      status: "ready",
      database: "ready",
      migration,
    });
  } catch (error) {
    console.error("Health readiness check failed", {
      name: error?.name,
      code: error?.code,
    });
    return Response.json(
      { ...base, status: "degraded", database: "unavailable", migration: null },
      { status: 503 }
    );
  }
}

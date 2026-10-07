import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@/app/api/utils/db", () => ({ pool: { query: mocks.query } }));

import { GET } from "@/app/api/health/route";

describe("health endpoint", () => {
  beforeEach(() => mocks.query.mockReset());

  it("reports readiness and the latest migration without exposing configuration", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ ready: 1, migrations_table: "schema_migrations" }] })
      .mockResolvedValueOnce({ rows: [{ name: "0002_add_unique_league_slots.sql" }] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      service: "novachrono-web",
      status: "ready",
      database: "ready",
      migration: "0002_add_unique_league_slots.sql",
    });
    expect(JSON.stringify(body)).not.toMatch(/DATABASE_URL|AUTH_SECRET|token/i);
  });

  it("returns a safe 503 when the database is unavailable", async () => {
    mocks.query.mockRejectedValueOnce(Object.assign(new Error("secret connection detail"), { code: "ECONNREFUSED" }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ status: "degraded", database: "unavailable" });
    expect(JSON.stringify(body)).not.toContain("secret connection detail");
  });
});

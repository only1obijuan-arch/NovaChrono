import { describe, expect, it, vi } from "vitest";
import { getAppliedReadOnly, run } from "../../scripts/migrate.js";

describe("read-only migration status", () => {
  it("uses only a catalogue lookup when the metadata table is absent", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ relation: null }] });

    await expect(getAppliedReadOnly({ query })).resolves.toEqual(new Set());
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("to_regclass");
  });

  it("reads applied migration names only after confirming the table exists", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ relation: "schema_migrations" }] })
      .mockResolvedValueOnce({ rows: [{ name: "0001_initial.sql" }] });

    await expect(getAppliedReadOnly({ query })).resolves.toEqual(
      new Set(["0001_initial.sql"])
    );
    expect(query.mock.calls.map(([statement]) => statement)).toEqual([
      "SELECT to_regclass('public.schema_migrations') AS relation",
      "SELECT name FROM schema_migrations ORDER BY id",
    ]);
  });

  it("never sends DDL or transaction statements in status mode", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ relation: null }] });
    const release = vi.fn();
    const end = vi.fn();
    const log = vi.fn();

    await run({
      showStatus: true,
      connectionString: "postgres://read-only-test",
      logger: { log },
      poolFactory: () => ({ connect: async () => ({ query, release }), end }),
    });

    const statements = query.mock.calls.map(([statement]) => statement).join("\n");
    expect(statements).toContain("to_regclass");
    expect(statements).not.toMatch(/CREATE|INSERT|UPDATE|DELETE|ALTER|BEGIN|COMMIT/i);
    expect(release).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
  });
});

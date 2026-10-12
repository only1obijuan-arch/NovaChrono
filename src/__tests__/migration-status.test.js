import { describe, expect, it, vi } from "vitest";
import {
  assertGate4aCompatibility,
  getAppliedReadOnly,
  INCOMPLETE_GATE4A_MESSAGE,
  run,
} from "../../scripts/migrate.js";

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

describe("Gate 4A migration ledger compatibility", () => {
  it("does not require Gate 4A objects when the ledger stops at 0007", async () => {
    const query = vi.fn();
    await expect(assertGate4aCompatibility({ query }, new Set(["0007_match_goal_idempotency.sql"]))).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });

  it("accepts a current 0008 ledger entry only when all amended objects exist", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      date_function: true,
      timestamptz_function: true,
      result_type_column: true,
      result_type_constraint: true,
      schedule_index: true,
      referee_index: true,
    }] });
    await expect(assertGate4aCompatibility({ query }, new Set(["0008_gate4a_league_operations.sql"]))).resolves.toBeUndefined();
  });

  it("fails closed when the ledger claims an old or incomplete 0008", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      date_function: false,
      timestamptz_function: false,
      result_type_column: true,
      result_type_constraint: true,
      schedule_index: false,
      referee_index: false,
    }] });
    await expect(assertGate4aCompatibility({ query }, new Set(["0008_gate4a_league_operations.sql"])))
      .rejects.toThrow(INCOMPLETE_GATE4A_MESSAGE);
  });
});

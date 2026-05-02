import { describe, it, expect } from "vitest";
import { createHash, randomBytes } from "crypto";

// Mirrors token creation in src/app/api/admin/invite/route.js (lines 46-48)
// and validation in accept-invite/route.js (line 24).
function generateToken() {
  return randomBytes(32).toString("hex");
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

describe("invite token creation", () => {
  it("generates a 64-character hex string (32 random bytes)", () => {
    const token = generateToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it("two generated tokens are never equal", () => {
    // Probability of collision: 1/2^256 — effectively impossible
    const t1 = generateToken();
    const t2 = generateToken();
    expect(t1).not.toBe(t2);
  });
});

describe("invite token hashing (SHA-256)", () => {
  it("hash is 64 hex characters", () => {
    const hash = hashToken(generateToken());
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("hash is deterministic: same input always produces same output", () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("plain token is never equal to its own hash (raw token is not stored)", () => {
    const token = generateToken();
    expect(hashToken(token)).not.toBe(token);
  });

  it("different tokens produce different hashes", () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(hashToken(t1)).not.toBe(hashToken(t2));
  });

  it("known vector: hash matches Node's own crypto output", () => {
    const token = "fixed-test-token-for-vector-check";
    const expected = createHash("sha256").update(token).digest("hex");
    expect(hashToken(token)).toBe(expected);
  });
});

describe("invite token flow invariants", () => {
  it("validate step uses the same hash as create step (token round-trips)", () => {
    // Simulates: POST /invite creates hash and stores it,
    // GET /invite?token= hashes the query param and looks it up.
    const rawToken = generateToken();
    const storedHash = hashToken(rawToken); // what goes into DB

    // Validation: user hits the link with the raw token
    const lookupHash = hashToken(rawToken);
    expect(lookupHash).toBe(storedHash);
  });

  it("a tampered token produces a different hash (cannot forge a valid lookup)", () => {
    const rawToken = generateToken();
    const storedHash = hashToken(rawToken);

    const tamperedToken = rawToken.slice(0, -1) + (rawToken.endsWith("a") ? "b" : "a");
    expect(hashToken(tamperedToken)).not.toBe(storedHash);
  });

  it("reusing a consumed token is detectable: same hash is looked up, DB `used` flag blocks it", () => {
    // This test documents the protocol: the DB row has used=TRUE after acceptance.
    // The hash is identical on reuse, so the SELECT WHERE used=FALSE returns nothing.
    const rawToken = generateToken();
    const hash = hashToken(rawToken);

    // Simulate the DB state after acceptance
    const dbRow = { token: hash, used: true, expires_at: new Date(Date.now() + 3600_000) };

    // Lookup condition mirrors the SQL in route.js:
    //   WHERE token = $hash AND used = FALSE AND expires_at > NOW()
    const isValid = dbRow.token === hash && !dbRow.used && dbRow.expires_at > new Date();
    expect(isValid).toBe(false);
  });

  it("an expired token is rejected even if unused and hash matches", () => {
    const rawToken = generateToken();
    const hash = hashToken(rawToken);

    const dbRow = {
      token: hash,
      used: false,
      expires_at: new Date(Date.now() - 1), // 1ms in the past
    };

    const isValid = dbRow.token === hash && !dbRow.used && dbRow.expires_at > new Date();
    expect(isValid).toBe(false);
  });

  it("a valid unused non-expired token is accepted", () => {
    const rawToken = generateToken();
    const hash = hashToken(rawToken);

    const dbRow = {
      token: hash,
      used: false,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };

    const isValid = dbRow.token === hash && !dbRow.used && dbRow.expires_at > new Date();
    expect(isValid).toBe(true);
  });
});

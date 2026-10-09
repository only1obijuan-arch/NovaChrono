# NovaChrono Gate 3A Match Integrity Report

- Date: 2026-10-09
- Branch: `gate3/match-integrity`
- Starting SHA: `a0ca6b0d639f045ed53c87efea4f687fb9a74c34`
- Final implementation SHA: `3cd64cf62266fc2cd008d479d45b1de2f2a6a2e5`
- Narrow-remediation starting HEAD: `b631f18a0b82943f8c2587604d9d3505aea14520`
- Narrow-remediation implementation SHA: `4027ead3cad26db09879e9c4ee0b4beb90920d1a`

The original implementation SHA contains the initial application, migration, test, CI, and rehearsal changes. The narrow-remediation implementation SHA contains the adversarial-review fixes and their tests. This report and its remediation record are added by documentation-only follow-up commits; the final branch-head SHA is recorded in the review handoff because a commit cannot embed its own SHA.

## Outcome

Gate 3A makes match writes atomic around the locked match row, adds retry-safe goal recording, rebuilds standings from final-match truth, audits goal deletion, and prevents the web and mobile referee clients from reporting failed commands as successful. The existing architecture and UI design were preserved.

No production or staging database was accessed or modified. No Neon migration was run. Vercel, its configuration, the GitHub default branch, and every project outside NovaChrono were untouched. The branch was committed locally and was not merged, pushed, or deployed.

## Files changed

- `.github/workflows/ci.yml`
- `migrations/0007_match_goal_idempotency.sql`
- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/src/app/referee/match/[id].jsx`
- `scripts/verify-gate2-migrations.ps1`
- `src/app/api/matches/route.js`
- `src/app/api/matches/standings.js`
- `src/app/providers.jsx`
- `src/app/referee/match/[id]/page.jsx`
- `src/__tests__/gate3-schema.test.js`
- `src/__tests__/match-client-contracts.test.js`
- `src/__tests__/match-correction.test.js`
- `src/__tests__/standings.test.js`
- `tests/integration/gate2-remediation-routes.test.js`
- `tests/e2e/smoke.spec.js`
- `docs/gate3-match-integrity-report.md` (documentation-only follow-up commit)

Migrations `0001` through `0006` were not modified.

## Migration 0007

`0007_match_goal_idempotency.sql` adds a nullable UUID `match_events.operation_id`. UUID was chosen deliberately because both clients have secure RFC 4122 v4 generation available, PostgreSQL validates the identifier at the boundary, and the fixed-width type keeps the match-scoped index compact.

Historical events remain valid because the column is nullable. A validated CHECK permits a non-null operation ID only when `type` is non-null and is `goal_home` or `goal_away`; this remains safe even in the production shape where `match_events.type` is nullable. A partial unique index on `(match_id, operation_id) WHERE operation_id IS NOT NULL` scopes idempotency to one match while leaving historical and non-goal events unaffected. The migration applies a five-second local lock timeout and is transactional under the existing migration runner.

## Transaction boundaries

The request may resolve the session identity, apply a cheap coarse `WRITE_ROLES` rejection, and validate the JSON shape before a transaction, but the coarse role result is not trusted as write authorization. No pre-lock venue, referee assignment, match state, team, or player result is trusted for a write. Each state-changing command uses `withTransaction`, locks the target row through `SELECT ... FOR UPDATE OF m`, reloads the live actor inside the transaction, and authorizes against the locked match's role, venue, and referee assignment.

- `START_MATCH`: match lock -> live actor/venue/referee authorization -> scheduled-state validation -> server-side status/start timestamp update -> first-half event insert -> commit.
- `START_SECOND_HALF`: match lock -> authorization -> live/first-half consistency checks -> duplicate phase check -> server-side second-half timestamp update -> second-half event insert -> commit. A fully consistent repeat is an idempotent success; a partially inconsistent state is rejected.
- `RECORD_GOAL`: match lock -> authorization -> live-state check -> current active scoring-team lookup -> optional player existence/membership validation -> idempotent event insert -> score increment only when the insert is new -> commit.
- `DELETE_EVENT`: match lock -> authorization -> live-state check -> event lock constrained by `match_id` -> goal-only check -> guarded score decrement -> event deletion -> audit insert -> commit. Any audit failure rolls the correction back.
- `END_MATCH`: match lock -> authorization -> live-to-final transition -> end event -> deterministic standings rebuild -> commit. A repeat against an already-final match safely rebuilds standings and returns idempotent success without another event.
- `ADMIN_OVERRIDE`: match lock -> existing admin authorization -> score/status update -> standings rebuild when either old or new state is final -> audit insert -> commit.
- `ASSIGN_REFEREE`: match lock -> admin authorization -> optional live referee/venue lookup -> assignment update -> commit.

Thrown database failures leave `withTransaction` through rollback and are converted to HTTP 500 only outside the transaction. Forced-failure integration tests verify rollback after the first mutation for start, second-half, goal, deletion/audit, and finalisation paths.

## Goal idempotency

Each deliberate goal action from the updated clients creates one UUID operation ID. TanStack Query's one transient retry receives the same mutation variables, so it resends the same ID. Web player selection remains open after failure and reuses the same pending ID; cancelling clears it, and a new deliberate goal click creates a new one. Mobile preserves a failed same-side operation ID for resubmission, clears it after success/cancel, and creates a new ID for a different or completed action.

When `opId` is present, the server inserts with `ON CONFLICT ... DO NOTHING`. A new row alone authorizes the score increment. On a duplicate, the stored type, player and resolved team must match the repeated command; an exact repeat returns `{ success: true, idempotent: true }`, while reuse for a different goal command returns 409. Player attribution is allowed only when the player exists and belongs to the resolved scoring team. Null/unknown player attribution remains supported.

## Narrow remediation after adversarial review

Claude's adversarial verdict was `NOVA GATE 3A ADVERSARIAL REVIEW — REMEDIATION REQUIRED`. It identified one P1: making `RECORD_GOAL.opId` mandatory would break pre-Gate-3 web/mobile clients, and the mobile native-build requirement prevents assuming an instantaneous fleet cutover.

The selected temporary compatibility strategy makes `opId` optional only at the request boundary:

- With a valid UUID `opId`, all Gate 3 idempotency behavior is unchanged: exact repeats succeed idempotently, mismatched reuse conflicts, concurrent delivery creates one event, and the score increments only for a newly inserted event.
- Without `opId`, the server uses the same locked-match transaction, live in-transaction authorization, team resolution, optional player/team validation, event/score atomicity, and rollback guarantees. It inserts `operation_id = NULL`, increments once for that received request, returns a non-sensitive `legacy: true` marker, and emits a concise warning with no user, match, venue, or player data.
- The legacy path deliberately does not fabricate an operation ID and is not retry-idempotent. Its warning makes remaining legacy traffic observable.

The compatibility window may be removed only after the updated web deployment is established, the native mobile build containing stable UUID goal IDs has reached the supported fleet, and production observability shows no legacy warning traffic for an agreed safety period. Removal requires a separate reviewed change that restores mandatory `opId`; no operation-ID tombstone system is part of this gate.

Cheap P2 remediations applied:

- Restored the pre-transaction `WRITE_ROLES` fail-fast gate while retaining authoritative live actor/venue/referee authorization after the match lock.
- Applied Zod UUID validation to PostgreSQL UUID request identifiers: `matchId`, nullable `playerId`, `eventId`, nullable `refereeId`, and optional `opId`. Malformed values now return HTTP 400 rather than reaching a PostgreSQL cast.
- Strengthened migration 0007 so `NULL type + non-NULL operation_id` fails even where production keeps event type nullable.
- Added a deterministic, separate-connection lock-queue test. It observes the request waiting in PostgreSQL, commits a referee reassignment, and proves the command authorizes against the post-lock committed row.

P2 and later concerns deliberately deferred from this narrow pass are operation-ID retention/tombstones after goal deletion, signalling score/event drift currently bounded by `GREATEST(0, score - 1)`, withdrawal/replacement history, inactive standings-row presentation, duplicate active teams per slot and locked slot allocation, mandatory ADMIN_OVERRIDE reasons, forfeit workflows, broad mobile redesign, nullable production scores pending a read-only data gate, and middleware-to-proxy cleanup.

Migration 0007 remains unapplied to production or any persistent production-like environment; it was exercised only in disposable local fresh and production-shaped rehearsals. Production Neon, Vercel and its configuration, the GitHub default branch, and all non-Nova projects remained untouched. The remediation was not pushed, merged, or deployed.

## Deterministic standings

`recomputeLeagueStandings(txSql, leagueId)` locks the league, zeroes existing rows for it, derives both home and away contributions exclusively from final matches, aggregates played/won/drawn/lost/goals-for/goals-against/goal-difference/points, and upserts every current active team. Points use the league's `win_points` and `draw_points`; no 3/1 constants or incremental subtraction/addition remain.

Re-running with unchanged final matches writes identical totals. Final score corrections rebuild the table, final-to-non-final removes that match, and non-final-to-final includes it. END_MATCH and ADMIN_OVERRIDE call this helper inside their match transaction.

## Referee clients

All five web and mobile match mutations now parse the server response, reject non-2xx responses with a meaningful message, execute success behavior only after true success, disable repeat controls while pending, and invalidate/refetch server match state after success. Scores remain server-authoritative and are never optimistically incremented.

The web application now mounts the existing Sonner toast renderer, which makes its command success and failure messages visible. Mobile uses focused alerts and `expo-crypto` for secure UUID generation. Both clients derive match phase/timing from server timestamps; local intervals only advance the display between refetches and no client timestamp is submitted.

## Verification results

- `npm ci`: PASS (clean dependency installation).
- `npm test`: PASS — 17 files, 254 tests.
- `npm run test:integration`: PASS — 1 file, 46 PostgreSQL-backed tests, including the deterministic lock-queue regression.
- `npm run lint`: PASS — zero errors.
- `npm run build`: PASS — Next.js 16.3.8 production build, 69 routes. The existing middleware-deprecation warning remains informational.
- `npm run test:e2e`: PASS — 8 Chromium smoke tests, including failed-command visibility and stable-opId retry coverage.
- `npm audit --omit=dev --audit-level=high`: PASS — 0 production vulnerabilities.
- `git diff --check`: PASS.
- Changed-file secrets scan: PASS; matches were limited to explicit localhost CI credentials and test-only auth secrets.

## Migration rehearsal results

All rehearsals used disposable local PostgreSQL 18 databases only.

- Fresh chain `0001` -> `0007`: PASS.
- Production-shaped path `0001` -> `0006`, seed a historical match event, then apply `0007`: PASS.
- Historical event survival and nullable operation ID: PASS.
- Historical `NULL type` with `NULL operation_id`: PASS in the production-shaped rehearsal.
- `NULL type` or non-goal type with non-null operation ID rejection: PASS.
- Goal type with operation ID acceptance: PASS.
- Match-scoped uniqueness and same-ID rejection: PASS.
- Existing migration role/ownership hold path: PASS.
- Expected anomaly/failure paths: PASS.
- CI and the PowerShell rehearsal script now include `0007` and the historical-event assertions.

## Gate 4 deferrals

- Historical withdrawal, replacement, and slot-occupant semantics are not invented here. Standings intentionally resolve the current active team for each slot, matching today's product model.
- Fixture, forfeit, withdrawal, and replacement workflows remain deferred.
- ADMIN_OVERRIDE keeps its current authorization and correction UX; mandatory reasons and redesigned correction flows remain deferred.
- Operation-ID tombstones after goal deletion and explicit `GREATEST(0, score - 1)` drift signalling remain deferred.
- Inactive standings-row presentation, duplicate active teams per slot, and locked slot allocation remain deferred.
- Production nullable scores remain unchanged pending the planned read-only pre-deploy data gate.
- Middleware-to-proxy cleanup remains deferred.
- No generalized event-sourcing, rules engine, command framework, or workflow infrastructure was introduced.

## Gate 3A verdict

The implementation satisfies the Gate 3A transaction, goal integrity, deterministic standings, correction audit, client error-handling, migration, and validation requirements and is ready for diff review from the recorded baseline.

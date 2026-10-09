# NovaChrono Gate 3A Match Integrity Report

- Date: 2026-10-09
- Branch: `gate3/match-integrity`
- Starting SHA: `a0ca6b0d639f045ed53c87efea4f687fb9a74c34`
- Final implementation SHA: `3cd64cf62266fc2cd008d479d45b1de2f2a6a2e5`

The final implementation SHA contains all application, migration, test, CI, and rehearsal changes. This report is added by a documentation-only follow-up commit; the branch-head SHA is recorded in the review handoff because a commit cannot embed its own SHA.

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

Historical events remain valid because the column is nullable. A validated CHECK permits a non-null operation ID only for `goal_home` or `goal_away`. A partial unique index on `(match_id, operation_id) WHERE operation_id IS NOT NULL` scopes idempotency to one match while leaving historical and non-goal events unaffected. The migration applies a five-second local lock timeout and is transactional under the existing migration runner.

## Transaction boundaries

The request may resolve the session identity and validate the JSON shape before a transaction, but no pre-lock role, venue, referee assignment, match state, team, or player result is trusted for a write. Each state-changing command uses `withTransaction`, locks the target row through `SELECT ... FOR UPDATE OF m`, reloads the live actor inside the transaction, and authorizes against the locked match's venue and referee assignment.

- `START_MATCH`: match lock -> live actor/venue/referee authorization -> scheduled-state validation -> server-side status/start timestamp update -> first-half event insert -> commit.
- `START_SECOND_HALF`: match lock -> authorization -> live/first-half consistency checks -> duplicate phase check -> server-side second-half timestamp update -> second-half event insert -> commit. A fully consistent repeat is an idempotent success; a partially inconsistent state is rejected.
- `RECORD_GOAL`: match lock -> authorization -> live-state check -> current active scoring-team lookup -> optional player existence/membership validation -> idempotent event insert -> score increment only when the insert is new -> commit.
- `DELETE_EVENT`: match lock -> authorization -> live-state check -> event lock constrained by `match_id` -> goal-only check -> guarded score decrement -> event deletion -> audit insert -> commit. Any audit failure rolls the correction back.
- `END_MATCH`: match lock -> authorization -> live-to-final transition -> end event -> deterministic standings rebuild -> commit. A repeat against an already-final match safely rebuilds standings and returns idempotent success without another event.
- `ADMIN_OVERRIDE`: match lock -> existing admin authorization -> score/status update -> standings rebuild when either old or new state is final -> audit insert -> commit.
- `ASSIGN_REFEREE`: match lock -> admin authorization -> optional live referee/venue lookup -> assignment update -> commit.

Thrown database failures leave `withTransaction` through rollback and are converted to HTTP 500 only outside the transaction. Forced-failure integration tests verify rollback after the first mutation for start, second-half, goal, deletion/audit, and finalisation paths.

## Goal idempotency

Each deliberate client goal action creates one UUID operation ID. TanStack Query's one transient retry receives the same mutation variables, so it resends the same ID. Web player selection remains open after failure and reuses the same pending ID; cancelling clears it, and a new deliberate goal click creates a new one. Mobile preserves a failed same-side operation ID for resubmission, clears it after success/cancel, and creates a new ID for a different or completed action.

The server inserts with `ON CONFLICT ... DO NOTHING`. A new row alone authorizes the score increment. On a duplicate, the stored type, player and resolved team must match the repeated command; an exact repeat returns `{ success: true, idempotent: true }`, while reuse for a different goal command returns 409. Player attribution is allowed only when the player exists and belongs to the resolved scoring team. Null/unknown player attribution remains supported.

## Deterministic standings

`recomputeLeagueStandings(txSql, leagueId)` locks the league, zeroes existing rows for it, derives both home and away contributions exclusively from final matches, aggregates played/won/drawn/lost/goals-for/goals-against/goal-difference/points, and upserts every current active team. Points use the league's `win_points` and `draw_points`; no 3/1 constants or incremental subtraction/addition remain.

Re-running with unchanged final matches writes identical totals. Final score corrections rebuild the table, final-to-non-final removes that match, and non-final-to-final includes it. END_MATCH and ADMIN_OVERRIDE call this helper inside their match transaction.

## Referee clients

All five web and mobile match mutations now parse the server response, reject non-2xx responses with a meaningful message, execute success behavior only after true success, disable repeat controls while pending, and invalidate/refetch server match state after success. Scores remain server-authoritative and are never optimistically incremented.

The web application now mounts the existing Sonner toast renderer, which makes its command success and failure messages visible. Mobile uses focused alerts and `expo-crypto` for secure UUID generation. Both clients derive match phase/timing from server timestamps; local intervals only advance the display between refetches and no client timestamp is submitted.

## Verification results

- `npm ci`: PASS (clean dependency installation).
- `npm test`: PASS — 17 files, 253 tests.
- `npm run test:integration`: PASS — 1 file, 38 PostgreSQL-backed tests.
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
- Goal-only operation-ID CHECK: PASS.
- Match-scoped uniqueness and same-ID rejection: PASS.
- Existing migration role/ownership hold path: PASS.
- Expected anomaly/failure paths: PASS.
- CI and the PowerShell rehearsal script now include `0007` and the historical-event assertions.

## Gate 4 deferrals

- Historical withdrawal, replacement, and slot-occupant semantics are not invented here. Standings intentionally resolve the current active team for each slot, matching today's product model.
- Fixture, forfeit, withdrawal, and replacement workflows remain deferred.
- ADMIN_OVERRIDE keeps its current authorization and correction UX; mandatory reasons and redesigned correction flows remain deferred.
- No generalized event-sourcing, rules engine, command framework, or workflow infrastructure was introduced.

## Gate 3A verdict

The implementation satisfies the Gate 3A transaction, goal integrity, deterministic standings, correction audit, client error-handling, migration, and validation requirements and is ready for diff review from the recorded baseline.

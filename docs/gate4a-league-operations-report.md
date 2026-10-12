# NovaChrono Gate 4A — Fixture & Result Operations

## Source-control record

- Starting branch: `gate3/match-integrity`
- Starting SHA: `a828a7480364a0eb51b3d912c08acc4390ef604b`
- Implementation branch: `gate4/league-operations`
- Implementation SHA: `388f8554894660e0abdc3d54d8f846d1c4dc82cf`
- Adversarial-review starting HEAD: `dc018281f37b937e1a20e0223cfa22be73baff96`
- Remediation implementation SHA: `764cd3eebf23c7cc7fe6d1df3583d486ec31373a`
- Production, Neon, Vercel, GitHub default branch, and draft PR #7 were not changed.
- Migration `0008` was exercised only in disposable local PostgreSQL databases. It was not run against Neon.

## Forensic preflight

### Fixture model

`matches` stores the league and round, a planned `match_date`, a text kickoff (`time_slot`), an integer field/resource (`field_number`), home and away league-slot identifiers, scores, status, referee, and live-match timestamps. Fresh migration-built environments use PostgreSQL `DATE` for `match_date`; the accepted production schema uses `TIMESTAMPTZ`. Gate 4A supports both without changing production's column type. The resource is the league venue plus `field_number`; there is no separate court/pitch table. Status vocabulary is `scheduled`, `live`, `final`, `postponed`, and `cancelled`.

Fixture generation existed in `POST /api/leagues` and allocated configured league time slots across numbered fields. It previously reused capacity with modulo arithmetic when a round exceeded configured capacity, performed scheduling reads outside its write transaction, and had no cross-league venue/resource collision guard. There was no ordinary single-fixture create/edit command. The existing league admin page displayed fixtures and allowed referee selection, plus a separate broad round-postpone workflow.

### Referee model

Referees are `auth_users` rows with role `referee`, a venue scope, and an optional field number. Gate 3's `ASSIGN_REFEREE` path locked the match and re-authorized the actor inside the transaction, validated the referee role and venue, and updated the assignment. It did not prevent the same referee from being assigned to simultaneous fixtures. No separate referee-availability calendar exists, and none was introduced.

### Result administration

Gate 3's `ADMIN_OVERRIDE` already locked the match, required a venue/platform administrator, updated score/status, rebuilt standings whenever old or new state was final, and inserted into `audit_logs` in the same transaction. The reason was optional. The existing `audit_logs` table supports actor, target, action type, JSONB old/new values, reason, and timestamp. No operational correction UI or explicit forfeit command existed. League configuration already contained `win_points`, `draw_points`, `forfeit_score_home`, and `forfeit_score_away`.

### Scheduling and timezone semantics

The checked-in fresh schema uses `DATE` plus text `HH:MM`, while production retains its existing `TIMESTAMPTZ` planned-date shape. `leagues.day_of_week` is an integer `0..6`. Existing fixture generation and UI formatting used JavaScript `Date` construction and browser/server defaults, which could shift a date-only value. No league timezone column exists. Gate 4A retains both supported column shapes and makes the established v1 calendar assumption explicit as IANA `Africa/Johannesburg`.

## Adversarial findings and remediation

The adversarial review correctly found five P1 defects in the original Gate 4A implementation. They remain recorded here rather than being replaced by the corrected claims:

1. `ADMIN_OVERRIDE` validated only the target state, allowing live/postponed/cancelled current states. The server now accepts only current `scheduled` or `final`, and the UI offers correction only for those states.
2. Final-to-scheduled reactivation did not reclaim field or retained-referee capacity. It now takes the same resource/referee advisory locks and conflict checks used by ordinary scheduling before any mutation.
3. Round postpone used `match_date + 7`, which fails for production `TIMESTAMPTZ`. It now uses `INTERVAL '7 days'`, and both DATE-shaped and real production-shaped databases execute the endpoint successfully.
4. Round postpone ignored retained-referee claims. It now derives every resource and referee claim, acquires the combined key set in deterministic order, validates all conflicts, and only then mutates the batch.
5. Duplicate configured time slots inflated capacity and could self-double-book generated fixtures. API validation rejects normalized duplicates with 400, the UI blocks submission visibly, and the legacy generator fails closed on invalid stored configuration.

The inexpensive P2 corrections folded into this remediation are: match-row-first deterministic round lock order; canonical planned-date strings and production normalization; live forfeit winner/loser-score validation; explicit result-type transition coverage; explicit forfeit-winner selection; mutation-sensitive advisory-lock/role-recheck tests; a true production-shaped fixture; and CI execution of migration `0008` plus the Gate 4A route suite.

### Permission map

| Operation | Authorised roles | Scope |
| --- | --- | --- |
| Create fixture | `venue_admin`, `super_admin` | League venue |
| Edit/reschedule fixture | `venue_admin`, `super_admin` | Match league venue |
| Assign/change referee | `venue_admin`, `super_admin` | Match league venue; referee must belong to that venue |
| Postpone one fixture | `venue_admin`, `super_admin` | Match league venue |
| Cancel one fixture | `venue_admin`, `super_admin` | Match league venue |
| Correct result | `venue_admin`, `super_admin` | Match league venue |
| Record forfeit | `venue_admin`, `super_admin` | Match league venue |
| Existing round reschedule | `venue_admin`, `org_admin`, `super_admin` | Existing `canAdministerVenue` policy |

Referees retain only their Gate 3 live-match command authority. Captains have no fixture/result administration authority. Cheap coarse checks remain outside transactions; every authoritative actor, role, venue, match, league, referee, and mutable-state decision is repeated under the transaction.

## Implementation

### Collision and capacity semantics

The exact fixture claim is:

`league venue_id + field_number + match_date + time_slot`

Only `scheduled` and `live` fixtures consume capacity. `postponed` and `cancelled` fixtures retain their records and historical schedule values but do not consume capacity. Final historical fixtures also do not block a new active schedule claim.

Every fixture create, edit/reschedule, generated schedule, and legacy round reschedule acquires a PostgreSQL transaction-scoped advisory lock derived from the exact claim before querying for a conflict. Concurrent claimants serialize on the same key; one may commit and the other receives HTTP 409. Fixture generation now rejects a round that exceeds configured field/time capacity instead of reusing a slot.

### Referee conflict semantics

The exact referee claim is:

`referee_id + match_date + time_slot`

For active fixtures, assignment and rescheduling acquire the corresponding advisory lock before the conflict query. A referee may not hold two `scheduled`/`live` fixtures at the same kickoff, regardless of field. Postponed/cancelled fixtures do not reserve a referee slot. Rescheduling a postponed fixture rechecks its retained referee against the new kickoff.

### State transition matrix

| Current state | Edit schedule/resource | Change referee | Postpone | Cancel | Forfeit | Result override |
| --- | --- | --- | --- | --- | --- | --- |
| `scheduled` | Allowed | Allowed | → `postponed` | → `cancelled` | → `final` | → `scheduled` or `final` |
| `postponed` | Reschedule → `scheduled` | Allowed; no active claim until rescheduled | Idempotent | → `cancelled` | Rejected | Rejected |
| `live` | Rejected | Rejected | Rejected | Rejected | Rejected | Rejected by server |
| `final` | Rejected | Rejected | Rejected | Rejected | Same-forfeit retry only | → `scheduled` or corrected `final` |
| `cancelled` | Rejected | Rejected | Rejected | Idempotent | Rejected | Rejected |

The override command intentionally cannot masquerade as postpone/cancel; those remain distinct audited operations.

### Result corrections

`ADMIN_OVERRIDE` now requires a trimmed reason of 1–500 characters. Missing and whitespace-only reasons return 400. A real change stores bounded structured before/after result state and the reason in `audit_logs`. An exact repeat is an idempotent success without another audit row. Match lock, update, deterministic standings recomputation, and audit insert share one transaction; an audit or standings failure rolls back the correction.

Final-to-final corrections rebuild standings, final-to-scheduled removes the result, scheduled-to-final includes it, and scheduled-to-scheduled changes do not invent standings effects.

The existing correction convention retains score values when a final result is reopened to `scheduled`; this remediation does not invent a score reset. `ADMIN_OVERRIDE` always normalizes `result_type` to `played`, including corrections of prior forfeits and reopenings.

### Forfeit/walkover

`FORFEIT_MATCH` accepts an explicit winning side. It locks and validates the match and both participant slots, rejects live/postponed/cancelled and unrelated final states, reads the live league configuration, verifies non-negative integer winner/loser scores with winner greater than loser, and swaps those configured values when the away side wins. It sets `status = 'final'`, records `result_type` as `forfeit_home_win` or `forfeit_away_win`, rebuilds standings, and writes a structured audit record atomically.

An exact retry against the same final forfeit is idempotent and creates no duplicate audit or standings effect. A different forfeit outcome after finalisation is rejected and must use the reasoned correction path.

### Migration 0008

`0008_gate4a_league_operations.sql`:

- uses `SET LOCAL lock_timeout = '5s'`;
- adds non-null `matches.result_type` with default `played`;
- adds and validates `matches_result_type_check`;
- adds overloaded immutable `nova_planned_date(DATE|TIMESTAMPTZ)` helpers for the v1 Johannesburg calendar boundary;
- adds partial active-schedule and active-referee expression indexes over the normalized planned date;
- performs no destructive rewrite and preserves all historical matches as `played`.

Migrations `0001`–`0007` remain unchanged.

### Timezone decision

Gate 4A does not change either supported `match_date` column type or PostgreSQL's server timezone. Database projections normalize both `DATE` and production `TIMESTAMPTZ` to canonical `YYYY-MM-DD` Nova dates before JavaScript receives them. Scheduling utilities validate real calendar dates and 24-hour kickoffs, perform calendar arithmetic at safe UTC noon, derive weekdays from the canonical date, and render with explicit `Africa/Johannesburg`. Fixture generation, query serialization, season dates, round shifting, fixture cards, and edit form round trips no longer depend on browser/server/process timezone.

### Transaction and audit design

Commands lock the target match before trusting status, assignment, schedule, or tenant state. Creation/generation locks the league and re-reads the actor. Round postpone discovers IDs, locks every affected match in stable ID order, then takes the league share lock; this is compatible with correction/forfeit's match-then-league standings path and removes the prior inversion. Participant and referee rows are read under share locks. Resource/referee claim locks use deterministic textual keys; batch generation and round shifting sort the combined key set before acquisition. Mutations occur only after all rejectable preconditions pass. Database failures leave through the shared rollback path.

Audited actions are `CREATE_FIXTURE`, `EDIT_FIXTURE`, `POSTPONE_FIXTURE`, `CANCEL_FIXTURE`, `POSTPONE_ROUND`, `ADMIN_OVERRIDE`, and `FORFEIT_MATCH`. Postpone/cancel preserve match events and identifiers. Cancellation never creates a result or directly modifies standings.

### Standings implications

Gate 3's full deterministic rebuild remains authoritative. Only `status = 'final'` match truth contributes. Corrections and forfeits call the rebuild in their match transaction. Postpone/cancel reject final matches, so they cannot silently subtract a completed result. No incremental standings arithmetic was introduced.

### Admin UI

The existing league fixture cards now expose edit, referee change, postpone, cancel, correction, and forfeit controls. State-inappropriate controls are disabled. A shared modal provides explicit confirmation, mandatory correction reason, explicit forfeit-winner choice, configured-field bounds, and server-authoritative forms. League creation detects duplicate normalized time slots, shows a visible error, and disables submission. Requests disable duplicate submission, parse and display 4xx messages, avoid optimistic state, and invalidate/refetch fixtures and standings after success.

## Files changed in the implementation commit

- `migrations/0008_gate4a_league_operations.sql`
- `schema.sql`
- `scripts/verify-gate2-migrations.ps1`
- `src/app/api/matches/route.js`
- `src/app/api/matches/scheduling.js`
- `src/app/api/leagues/route.js`
- `src/app/api/leagues/postpone-round/route.js`
- `src/utils/scheduling.js`
- `src/app/admin/league/[id]/page.jsx`
- `src/components/LeagueDetail/FixturesTab.jsx`
- `src/components/LeagueDetail/FixtureOperationModal.jsx`
- `src/__tests__/gate4a-operations.test.js`
- `tests/integration/gate2-remediation-routes.test.js`
- `tests/e2e/smoke.spec.js`

## Validation record

All database validation used an isolated PostgreSQL 18 cluster under the Windows temporary directory on port 55432.

| Validation | Result |
| --- | --- |
| `npm ci` | Passed; locked dependencies installed |
| `npm test` | 18 files, **262 passed** |
| `npm run test:integration` — fresh DATE schema | 1 file, **95 passed** using real PostgreSQL connections |
| `npm run test:integration` — production-shaped TIMESTAMPTZ schema | 1 file, **95 passed** using real PostgreSQL connections |
| Focused concurrency coverage | Fixture advisory wait, retained-referee advisory wait, final-to-scheduled claims, round/referee assignment, actor demotion after match-lock queueing, and round vs correction/forfeit lock ordering all passed |
| Timezone matrix | Gate 4A date suite passed under `UTC`, `Africa/Johannesburg`, `America/New_York`, and `Pacific/Auckland`, including leap/month/year boundaries |
| `npm run lint` | Passed, no findings |
| `npm run build` | Passed, 69 pages generated; pre-existing middleware deprecation warning only |
| `npm run test:e2e` | Chromium, **9 passed** |
| `npm audit --omit=dev --audit-level=high` | **0 vulnerabilities** |
| `git diff --check` | Passed |
| Private-key marker scan | 0 markers |
| Credentialed URL scan | Only documented placeholders and local CI/test credentials; no production credential |
| Fresh migration rehearsal | `0001` → `0008` passed |
| Production-shaped rehearsal | `0001` → `0007` → `0008` passed with `match_date TIMESTAMPTZ`, historical rows preserved, and canonical Nova date verified |
| Existing migration anomaly checks | Duplicate/auth/role hold-point and Gate 3 event checks passed |

## Gate 4B and later deferrals

- Team withdrawal and replacement lifecycles.
- Immutable historical slot-occupant and replacement inheritance semantics.
- Inactive standings-row visibility and historical-team standings semantics.
- Lock-safe free-slot allocation and the partial active-team-per-slot constraint.
- Season completion/archive workflows.
- Broad timezone/schema redesign or a league-timezone column.
- Tournament formats, drag/drop scheduling, discipline/cards, rich notifications, workflow engines, AI, and generic event sourcing.

## Remaining concerns

- **P1:** None identified within Gate 4A scope.
- **P2:** Advisory locks protect every repository scheduling writer found by the final write-path audit, but direct out-of-band SQL would not participate in those application locks.
- **P2:** The legacy forfeit columns are named home/away even though product rules describe winner/loser scoring. Gate 4A preserves their canonical configured values and deterministically swaps them for an away win; a later schema clarification may rename semantics only through a forward migration.
- **P2:** Round-postpone notifications are external side effects after the atomic schedule/audit commit. Delivery failures are reported per captain and do not reverse a valid schedule change.
- **P2:** The existing Next.js middleware convention emits a deprecation warning; migration to `proxy` remains outside this Gate.

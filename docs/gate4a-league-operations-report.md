# NovaChrono Gate 4A — Fixture & Result Operations

## Source-control record

- Starting branch: `gate3/match-integrity`
- Starting SHA: `a828a7480364a0eb51b3d912c08acc4390ef604b`
- Implementation branch: `gate4/league-operations`
- Implementation SHA: `388f8554894660e0abdc3d54d8f846d1c4dc82cf`
- Production, Neon, Vercel, GitHub default branch, and draft PR #7 were not changed.
- Migration `0008` was exercised only in disposable local PostgreSQL databases. It was not run against Neon.

## Forensic preflight

### Fixture model

`matches` stores the league and round, a PostgreSQL `DATE` (`match_date`), a text kickoff (`time_slot`), an integer field/resource (`field_number`), home and away league-slot identifiers, scores, status, referee, and live-match timestamps. The resource is therefore the league venue plus `field_number`; there is no separate court/pitch table. Status vocabulary is `scheduled`, `live`, `final`, `postponed`, and `cancelled`.

Fixture generation existed in `POST /api/leagues` and allocated configured league time slots across numbered fields. It previously reused capacity with modulo arithmetic when a round exceeded configured capacity, performed scheduling reads outside its write transaction, and had no cross-league venue/resource collision guard. There was no ordinary single-fixture create/edit command. The existing league admin page displayed fixtures and allowed referee selection, plus a separate broad round-postpone workflow.

### Referee model

Referees are `auth_users` rows with role `referee`, a venue scope, and an optional field number. Gate 3's `ASSIGN_REFEREE` path locked the match and re-authorized the actor inside the transaction, validated the referee role and venue, and updated the assignment. It did not prevent the same referee from being assigned to simultaneous fixtures. No separate referee-availability calendar exists, and none was introduced.

### Result administration

Gate 3's `ADMIN_OVERRIDE` already locked the match, required a venue/platform administrator, updated score/status, rebuilt standings whenever old or new state was final, and inserted into `audit_logs` in the same transaction. The reason was optional. The existing `audit_logs` table supports actor, target, action type, JSONB old/new values, reason, and timestamp. No operational correction UI or explicit forfeit command existed. League configuration already contained `win_points`, `draw_points`, `forfeit_score_home`, and `forfeit_score_away`.

### Scheduling and timezone semantics

The database uses `DATE` plus text `HH:MM` for planned fixtures and `TIMESTAMPTZ` only for actual match phase timestamps. `leagues.day_of_week` is an integer `0..6`. Existing fixture generation and UI formatting used JavaScript `Date` construction and browser/server defaults, which could shift a date-only value. No league timezone column exists. Gate 4A therefore retains the existing schema and makes the established v1 assumption explicit as IANA `Africa/Johannesburg`.

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
| `live` | Rejected | Rejected | Rejected | Rejected | Rejected | Rejected by schema |
| `final` | Rejected | Rejected | Rejected | Rejected | Same-forfeit retry only | → `scheduled` or corrected `final` |
| `cancelled` | Rejected | Rejected | Rejected | Idempotent | Rejected | Rejected |

The override command intentionally cannot masquerade as postpone/cancel; those remain distinct audited operations.

### Result corrections

`ADMIN_OVERRIDE` now requires a trimmed reason of 1–500 characters. Missing and whitespace-only reasons return 400. A real change stores bounded structured before/after result state and the reason in `audit_logs`. An exact repeat is an idempotent success without another audit row. Match lock, update, deterministic standings recomputation, and audit insert share one transaction; an audit or standings failure rolls back the correction.

Final-to-final corrections rebuild standings, final-to-scheduled removes the result, scheduled-to-final includes it, and scheduled-to-scheduled changes do not invent standings effects.

### Forfeit/walkover

`FORFEIT_MATCH` accepts an unambiguous winning side. It locks and validates the match and both participant slots, rejects live/postponed/cancelled and unrelated final states, reads the live league configuration, and maps the configured canonical winner/loser score by swapping the configured values when the away side wins. It sets `status = 'final'`, records `result_type` as `forfeit_home_win` or `forfeit_away_win`, rebuilds standings, and writes a structured audit record atomically.

An exact retry against the same final forfeit is idempotent and creates no duplicate audit or standings effect. A different forfeit outcome after finalisation is rejected and must use the reasoned correction path.

### Migration 0008

`0008_gate4a_league_operations.sql`:

- uses `SET LOCAL lock_timeout = '5s'`;
- adds non-null `matches.result_type` with default `played`;
- adds and validates `matches_result_type_check`;
- adds partial active-schedule and active-referee lookup indexes;
- performs no destructive rewrite and preserves all historical matches as `played`.

Migrations `0001`–`0007` remain unchanged.

### Timezone decision

Gate 4A keeps `DATE + time_slot` and does not change PostgreSQL's server timezone. New scheduling utilities validate real calendar dates and 24-hour kickoffs, perform calendar arithmetic in a date-only safe representation, derive weekdays from the local date, and render with explicit `Africa/Johannesburg`. Fixture generation, season end-date calculation, round shifting, fixture cards, and edit form round trips no longer rely on ambient browser/server timezone behavior.

### Transaction and audit design

Commands lock the target match before trusting status, assignment, schedule, or tenant state. Creation/generation locks the league and re-reads the actor. Participant and referee rows are read under share locks. Resource/referee claim locks use deterministic textual keys; batch generation and round shifting sort keys before acquiring them. Mutations occur only after all rejectable preconditions pass. Database failures leave through the shared rollback path.

Audited actions are `CREATE_FIXTURE`, `EDIT_FIXTURE`, `POSTPONE_FIXTURE`, `CANCEL_FIXTURE`, `POSTPONE_ROUND`, `ADMIN_OVERRIDE`, and `FORFEIT_MATCH`. Postpone/cancel preserve match events and identifiers. Cancellation never creates a result or directly modifies standings.

### Standings implications

Gate 3's full deterministic rebuild remains authoritative. Only `status = 'final'` match truth contributes. Corrections and forfeits call the rebuild in their match transaction. Postpone/cancel reject final matches, so they cannot silently subtract a completed result. No incremental standings arithmetic was introduced.

### Admin UI

The existing league fixture cards now expose edit, referee change, postpone, cancel, correction, and forfeit controls. State-inappropriate controls are disabled. A shared modal provides explicit confirmation, mandatory correction reason, configured-field bounds, and server-authoritative forms. Requests disable duplicate submission, parse and display 4xx messages, avoid optimistic state, and invalidate/refetch fixtures and standings after success.

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
| `npm test` | 18 files, **261 passed** |
| `npm run test:integration` | 1 file, **67 passed** using real PostgreSQL connections |
| Focused concurrency coverage | Fixture claim, referee claim, create/reschedule race, correction/finalisation race, repeated forfeit, cancel/forfeit race all passed |
| `npm run lint` | Passed, no findings |
| `npm run build` | Passed, 69 pages generated; pre-existing middleware deprecation warning only |
| `npm run test:e2e` | Chromium, **9 passed** |
| `npm audit --omit=dev --audit-level=high` | **0 vulnerabilities** |
| `git diff --check` | Passed |
| Private-key marker scan | 0 markers |
| Credentialed URL scan | Only documented placeholders and local CI/test credentials; no production credential |
| Fresh migration rehearsal | `0001` → `0008` passed |
| Production-shaped rehearsal | Historical baseline/fixture → `0003`–`0008` passed with historical rows preserved |
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


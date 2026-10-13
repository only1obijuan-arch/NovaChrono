# Gate 4B — League Lifecycle and Historical Team Integrity

## Release identity and safety

- Starting SHA: `2432fbc84cd008e2058c28285bd8e3c5065cbbf1`
- Working branch: `gate4b/league-lifecycle`
- Implementation SHA: `884c53d3f09aa285a370f3bd7147e136b23568ff`
- New migration: `0009_gate4b_league_lifecycle.sql`
- Migrations `0001` through `0008` were verified byte-identical to the starting SHA.
- Work was performed against isolated local PostgreSQL databases only. Production Neon, Vercel, the GitHub default branch, and PR #8 were not accessed or changed. Nothing was pushed, merged, or deployed.

## Forensic findings

### Existing model

- `league_slots` are globally identified schedule positions within a league.
- `teams` are competitor identities. Their observed lifecycle vocabulary is `active` and `inactive`; their `slot_id` assigns occupancy without defining historical match identity.
- `matches` already had `home_team_id` and `away_team_id` in the accepted production shape, but the historical migrations and checked-in schema had not established their constraints or populated them. Several projections synthesized those fields by joining each slot to its current active occupant.
- `standings` was already keyed by `(league_id, team_id)`, but recomputation derived contributions through current slot occupants. A replacement could therefore inherit an old team's results.
- `players` belong to `team_id`; `match_events` identify players and match events; `audit_logs` can carry actor, target, action, prior/new JSON state, and reason. No second history model was needed.

### Writers and lifecycle callers

- Team creation existed in `/api/teams` (`JOIN_LEAGUE`, `ADD_TEAM`), `/api/captain/join-league`, `/api/register-team`, and `/api/account/signup`.
- Those flows independently selected a free slot before insert and had no lock-safe claim. They now share the same transaction pattern: lock the league, re-read the authoritative actor, lock one vacant slot in deterministic order with `FOR UPDATE OF ls SKIP LOCKED`, then insert. The database partial unique index is the final backstop.
- `UPDATE_TEAM` was a same-identity rename and remains so. No route moves a team between slots or reactivates an inactive identity.
- The only UI caller of legacy `DELETE_TEAM` was the league administration page. It now calls `WITHDRAW_TEAM`. The API retains a compatibility mapping for `DELETE_TEAM`, but it requires the same reason and explicit policy and produces the same withdrawal audit rather than deleting data.
- Fixture creation occurs through `GENERATE_FIXTURES` and `CREATE_FIXTURE`. Both now resolve and snapshot the two active team identities in the same transaction as the slot assignment.
- Lifecycle callers for `COMPLETE_SEASON`, `CREATE_NEW_SEASON`, and `CANCEL_LEAGUE` are on the league administration page. Gate 4B hardens completion and successor-season creation; cancellation behavior was audited but intentionally left outside this gate.

### Readers and derived data

The unsafe current-slot-occupant pattern was removed from match/history projections in:

- match API reads and match audit snapshots;
- league administration, print, captain, referee, public fixture, availability, reminder, cron, and weekly-report paths;
- deterministic standings and `form_last5` calculations.

Historical match names now join `matches.home_team_id` and `matches.away_team_id` directly to `teams.id`. Slot IDs remain available for scheduling. Top-scorer/player identity continues through the player's team identity and does not use current slot occupancy.

## Historical identity model

The enforced model is:

> A league slot is a scheduling position. A team is a historical competitor identity.

Every match stores both scheduling positions and immutable participant identities. A replacement receives a new `teams.id` while occupying the same slot. Final, live, and cancelled match participants are never rewritten by replacement. Only an explicit replacement may transfer `scheduled` or `postponed` fixtures.

`RECORD_GOAL` now uses the locked match's team ID for the selected side, and player validation requires `player.team_id` to equal that match team ID. `START_MATCH` and `FORFEIT_MATCH` reject inactive participants.

## Migration 0009

The migration is transaction-safe under the repository migration runner and was rehearsed with a single-transaction `psql -1` invocation. It begins with `SET LOCAL lock_timeout = '5s'`.

### Exact historical backfill rule

For each NULL match side, the migration assigns a team only when exactly one lifetime `teams` row has the same `league_id` and `slot_id`. It does not prefer active, newest, or oldest teams. It fails closed if:

- a used match side has zero matching team occupants;
- a used match side has more than one lifetime team occupant;
- a match has a missing participant slot;
- duplicate active occupants exist for any non-null slot;
- an existing non-null match team ID is missing or does not match the match's league and side slot.

After deterministic backfill it adds and validates:

- `matches.home_team_id` and `matches.away_team_id` as `NOT NULL` foreign keys to `teams(id)`;
- a distinct home/away team check;
- home/away team lookup indexes;
- a match trigger enforcing team/league/slot consistency;
- a team trigger preventing a referenced team from moving league or slot;
- partial unique index `teams_one_active_per_slot` on `teams(slot_id)` where `status = 'active' AND slot_id IS NOT NULL`.

The accepted production-shaped case—one inactive and one active team sharing an unused slot—passes because no match requires an ambiguous identity for that slot.

## Lifecycle semantics

### Withdrawal

Gate 4B implements the explicit v1 policy `VACATE_FOR_REPLACEMENT`:

- only an in-scope administrator may withdraw;
- the league must be active;
- a reason and explicit policy are mandatory;
- a live participant cannot be withdrawn;
- the team becomes inactive but is not deleted or moved;
- final/cancelled results, players, events, captain data, and team identity remain intact;
- scheduled/postponed fixtures remain assigned to the withdrawn identity until explicit replacement or another explicit admin operation;
- standings are fully recomputed and the mutation plus audit commit atomically;
- an exact repeat for an already inactive team is a no-op success rather than a second mutation or audit.

No `FORFEIT_REMAINING` policy was introduced; therefore no result, score, or standing is invented during withdrawal.

### Replacement

`REPLACE_TEAM` requires an in-scope administrator, an active league, an inactive prior occupant, and a slot with no active occupant. It inserts a new team identity and never renames or reactivates the old team.

Future transfer is an explicit boolean choice. If selected, only `scheduled` and `postponed` matches replace the old side's team ID; slot IDs remain unchanged. `live`, `final`, and `cancelled` identities cannot be transferred. The audit records the prior identity, replacement identity, slot, policy choice, reason, and transferred fixture IDs. The UI displays the exact scheduled/postponed impact count before confirmation.

### Standings and form

Standings are rebuilt only from final matches and their stored team IDs. The relevant set is the union of active teams and teams referenced by final matches. Inactive teams with final history remain visible; unrelated inactive zero rows are removed. A replacement is inserted at zero until one of its own matches becomes final. `form_last5` is calculated by team ID, so slot reuse cannot transfer W/D/L form.

### Season completion and successor season

`COMPLETE_SEASON` locks known matches in stable ID order, locks the league, revalidates the match set and authoritative actor, rejects `scheduled`, `live`, or `postponed` matches with HTTP 409, performs one final deterministic standings rebuild, writes the audit, and marks the league completed atomically. Repetition on an already completed league is idempotent and does not duplicate the audit.

`CREATE_NEW_SEASON` requires an existing completed parent and an authorised venue/platform administrator. It creates a new league and new slots only. Teams, matches, standings, and historical identities are not copied.

## Transaction and lock order

- Existing-match lifecycle operations: cheap scope read → stable match-ID locks → league lock → slot/team locks → authoritative actor/state re-read → mutation → standings rebuild → audit → commit.
- Registration with no existing matches: league lock → authoritative actor re-read → deterministic slot lock → team insert.
- Standings rebuild uses the league lock, matching Gate 3/Gate 4A serialization.
- A post-lock scope comparison rejects a concurrent fixture-set change rather than operating on a stale pre-read.

This preserves the established match → league → other-resource ordering for operations that touch existing matches and avoids adding a league-first inversion to those paths.

## Authorization matrix

| Operation | Authoritative permission |
| --- | --- |
| Join league | Captain only; registration league; no existing active team for that captain in the league |
| Add team | Venue, organization, or platform administrator in scope; registration league |
| Rename team | Owning captain or in-scope administrator; same team ID only |
| Withdraw team | In-scope venue, organization, or platform administrator; active league |
| Replace team | In-scope venue, organization, or platform administrator; active league |
| Complete season | In-scope venue or platform administrator |
| Create successor season | In-scope venue or platform administrator; completed parent |

Every transactional lifecycle path reloads the actor from `auth_users`; stale session role/scope claims are not authoritative.

## Audit design

- `WITHDRAW_TEAM`: actor, target team, old/new status, slot, policy, legacy-action marker, relevant fixture IDs, and reason.
- `REPLACE_TEAM`: actor, new target team, prior/new team IDs, slot, transfer choice, transferred fixture IDs, and reason.
- `COMPLETE_SEASON`: actor, league target, prior/new status.

Audit insertion is inside the same transaction as the mutation and standings rebuild. An audit failure rolls back the operation.

## Concurrency and integrity proof

The real-PostgreSQL integration suite uses independent connections and explicit blocker transactions. All ten requested races passed:

1. A — two `JOIN_LEAGUE` calls for the final slot: exactly one succeeds.
2. B — `JOIN_LEAGUE` versus `ADD_TEAM`: exactly one claims the final slot.
3. C — two replacements for one vacant slot: one active replacement survives.
4. D — withdrawal versus `START_MATCH`: only a valid active/live or inactive/scheduled state is possible.
5. E — withdrawal versus `FORFEIT_MATCH`: no final result is created for an inactive participant.
6. F — replacement versus fixture edit: schedule edit and eligible team transfer serialize without loss.
7. G — replacement versus round postpone: date shift and team identity transfer both survive.
8. H — competing historical-occupant replacements: the partial unique invariant permits one active team.
9. I — completion versus finalisation: a league cannot complete while the locked match remains live.
10. J — standings rebuild versus replacement: old totals remain with the old team and the replacement starts at zero.

The suite asserts actual lock waiting where the lock is the safety mechanism. Its focused regression assertions are mutation-sensitive to removal of the active-slot unique index, slot lock, fixture snapshot write, future-fixture rewrite, lifecycle match locks, authoritative actor recheck, and team-ID standings contribution. No separate mutation-testing framework was added.

## Historical replacement and standings oracle

The explicit oracle creates five final matches for Team A, including W/D/L form, then withdraws A and replaces it with Team B in the same slot. It proved:

- all five final match IDs and public names remain Team A;
- Team A remains `played=5`, `points=7`, with form `L,W,L,D,W`;
- Team B initially has zero played, points, and form;
- scheduled/postponed fixtures explicitly transfer to Team B while retaining the slot;
- finalising a Team B fixture changes only Team B to `played=1`, `points=3`.

Completion tests separately proved 409 responses for scheduled, live, and postponed matches; success for final/cancelled-only seasons; final standings reconciliation; one completion audit; idempotent repetition; rejection of early successor creation; and clean successor slots/history.

## Validation evidence

- `npm ci`: passed (462 packages installed from lockfile).
- `npm test`: passed before the final policy assertion with 18 files / 265 tests; the final full rerun records 266 tests.
- Focused authorization/onboarding contracts after the final policy patch: 2 files / 120 tests passed.
- `npm run test:integration`, DATE schema: 1 file / 136 tests passed.
- Production-shaped TIMESTAMPTZ integration run: 1 file / 136 tests passed.
- Concurrency proof: A–J, 10/10 passed.
- Historical replacement oracle: passed.
- Standings/form oracle: passed.
- Playwright: 9/9 passed.
- ESLint: passed.
- Next.js production build: passed; only the pre-existing middleware-to-proxy deprecation warning remains.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
- `git diff --check`: passed (Windows line-ending notices only).
- Fresh migration rehearsal `0001` → `0009`: passed.
- Production-shaped rehearsal `0001` → `0008` + fixture + `0009`: passed.
- Adversarial migration fixtures for ambiguous identity, duplicate active occupancy, and missing team identity: all failed closed with the expected diagnostic.
- Historical migration immutability: `0001`–`0008` unchanged.
- Secret scan: no private keys or production credentials; only documented placeholders/local test URLs were present.

## Changed implementation files

- `.github/workflows/ci.yml`
- `migrations/0009_gate4b_league_lifecycle.sql`
- `schema.sql`
- `scripts/verify-gate2-migrations.ps1`
- `src/__tests__/access-boundaries.test.js`
- `src/__tests__/onboarding-contracts.test.js`
- `src/app/admin/league/[id]/page.jsx`
- `src/app/admin/league/print/page.jsx`
- `src/app/admin/weekly-report/route.js`
- `src/app/api/account/signup/route.js`
- `src/app/api/auth/confirm-availability/route.js`
- `src/app/api/captain/join-league/route.js`
- `src/app/api/cron/match-reminders/route.js`
- `src/app/api/leagues/route.js`
- `src/app/api/matches/route.js`
- `src/app/api/matches/standings.js`
- `src/app/api/register-team/route.js`
- `src/app/api/send-match-reminder/route.js`
- `src/app/api/stats/route.js`
- `src/app/api/teams/route.js`
- `src/app/captain/team/[id]/page.jsx`
- `src/components/LeagueDetail/ManageTeamModal.jsx`
- `src/components/LeagueDetail/TeamsTab.jsx`
- `tests/fixtures/gate2-production-shape.sql`
- `tests/integration/gate2-remediation-routes.test.js`

This report is the separate documentation-only handoff change.

## Deferred issues and residual concerns

### P1

No known P1 remains in the implemented Gate 4B scope.

### P2 / deliberate boundaries

- Ambiguous legacy match identity intentionally blocks migration and requires operator-led data remediation; chronology is not guessed.
- Only `VACATE_FOR_REPLACEMENT` is supported. Automated remaining-fixture forfeits remain a future, separately specified policy.
- The admin UI is intentionally minimal; the API accepts an optional replacement captain but this gate does not add a broader transfer/history console.
- `CANCEL_LEAGUE` retains its existing behavior and is not converted into a general lifecycle workflow.
- The existing Next.js middleware convention warning remains; middleware-to-proxy migration is an explicit non-goal.
- No production migration has been attempted. A future release gate must run the accepted read-only preflight immediately before applying `0009`.

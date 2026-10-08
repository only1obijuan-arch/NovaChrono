# Gate 2A live-data preflight

## Status

Gate 2A completed on 2026-10-08 against the authorised production PostgreSQL database. The inspection used only aggregate or catalogue reads inside an explicitly read-only transaction. No production data or schema was changed.

## A. Safety and provenance

- Engineering baseline: branch `astra/critical-stabilisation`, commit `beb9c6623e1031f0da8feca3f7d626f44e0ac115`.
- Production schema evidence: `novachrono-production-schema.sql`, PostgreSQL 17.11, exported by `pg_dump` 18.6.
- Schema dump SHA-256 reverified as `44D53109A075386155FF9A51DE8EBBD5CEF07F881C146D9ECF038BC3F5C79379`.
- The schema dump remained outside committed source and was not modified.
- The connection credential remained only in the operator's local PowerShell environment. It was not printed, copied into the repository, written to the report, or made available to the Codex process.
- The operator invoked the reviewed SQL with `psql` 18.6. The SQL enforced:
  - `BEGIN TRANSACTION READ ONLY`;
  - `statement_timeout = '30s'`;
  - `lock_timeout = '3s'`;
  - `idle_in_transaction_session_timeout = '60s'`.
- PostgreSQL reported `transaction_read_only = on`, all configured timeouts, and a successful final `ROLLBACK`.
- The inspection contained `SELECT`, `SHOW`, transaction-local `SET`, and `ROLLBACK` statements only. It contained no DDL, DML, row locks, temporary objects, migration invocation, or deployment action.
- Results contain counts, controlled vocabularies, migration names, index definitions, and relation statistics only. They contain no emails, tokens, password material, connection details, or row identifiers.

## B. Migration ledger

| ID | Applied migration | Applied at (UTC) |
|---:|---|---|
| 1 | `0001_initial.sql` | 2026-05-02 19:54:02.339581+00 |
| 2 | `0002_add_unique_league_slots.sql` | 2026-05-02 19:54:07.864801+00 |

Both historical migrations are represented exactly once. The production constraint/index `league_slots_unique_slot (league_id, slot_number)` is present, so the structural state agrees with the recorded effect of `0002`. There is no migration-ledger discrepancy to repair. Existing migration files remain immutable history and must not be rewritten.

## C. Q1-Q12 results

### Q1 — Auth roles, accounts, sessions, and email identity

- Eight users exist: one captain, one organisation admin, two referees, one super admin, one venue admin, and **two users with a NULL role**. No live user has legacy role `user`.
- Case-insensitive email duplicate groups: **0**.
- Duplicate `auth_accounts (userId, provider)` groups: **0**.
- Orphan auth accounts: **0**.
- Orphan database sessions: **0**.
- Production Auth.js shape remains as established by the schema dump:
  - `auth_users.id` is UUID and `email` has case-sensitive uniqueness plus a non-unique `lower(email)` index;
  - `auth_accounts.id` is opaque text, `userId` is UUID, OAuth token columns are present, and no user FK or `(userId, provider)` unique constraint exists;
  - `auth_sessions.userId` is text and has no FK; the table is currently estimated empty;
  - verification tokens use the Auth.js-compatible composite primary key `(identifier, token)`.

**Finding:** email and account data are ready for case-insensitive uniqueness, account ownership uniqueness, and an account user FK. Role hardening is blocked only by the two NULL-role users, whose roles must be assigned from authoritative operator data.

### Q2 — Invitations

- Two historical invitations exist, both with role `org_admin`.
- Active, unused, unexpired invitations: **0**.
- NULL inviter IDs: **0**; invalid UUID text inviter IDs: **0**; orphan inviter IDs: **0**.
- Because there are no active invitations, no live invitation requires a guessed venue mapping. Historical invitations may safely retain a NULL venue reference unless an authoritative backfill is supplied.

**Finding:** production data does not block conversion of `invited_by` to UUID plus FK, or addition of nullable `venue_id`. No active invitation cleanup or expiry action is required.

### Q3 — Leagues, scoring, weekday, timezone, and calendar values

- PostgreSQL session timezone: `GMT`.
- `day_of_week` vocabulary: `Saturday` (3), `Thursday` (1).
- League status vocabulary: `active` (1), `completed` (2), `registration` (1).
- All four leagues have non-NULL weekday, status, name, match format, time slots, and maximum-team values.
- Every league uses `win_points = 3`, `draw_points = 1`, `forfeit_score_home = 3`, and `forfeit_score_away = 0`; invalid or negative scoring rows: **0**.
- Non-NULL season timestamps resolve to `02:00:00` in `Africa/Johannesburg`.
- Converting current start/end timestamps to Johannesburg-local calendar dates would shift **0** existing dates relative to UTC dates.

**Finding:** production confirms `win_points` and `draw_points` as the canonical column names. The application references to `points_win` and `points_draw` are wrong. Named weekday values and calendar intent still require an approved product mapping before any type conversion.

### Q4 — Slots and teams

- NULL slot numbers: **0**.
- Teams without a slot, league, or status: **0**.
- Duplicate active occupants of one slot: **0**.
- Invalid UUID text captain IDs: **0**; orphan captain IDs: **0**.
- Team/slot cross-league mismatches: **0**.
- Team status vocabulary: `active` (41), `inactive` (1).

**Finding:** the live data supports a captain UUID/FK conversion and slot-number non-null enforcement without data cleanup. Active-slot uniqueness and withdrawal semantics remain Gate 4 business concerns.

### Q5 — Matches

- Invalid UUID text referee IDs: **0**; orphan referee IDs: **0**.
- Match status vocabulary: `scheduled` (164), `final` (1).
- All 165 matches have non-NULL match date, time slot, field number, round number, status, home score, and away score.
- Negative score rows: **0**.
- Every match timestamp resolves to `02:00:00` in `Africa/Johannesburg`.
- Converting current match timestamps to Johannesburg-local calendar dates would shift **0** existing dates relative to UTC dates.

**Finding:** referee identity conversion is data-safe. Match lifecycle checks and calendar-type conversion remain later-gate work because their business semantics are not established by clean data alone.

### Q6 — Event-model reconciliation

Eight events exist:

| Current `type` | Legacy `event_type` | Rows |
|---|---|---:|
| `end_match` | `goal` | 1 |
| `goal_away` | `goal` | 1 |
| `goal_home` | `goal` | 5 |
| `start_first_half` | `goal` | 1 |

- NULL current types: **0**.
- NULL event timestamps: **0**.
- Unsupported current types: **0**.

**Finding:** the current `type` field contains the meaningful lifecycle vocabulary; the legacy `event_type` defaulted to `goal` even for non-goal events and cannot be treated as authoritative. Event consolidation belongs to Gate 3.

### Q7 — Standings

- Standings rows: **26**.
- Duplicate `(league_id, team_id)` pairs: **0**.
- Rows with NULL counters: **0**.
- Rows with negative counters: **0**.

**Finding:** unique pair and non-null counter constraints can be added without cleanup. Any later recomputation or business-rule reconciliation remains Gate 4.

### Q8 — Availability and token state

- Availability rows: **0**.
- Duplicate match/team pairs: **0**.
- No production response vocabulary or retained response-token state exists to reconcile.
- Production still defines `token NOT NULL` and lacks `reminder_count` and `last_reminder_at`, while the application writes both missing columns and clears tokens after response.

**Finding:** the empty table allows safe forward convergence before the workflow becomes active. Reminder behavior itself remains Gate 5.

### Q9 — Notifications

- Notifications: **208**, all type `unconfirmed_alert`.
- Invalid UUID text user IDs: **0**; orphan user IDs: **0**.
- NULL type, title, message, or read values: **0**.
- Production has no notification-type CHECK constraint.

**Finding:** user identity conversion and payload nullability are data-safe. Any future type constraint must preserve `unconfirmed_alert`; complete workflow/type policy remains Gate 5.

### Q10 — Password-reset tokens

- Password-reset rows: **9**.
- NULL `used` flags: **0**.
- Orphan user references: **0**.

**Finding:** a user FK with cascade and `used NOT NULL` can be added without cleanup. Session invalidation after password reset is a Gate 2 application change, not a data remediation.

### Q11 — Venue tenancy

- Venues: **3**.
- Venues without an organisation: **0**.
- Venues referencing a missing organisation: **0**.

**Finding:** production data supports `venues.organization_id NOT NULL`. All venue-creation writers must be verified before enforcement.

### Q12 — Index equivalence, table sizing, and lock risk

- Public indexes: **47**.
- `league_slots_unique_slot` exists and agrees with migration `0002`.
- Duplicate equivalent indexes remain on `matches(league_id)`: `idx_matches_league_id` and `matches_league_idx`.
- Missing integrity indexes/constraints remain for case-insensitive user email, account `(userId, provider)`, standings `(league_id, team_id)`, and availability `(match_id, team_id)`.
- Largest total relations are `matches` at 144 kB and `notifications` at 136 kB. Every other relation is 64 kB or smaller.
- Largest tuple estimates are notifications (208) and matches (165). These are planner estimates, not authoritative business counts.

**Finding:** no current relation presents unacceptable lock or index-build risk. Ordinary transactional constraints and indexes are proportionate at current sizes. Size and conflict preflights must still be repeated immediately before migration because this conclusion is time-sensitive.

## D. Query adjustments required

1. Published row-level anomaly queries were replaced with aggregate-equivalent counts. This preserved the required classification evidence without exposing production row IDs.
2. Arbitrary text identifiers were never cast to UUID. UUID format was checked with a regular expression, and ownership joins compared `uuid::text` to the text value.
3. Case-insensitive email duplicate counts, active-invitation venue determinacy, session orphans, relationship sizes, and total index catalogue output were added because the Gate 2A brief explicitly required those decisions.
4. The Q12 size query included `pg_relation_size`, `pg_indexes_size`, and `pg_total_relation_size` so lock risk could be assessed rather than inferred from tuple estimates alone.
5. A supplemental match/team relationship query used `LEFT JOIN` plus `IS DISTINCT FROM` without first excluding NULL team assignments. Its two counts of 165 therefore conflate unassigned teams with cross-league teams and are **excluded from every finding and decision in this report**. It was not part of the published Q1-Q12 set and does not block Gate 2A. If this later becomes relevant to Gate 4, the predicate must be changed to require `home_team_id IS NOT NULL` or `away_team_id IS NOT NULL` before comparing league IDs.

No production type made a required published query impossible. The text-ID comparisons were deliberately rewritten into the smallest safe, no-cast equivalents.

## E. Confirmed production anomalies

| Finding | Live evidence | Classification / action |
|---|---|---|
| NULL user roles | 2 of 8 users | Gate 2 cleanup decision required before role NOT NULL enforcement |
| Case-insensitive email uniqueness absent | 0 duplicate groups; lower-email index is non-unique | Gate 2 forward constraint/index; no cleanup |
| Account owner/provider integrity absent | 0 duplicate groups and 0 orphans | Gate 2 FK and unique constraint; no cleanup |
| `auth_users.push_token` absent | 8 existing users; application reads/writes it and performs request-time `ALTER TABLE` | Additive Gate 2 migration, then remove request-time DDL |
| Invite venue and inviter shape mismatch | 2 historical, 0 active, 0 invalid/orphan inviter IDs | Add nullable venue FK and UUID inviter FK; no active-data remediation |
| Captain/referee/notification identities stored as text | 0 invalid/orphan values in every tested table | Gate 2 UUID/FK convergence; no data cleanup |
| Availability schema incompatible with application | Table empty; reminder columns absent; token is NOT NULL | Gate 2 forward schema convergence; behavior deferred to Gate 5 |
| Notification CHECK assumptions incomplete | 208 rows are `unconfirmed_alert`; production has no CHECK | Preserve current type; type-policy work deferred to Gate 5 |
| Scoring names disagree with application | 4 leagues consistently use `win_points`/`draw_points` | Patch application names; forward-add canonical columns to other environments |
| Password-reset user integrity is unenforced | 9 rows, 0 orphans, 0 NULL `used` | Gate 2 FK and NOT NULL constraint; no cleanup |
| Standings uniqueness is unenforced | 26 clean rows, 0 duplicate pairs | Gate 2 structural constraint; recomputation remains Gate 4 |
| Duplicate match-league index | Two equivalent indexes confirmed | Optional final Gate 2 index cleanup |

The request-time `ALTER TABLE` in the push-token route is a confirmed application bug. Production credentials must not be expected to perform DDL during requests.

## F. Data-remediation decisions now possible

- Case-insensitive email uniqueness can be enforced without deduplication.
- Account ownership FK and `(userId, provider)` uniqueness can be added without account cleanup.
- Captain, referee, notification owner, and invitation creator text IDs have no invalid or orphan values. Type convergence may proceed after a same-transaction recheck.
- There are no active invitations, so no active invitation needs an inferred venue. The two historical rows can remain venue-null.
- The empty availability table needs no merge or token cleanup before schema convergence.
- Standings unique-pair and non-null counter constraints need no cleanup.
- Password-reset FK and `used NOT NULL` need no cleanup.
- Venue organisation non-null enforcement needs no data cleanup.
- League-slot number non-null enforcement needs no cleanup.
- Current scoring values require no production data change; application naming must converge on production.
- Current Johannesburg-local calendar conversion would shift zero live league or match dates. This establishes feasibility, not product intent.

Every migration must repeat its relevant count/duplicate/orphan preflight inside the deployment transaction or immediately before the DDL. These results are evidence from one point in time, not a permanent guarantee.

## G. Decisions still requiring product/operator input

1. Assign authoritative roles to the two NULL-role users. Do not default them silently to captain or infer privilege from historical activity.
2. Approve the canonical mapping of `Thursday` and `Saturday` to any future integer weekday representation.
3. Confirm that league and match timestamps are calendar dates whose authoritative timezone is `Africa/Johannesburg`; zero current date shifts do not establish future semantics.
4. Decide whether historical invitations should ever receive a venue. There is no active-data requirement to do so.
5. Decide whether long-term push delivery remains one `auth_users.push_token` value or moves to a multi-device token table. Gate 2 can add the compatibility column required by the current application; device workflow belongs to Gate 5.
6. Decide whether dormant database-backed Auth.js sessions remain supported. JWT sessions are currently active, and the session table is estimated empty.
7. Approve notification-type governance in Gate 5. `unconfirmed_alert` is proven production data and cannot be omitted.
8. Approve legacy/current event reconciliation in Gate 3. Legacy `event_type = goal` is not trustworthy for non-goal lifecycle events.
9. Preserve the approved deterministic match-truth rule for any later standings recomputation, even though no duplicate standings exist today.

## H. Gate ownership map

| Finding | Owner |
|---|---|
| Role resolution, email canonicalisation/uniqueness, account FK/uniqueness, session revocation, reset-token integrity | Gate 2 |
| Invitation venue/creator integrity and Auth.js production-shape compatibility | Gate 2 |
| Captain/referee/notification identity conversion and ownership-access prerequisites | Gate 2 |
| Missing push/reminder compatibility columns and removal of request-time DDL | Schema portion in Gate 2; workflow behavior in Gate 5 |
| Match command transactions, locking, idempotency, event operations, and finalisation | Gate 3 |
| Weekday semantics, calendar conversion, scoring behavior, fixtures, team assignment, forfeits, withdrawals, and standings recomputation | Gate 4 |
| Availability reminders, token lifecycle behavior, notification workflow/type policy, email/push delivery, multi-device token design | Gate 5 |
| Role dashboards, major UX redesign, and release polish | Gate 6 |

## I. Proposed Gate 2B scope

No migration is written in Gate 2A. The following candidates are evidence-based inputs to Gate 2B.

### 1. User role and email identity hardening

- **Current:** 8 users; 2 NULL roles; no legacy `user` roles; 0 case-insensitive duplicate-email groups; case-sensitive email uniqueness plus non-unique `lower(email)` index.
- **Desired:** canonicalised email writes, unique `lower(email)`, and a non-null supported role after authoritative remediation.
- **Affected rows:** 2 require a role decision; 0 require email deduplication.
- **Cleanup:** required only for the two NULL roles.
- **Forward migration:** yes; unique lower-email index/constraint, then role default/NOT NULL/check after remediation.
- **Application order:** canonicalise email and close hidden self-signup/role-assignment paths before enforcing the final role rule. Resolve privileged authorization from current database state rather than stale session claims.
- **Rollback/forward fix:** retain stronger email uniqueness; correct misassigned roles with an audited forward data fix rather than relaxing the constraint.
- **Risk:** low at 8 rows, but role assignment is security-sensitive and requires operator approval.

### 2. Auth account integrity and compatible Auth.js shape

- **Current:** approximately 6 account rows; 0 duplicate `(userId, provider)` groups; 0 orphans; OAuth columns and opaque text IDs exist; user FK and owner/provider uniqueness do not.
- **Desired:** preserve production Auth.js columns and opaque IDs, add user FK and unique `(userId, provider)`, and forward-add production-required Auth.js columns to non-production starting schemas.
- **Affected rows:** 0 require cleanup; all existing account rows are validated by the new constraints.
- **Cleanup:** none.
- **Forward migration:** yes, idempotent across production and checked-in starting states.
- **Application order:** land the constraint before relying on `ON CONFLICT ("userId", provider)`; do not deploy schema definitions that remove production OAuth fields.
- **Rollback/forward fix:** preserve additive columns and constraints; repair future conflicts forward rather than reverting to an ambiguous ownership model.
- **Risk:** low; relation total size is 64 kB.

### 3. Push-token compatibility and request-time DDL removal

- **Current:** `auth_users.push_token` is absent; 8 existing users; application routes select/update it and the registration route attempts `ALTER TABLE` during a request.
- **Desired:** add nullable `push_token` as an immediate compatibility field and remove all request-time DDL. A multi-device model, if chosen, is later work.
- **Affected rows:** 8 existing users receive NULL in the new column; 0 require cleanup.
- **Cleanup:** none.
- **Forward migration:** yes, additive.
- **Application order:** migration first, then application patch removing DDL and using the deployed column.
- **Rollback/forward fix:** retain the nullable column on rollback; disable writers or forward-fix application behavior rather than dropping it.
- **Risk:** very low; `auth_users` totals 64 kB including indexes.

### 4. Invitation identity and venue shape

- **Current:** 2 historical invitations, 0 active; inviter text values are all valid and owned; `venue_id` is absent.
- **Desired:** UUID inviter FK, nullable venue FK, and an approved role constraint. Do not invent historical venue assignments.
- **Affected rows:** 2 rows participate in type conversion; 0 require cleanup or active mapping.
- **Cleanup:** none unless an operator elects to enrich historical rows.
- **Forward migration:** yes.
- **Application order:** add `venue_id` before deploying routes that write it; UUID parameters remain compatible after inviter conversion.
- **Rollback/forward fix:** keep nullable venue data and UUID integrity; correct bad future references forward.
- **Risk:** low; relation total size is 64 kB.

### 5. Captain, referee, and notification-owner identity convergence

- **Current:** captain, referee, and notification user references are text. Across 42 teams, 165 matches, and 208 notifications, the preflight found 0 invalid UUID text values and 0 orphans.
- **Desired:** UUID columns with FKs to `auth_users`, preserving nullability where assignment is optional.
- **Affected rows:** up to 42 teams, 165 matches, and 208 notifications are touched or validated; 0 need data cleanup.
- **Cleanup:** none, subject to the mandatory deployment-time recheck.
- **Forward migration:** yes; direct conversion is feasible at current sizes, while shadow columns remain the safer phased option.
- **Application order:** migrate before or atomically with application code that performs direct UUID joins. Existing string UUID parameters remain compatible with UUID target columns.
- **Rollback/forward fix:** prefer shadow-column cutover if rollback capability is required; otherwise keep UUID types and repair forward.
- **Risk:** low by size (teams 48 kB, matches 144 kB, notifications 136 kB), but these are access-control identities and require exact validation.

### 6. Notification and reset-token structural integrity

- **Current:** 208 notifications have valid owners and complete payloads; all are `unconfirmed_alert`. Nine reset-token rows have non-NULL `used` and valid users.
- **Desired:** notification user FK and required payload fields; reset-token user FK with cascade and `used NOT NULL`. Notification type policy remains Gate 5.
- **Affected rows:** 208 notifications and 9 reset-token rows validate cleanly; 0 require cleanup.
- **Cleanup:** none.
- **Forward migration:** yes.
- **Application order:** identity migration before ownership-enforcing notification code; reset-token constraints before adding password-reset session invalidation.
- **Rollback/forward fix:** retain FKs and required fields; forward-fix invalid future writes. Never remove `unconfirmed_alert` from supported production reads.
- **Risk:** low at current sizes.

### 7. Availability schema compatibility

- **Current:** 0 rows; token is NOT NULL; reminder columns and match/team uniqueness are absent.
- **Desired:** nullable token after response, `reminder_count`, `last_reminder_at`, unique `(match_id, team_id)`, and an approved response constraint.
- **Affected rows:** 0.
- **Cleanup:** none.
- **Forward migration:** yes.
- **Application order:** migrate before enabling confirmation or reminder routes that clear tokens or reference reminder columns.
- **Rollback/forward fix:** retain additive fields and relaxed token nullability; disable workflow code if a forward fix is needed.
- **Risk:** minimal because the table is empty and totals 24 kB including indexes.

### 8. Safe structural constraints

- **Current:** 46 estimated league slots have 0 NULL slot numbers; 26 standings rows have 0 duplicate pairs and 0 invalid counters; 3 venues all have organisations.
- **Desired:** `league_slots.slot_number NOT NULL`, unique standings `(league_id, team_id)` with non-null counters, and `venues.organization_id NOT NULL` after writer audit.
- **Affected rows:** 0 require cleanup; existing rows are validated by the constraints.
- **Cleanup:** none.
- **Forward migration:** yes.
- **Application order:** verify every venue writer supplies an organisation before tenancy enforcement. Standings business calculations are unchanged.
- **Rollback/forward fix:** retain integrity constraints and correct writers/data forward; do not choose arbitrary standings duplicate winners if future preflight changes.
- **Risk:** low; every affected relation totals 40 kB or less.

### 9. League scoring portability and application naming

- **Current:** production has four complete scoring rows using `win_points`, `draw_points`, and both forfeit columns; checked-in historical migrations do not establish these columns everywhere; UI code reads wrong names.
- **Desired:** canonical production names in every supported environment and application code that reads them. Match-result behavior remains Gate 4.
- **Affected rows:** 4 production rows require no value change; non-production environments receive idempotent additive columns/defaults.
- **Cleanup:** none.
- **Forward migration:** yes for cross-environment convergence; a no-op where columns already exist.
- **Application order:** deploy the idempotent migration to all environments, then switch application reads from `points_win`/`points_draw` to `win_points`/`draw_points`.
- **Rollback/forward fix:** keep additive columns and revert only application reads if necessary.
- **Risk:** low; league relation total size is 64 kB.

### 10. Index cleanup

- **Current:** two equivalent indexes exist on `matches(league_id)`; required integrity-backed indexes above are absent.
- **Desired:** add constraint-supporting unique indexes, then remove one redundant match-league index after verifying no dependency.
- **Affected rows:** no data cleanup; 165 match rows are indexed.
- **Cleanup:** catalogue-only redundancy removal.
- **Forward migration:** yes, last in the sequence.
- **Application order:** independent after constraints are live.
- **Rollback/forward fix:** recreate the removed index only if evidence shows a dependency or regression.
- **Risk:** low at 144 kB. The migration runner cannot use `CONCURRENTLY` inside its transaction; current size does not justify a separate concurrent mechanism, but size must be rechecked at deployment.

### Recommended Gate 2B ordering

1. Approve and remediate the two NULL roles; patch role/email/self-signup behavior.
2. Add cross-environment Auth.js compatibility and `push_token`.
3. Remove request-time DDL after the additive column exists.
4. Add account FK/owner-provider uniqueness and case-insensitive email uniqueness.
5. Add invitation venue shape and converge inviter identity.
6. Converge captain, referee, and notification-owner identities and add FKs.
7. Add reset-token, venue-tenancy, league-slot, standings, and availability constraints.
8. Add canonical scoring columns idempotently to every supported starting state, then patch application reads.
9. Validate constraints and rerun all affected counts.
10. Remove the redundant match-league index last.

## J. Explicitly deferred Gate 3/4/5/6 findings

- **Gate 3:** match command transactions, locking, idempotency, goal operation IDs, `END_MATCH`, score lifecycle, and current/legacy event consolidation.
- **Gate 4:** weekday mapping, calendar-type conversion, scoring behavior, fixture team assignment/capacity/admin, forfeits, withdrawals, active-slot business rules, and standings recomputation.
- **Gate 5:** reminder cadence and delivery, availability workflow behavior, notification type/workflow semantics, email/push delivery, and multi-device token design.
- **Gate 6:** major UX/product redesign, role dashboards, and final release polish.

The excluded supplemental match/team relationship count is deferred to Gate 4 with a corrected NULL-aware query. It is not a confirmed anomaly.

## K. Production mutation statement

No production or staging data, schema, configuration, migration ledger, lock state, deployment, Railway setting, Neon setting, GitHub setting, branch, or default branch was changed. The only database transaction was explicitly read-only and ended in `ROLLBACK`.

## L. Repository state

- Branch: `astra/critical-stabilisation`.
- HEAD: `beb9c6623e1031f0da8feca3f7d626f44e0ac115`.
- Migrations `0001_initial.sql` and `0002_add_unique_league_slots.sql` remain unchanged.
- The production schema dump remains external and untracked.
- The temporary preflight SQL and aggregate result file were used only as local, untracked inspection artefacts and are removed after report verification.
- No migration, deployment, commit, or default-branch change was performed.

NOVA GATE 2A LIVE PREFLIGHT COMPLETE — AWAITING REVIEW

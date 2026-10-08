# NovaChrono Gate 2B implementation report

## A. Baseline

- Branch: `astra/critical-stabilisation`.
- Gate 2A starting commit: `beb9c6623e1031f0da8feca3f7d626f44e0ac115`.
- Authoritative inputs: the accepted production PostgreSQL 17.11 schema-only export, the Gate 1 schema-truth report, `docs/gate2-live-preflight.md`, and the production migration ledger (`0001_initial.sql`, `0002_add_unique_league_slots.sql`).
- The starting tree was clean except for the reviewed, untracked Gate 2A report. That report is included with this work.
- Before implementation, 214 unit tests, lint, and the production build passed. The only build warning was Next.js's existing middleware-to-proxy deprecation notice.
- `migrations/0001_initial.sql` and `migrations/0002_add_unique_league_slots.sql` were not edited. All convergence is forward-only.
- No production or staging database was changed. No migration was run outside isolated local rehearsal databases.

## B. Files changed

Schema and migration work:

- `schema.sql`
- `migrations/0003_auth_identity_integrity.sql`
- `migrations/0004_application_schema_integrity.sql`
- `migrations/0005_enforce_user_role_not_null.sql`
- `migrations/0006_remove_redundant_match_index.sql`
- `scripts/verify-gate2-migrations.ps1`
- `tests/fixtures/gate2-production-shape.sql`
- `tests/fixtures/gate2-playwright-users.sql`

Authentication, identity, access, and database transport:

- `src/auth.js`, `src/middleware.js`
- `src/app/api/utils/auth.js`, `email.js`, `mobile-auth.js`, `ownership.js`, `session-security.js`, `db.js`
- Account, invitation, referee, sign-in, reset, verification, mobile-session, push-token, captain, team, match, postponement, org-admin, super-admin, captain-message, and weekly-report handlers under `src/app`
- `src/app/account/signin/page.jsx`
- `package.json`, `package-lock.json`, and `playwright.config.js`

Scoring-name compatibility:

- `src/app/captain/rules/[leagueId]/page.jsx`
- `mobile/src/app/rules/[leagueId].jsx`
- `src/components/LeagueDetail/OverviewTab.jsx`
- `tests/e2e/smoke.spec.js`

Tests and evidence:

- `src/__tests__/access-boundaries.test.js`
- `src/__tests__/credentials-security.test.js`
- `src/__tests__/gate2-schema.test.js`
- `src/__tests__/gate2-security.test.js`
- `src/__tests__/html-boundaries.test.js`
- `src/__tests__/match-correction.test.js`
- `src/__tests__/onboarding-contracts.test.js`
- `docs/gate2-live-preflight.md`
- this report

## C. Forward migrations created

1. `0003_auth_identity_integrity.sql`
   - Normalises existing emails to trimmed lowercase after duplicate/blank checks.
   - Adds the case-insensitive unique email index, `push_token`, `sessions_valid_after`, the supported-role constraint/default, Auth.js compatibility columns, account ownership/provider uniqueness and FK integrity, and reset-token owner integrity.
   - Preserves production's opaque text `auth_accounts.id` values and OAuth fields.
2. `0004_application_schema_integrity.sql`
   - Adds nullable invitation `venue_id`; converts invitation, captain, referee, and notification identity references to guarded UUID/FK form.
   - Adds invitation role integrity, payload nullability, availability compatibility, standings/slot/venue prerequisites, canonical league scoring columns, and supporting indexes.
   - Removes the incomplete historical notification-type CHECK rather than rejecting the proven production value or guessing the full Gate 5 vocabulary.
3. `0005_enforce_user_role_not_null.sql`
   - Is the explicit production hold point. It fails closed while any role is NULL, then enforces `auth_users.role NOT NULL` only after the operator has assigned authoritative roles.
4. `0006_remove_redundant_match_index.sql`
   - Runs last. It compares both `matches(league_id)` index definitions and checks dependencies before dropping only `matches_league_idx`.

## D. Production-vs-fresh compatibility strategy

- Every migration was rehearsed from both supported starting points: a fresh `0001 + 0002` database and a synthetic production-shaped database derived from the accepted schema/preflight evidence.
- Catalogue guards inspect existing columns, types, constraints, and indexes before changing them. The migrations accept an already-converged fresh shape while repairing the known production differences.
- Production-only Auth.js OAuth columns are retained. Opaque production account IDs remain text and their values are preserved; no UUID conversion is attempted for `auth_accounts.id`.
- Direct UUID conversion was selected for the four validated identity references because Gate 2A proved the relations small, with zero malformed values and zero orphans. The migration repeats those proofs immediately before each conversion and fails instead of coercing data.
- Legitimate nullable assignments remain nullable, including historical invitation `venue_id`, team captain, and match referee.
- The smoke suite can explicitly select the standard `pg` transport for an isolated local PostgreSQL fixture. Neon remains the default application/production transport.

## E. Auth/access changes

- Email identity is canonicalised as `trim + lowercase` at credential login, approved signup/invitation acceptance, password-reset request, verification/status checks, administrative creation/invitation, mobile sign-in, and Auth.js create/update/link/lookup/unlink boundaries.
- Database uniqueness on `lower(email)` prevents case variants from becoming distinct identities, including race conditions between application checks.
- The client-controlled `isSignup` credentials path and its privileged self-registration behaviour were removed. Approved signup and invitation flows remain.
- Auth.js JWT callbacks reload the current user, role, venue, organisation, and referee field from the database. Deleted users and revoked sessions are rejected.
- Shared `resolveCurrentUser`/`requireRole` helpers make privileged route decisions from the current database row. Affected captain, venue, organisation, super-admin, match, postponement, report, and messaging handlers use that model.
- Mobile middleware now accepts only the existing revocable `jti` session path; the former generic signed bearer fallback is gone.
- `/api/auth/token` is permanently disabled with HTTP 410 and cannot issue the legacy unrevocable 30-day credential.
- Team reads now separate public league/join-code projections from private team/captain lookups. Private reads require live ownership or tenant-scoped administration; super-admin remains explicit.

## F. Session revocation model

- `auth_users.sessions_valid_after` is the single web/JWT validity boundary. Its migration default is the Unix epoch, so installing the migration does not invalidate existing sessions.
- New web sessions retain their issue time. Every Auth.js JWT refresh compares that issue time with the live database boundary.
- Password reset and referee/shared-credential regeneration advance the boundary and delete that user's `mobile_sessions` in the same transaction as the credential change.
- Mobile tokens remain tied to `mobile_sessions.jti`, expiry, the live user row, and the same validity boundary. Tokens without a `jti` are rejected.
- The dormant `auth_sessions` table was not made authoritative; Auth.js remains on the JWT strategy.

## G. Identity conversions

The following columns converge to UUID with repeated malformed-value and orphan preconditions, then receive FKs and lookup indexes where needed:

- `invite_tokens.invited_by -> auth_users.id`
- `teams.captain_user_id -> auth_users.id`
- `matches.referee_id -> auth_users.id`
- `notifications.user_id -> auth_users.id`

Invitation `venue_id` is nullable and references `venues.id`. No historical venue assignment is invented. The production-shaped rehearsal explicitly proves the historical NULL remains valid.

## H. Request-time DDL removal

- Nullable `auth_users.push_token` is created by migration 0003.
- The push-token route now performs data updates only. No request handler under `src` or `mobile` contains `ALTER TABLE` or `CREATE TABLE` behaviour.
- Multi-device push-token design remains deferred to Gate 5.

## I. Constraint/index changes

- Auth: unique `lower(email)`; supported role CHECK; account owner FK; unique `(userId, provider)`; preserved/ensured unique `(provider, providerAccountId)`; account-owner index.
- Reset tokens: non-null owner/used state, owner FK with cascade, owner index.
- Invitations: canonical email data, non-null UUID inviter FK, nullable venue FK, supported invitation roles, FK indexes.
- Identity references: UUID FKs plus captain/referee/notification lookup indexes.
- Availability: nullable token, `reminder_count`, `last_reminder_at`, and unique `(match_id, team_id)`; no guessed response CHECK.
- Notifications: owner/payload nullability and owner/read index; notification-type governance deliberately deferred.
- Structure: non-null slot number, unique standings league/team pair, non-null standings counters with existing zero defaults, and non-null valid venue organisation with index. Both venue-creation writers were audited and supply `organization_id`.
- Scoring: `win_points`, `draw_points`, `forfeit_score_home`, and `forfeit_score_away` are canonical and non-null with existing v1 defaults. Application reads were renamed without changing scoring behaviour.
- Index cleanup: only the verified equivalent `matches_league_idx` is removed, after dependency checks, while `idx_matches_league_id` remains.

## J. Tests

Final local results:

- Unit/security/schema regression: **237 passed across 14 files**.
- Migration rehearsal: **passed** for fresh and production-shaped paths.
- Migration anomaly checks: **passed** for canonical-email duplicates, account owner/provider duplicates, malformed UUID identity text, standings duplicates, availability duplicates, and the role hold point.
- Migration state assertions: **passed** for opaque account IDs/OAuth fields, historical NULL invitation venue, UUID identity columns, `push_token`, nullable availability token/reminder columns, existing `unconfirmed_alert`, canonical scoring names, and final match-index state.
- Playwright Chromium smoke: **6 passed** against synthetic users in an isolated migrated local database.
- ESLint: **passed**.
- Production build: **passed**; the pre-existing Next.js middleware deprecation warning remains.
- Production dependency audit (`npm audit --omit=dev`): **0 vulnerabilities**.

Focused coverage includes the removed self-signup path, approved onboarding, canonical identity lookups, current-role/tenant changes, deleted-user denial, web/mobile revocation, disabled legacy token route, atomic reset/invitation claims, referee credential revocation, and cross-team/cross-organisation BOLA denial.

## K. Migration preconditions

The migrations fail closed rather than choosing or coercing records when they detect:

- blank or canonically duplicated user emails;
- duplicate account owner/provider or provider/provider-account identities;
- orphan accounts or reset-token owners;
- malformed/orphan invitation, captain, referee, or notification identities;
- unsupported invitation roles or invitation venue orphans;
- duplicate availability or standings pairs;
- NULL slot numbers or standings counters;
- NULL/orphan venue organisations;
- NULL canonical scoring values;
- unresolved NULL user roles at enforcement time;
- non-equivalent or dependency-backed match indexes at cleanup time.

The migration runner executes each migration transactionally. No destructive down migration is supplied; after application code depends on the new shape, rollback should be by database restore before cutover or an explicitly reviewed forward fix.

## L. Production cutover prerequisites

**PRODUCTION ROLE ASSIGNMENT REQUIRED: 2 USERS**

The two roles must be established from authoritative operator knowledge. They were not inferred, defaulted, or changed by Gate 2B. Run this read-only query locally to identify only the minimum fields needed:

```sql
BEGIN TRANSACTION READ ONLY;

SELECT id, name, email, role
FROM auth_users
WHERE role IS NULL
ORDER BY email, id;

ROLLBACK;
```

Do not record or commit the query result. Before any production cutover:

1. Re-run the accepted read-only preflight checks and table-size/index-definition checks.
2. Obtain authoritative role assignments for both users and apply them through an approved, audited operator procedure.
3. Confirm the NULL-role count is zero.
4. Take the normal production backup/restore checkpoint.
5. Apply `0003`, then `0004`, then `0005`, then `0006` through the migration runner. Any precondition failure stops the cutover for investigation.
6. Verify migration ledger entries and the post-migration schema before deploying application code that depends on the new columns.

Gate 2B implementation review may proceed now. Production migration or deployment may not proceed through `0005` while the two roles remain unresolved.

## M. Explicitly deferred Gate 3/4/5/6 work

- Gate 3: match command/lifecycle semantics, including `END_MATCH` remediation.
- Gate 4: fixture, standings calculation, withdrawal, active-slot, and scoring business rules.
- Gate 5: notification-type governance, availability/reminder workflow, delivery behaviour, and multi-device push-token design.
- Gate 6: redesign and broader user-experience work.

No work from those gates was pulled into this schema/access implementation.

## N. Repository state

- Work is based on `beb9c6623e1031f0da8feca3f7d626f44e0ac115` on `astra/critical-stabilisation`.
- Historical migrations 0001 and 0002 are byte-for-byte unchanged from that baseline.
- The accepted Gate 2A report is included.
- Production/staging, deployment configuration, the GitHub default branch, and remote branches/tags were not changed.
- Local PostgreSQL instances used for rehearsal contain synthetic fixture data only.

## O. Commit(s)

- Gate 2B is recorded as one cohesive commit with subject `feat: implement Gate 2B schema and access truth`.
- The final commit hash is reported in the review handoff; a commit cannot contain its own stable hash.

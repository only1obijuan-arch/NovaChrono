# NovaChrono Gate 2B remediation report

## A. Counter-review findings addressed

The remediation closes all four P1 findings and the approved security-adjacent P2 findings from the Gate 2B counter-review:

- sticky web-session revocation across Auth.js JWT re-encoding;
- the credential-verification/password-reset issuance race;
- fail-closed JWT behavior during a live-user database lookup failure;
- FK-safe referee and generic user deletion;
- the scoped admin team projection required by the existing Teams tab;
- PostgreSQL-backed CI, migration rehearsal, and browser testing;
- the role-default cutover window;
- bounded migration lock acquisition;
- atomic single-use mobile refresh rotation; and
- cross-venue generated referee identity collision protection.

No work was expanded into Gate 3, 4, 5, or 6.

## B. Exact files changed

Runtime and routes:

- `src/auth.js`
- `src/app/api/admin/referees/route.js`
- `src/app/api/auth/mobile-refresh/route.js`
- `src/app/api/super-admin/users/route.js`
- `src/app/api/teams/route.js`

Forward migrations and runner:

- `migrations/0003_auth_identity_integrity.sql`
- `migrations/0004_application_schema_integrity.sql`
- `migrations/0005_enforce_user_role_not_null.sql`
- `migrations/0006_remove_redundant_match_index.sql`
- `scripts/migrate.js`

Tests and fixtures:

- `src/__tests__/access-boundaries.test.js`
- `src/__tests__/credentials-security.test.js`
- `src/__tests__/gate2-schema.test.js`
- `src/__tests__/gate2-security.test.js`
- `tests/integration/setup.js`
- `tests/integration/gate2-remediation-routes.test.js`
- `tests/e2e/smoke.spec.js`
- `tests/fixtures/gate2-playwright-users.sql`
- `vitest.config.js`
- `vitest.integration.config.js`

CI and project metadata:

- `.github/workflows/ci.yml`
- `package.json`
- `docs/gate2-implementation-report.md`
- `docs/gate2-remediation-report.md`

## C. P1 fixes

- Web JWTs now retain one `session_issued_at` value. Legacy tokens copy their original `iat` once; Auth.js re-encoding cannot move the security boundary forward.
- Referee deletion and generic user deletion now detach nullable operational relationships in a single transaction before deleting the identity. History-protecting FK failures return HTTP 409 and roll back the detachments.
- `GET /api/teams?leagueId=...` keeps its five-field public projection while returning only the captain and registration fields needed by the Teams tab to a live, in-scope venue, organisation, or platform administrator.
- CI now provisions PostgreSQL 17, migrates it, runs real PostgreSQL route tests, seeds browser fixtures, and runs Playwright with the database-backed auth boundary.

## D. Selected P2 fixes

- Credential authentication captures its issuance timestamp before password verification starts, so a reset that commits while hashing is in progress invalidates that login.
- JWT live-user lookup errors fail closed, clear copied authorization claims, and preserve the pinned issuance timestamp.
- Role defaulting is deferred from migration 0003 to the fail-closed 0005 cutover point.
- Gate 2 DDL migrations use a five-second transaction-local lock timeout.
- Mobile refresh consumes its old session through `DELETE ... RETURNING` before issuing a replacement; concurrent use has exactly one winner.
- Existing generated referee identities are rotated only when the account is a referee in the requested venue.

## E. Migration changes

- Migration 0003 retains its NULL-tolerant supported-role check but no longer changes the role default.
- Migration 0005 first proves there are no unresolved NULL roles, then atomically establishes `DEFAULT 'captain'` and `NOT NULL`.
- Migrations 0003, 0004, 0005, and 0006 set `lock_timeout = '5s'` locally inside the migration transaction.
- Fresh and production-shaped rehearsals both pass. The NULL-role hold and anomaly fixtures still fail closed as designed.
- Historical migrations `0001_initial.sql` and `0002_add_unique_league_slots.sql` are unchanged from remediation base `c0fe938bfb1889a3dbdb79f5fc3c4453a87a63f4`.

## F. Auth/session behavior

For a new credential login, `session_issued_at` is the time authentication began, before the password hash verification. For a legacy JWT, the first callback copies `iat * 1000` into `session_issued_at`. Subsequent callbacks use only that pinned value, including after real `@auth/core` encode/decode cycles.

Every callback refreshes authorization attributes from the live user row. A missing user, a session boundary newer than the pinned issuance value, or a database exception produces a revoked token and removes stale name, email, role, venue, organisation, and field claims. A transient database failure therefore grants no access and cannot manufacture a newer issuance time.

## G. Delete behavior/FK handling

Referee deletion locks and revalidates the target in the transaction, checks live venue scope, nulls `matches.referee_id`, and deletes the user. Generic platform deletion locks the target, nulls `teams.captain_user_id` and `matches.referee_id`, then deletes the user. Existing cascade rules remove dependent rows intended to follow the identity.

Invitation and other history-preserving references are not deleted. PostgreSQL `23503` is returned as HTTP 409. Real PostgreSQL tests prove both successful detachments, protected-history conflict handling, rollback of a match detachment after a failed delete, and case-insensitive self-deletion protection.

## H. Teams projection/BOLA behavior

The public response remains limited to `id`, `league_id`, `slot_id`, `name`, and `status`. The expanded projection adds only `captain_user_id`, `captain_name`, and `created_at`, after resolving the current user and the league's venue and organisation and applying `canAdministerVenue`.

Owning venue administrators, in-scope organisation administrators, and platform administrators receive the expanded projection. Anonymous callers and administrators from another tenant receive the compatible public projection. Join codes, captain contact details, credentials, and other private fields remain absent. Playwright now renders the captain and registered date from an actual seeded team rather than an empty intercepted response.

## I. CI changes

The GitHub Actions verification job now uses a PostgreSQL 17 service with a readiness check. It applies the full migration chain through the portable migration runner using the standard `pg` transport only when explicitly selected for CI, rehearses the production-shaped path with Linux `psql`, runs the real PostgreSQL integration suite, seeds the isolated browser database, and supplies `PLAYWRIGHT_DATABASE_URL` to Playwright.

Unit tests, lint, the production build, production dependency audit, and committed-secret/private-key checks remain in the workflow. Production's default Neon transport is unchanged.

## J. Test results

- Unit/security/schema: 14 files, 248 tests passed.
- Real PostgreSQL route/concurrency: 1 file, 11 tests passed.
- Fresh migration rehearsal: passed.
- Production-shaped migration rehearsal: passed.
- NULL-role hold and anomaly fail-closed rehearsals: passed.
- Playwright on migrated, seeded PostgreSQL: 6 tests passed.
- ESLint: passed.
- Next.js production build: passed.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.

All database verification used a disposable local database. No production or staging connection was used.

## K. Remaining deferred P2 findings

The following remain recorded and intentionally unimplemented:

- public match `referee_id` projection;
- password-reset timing oracle;
- organisation-administrator capability-policy reconsideration;
- full multi-device push design;
- notification policy;
- `schema.sql` representation of the irreducible legacy-versus-fresh account primary-key difference;
- broad error-code normalisation; and
- broader `ADD_TEAM` and product semantics.

## L. Production cutover hold state

Production still has exactly two authoritatively identified disposable NULL-role test users. This remediation does not delete them and does not run any production migration.

The reviewed sequence remains: repeat preflight and catalogue dependency checks; apply 0003 and 0004; deploy the remediated application; run the reviewed dependency scan and delete only the two confirmed dummy users; apply 0005; then apply 0006. Migration 0005 continues to fail closed while any NULL role remains.

## M. Repository state

- Branch: `astra/critical-stabilisation`.
- Remediation base: `c0fe938bfb1889a3dbdb79f5fc3c4453a87a63f4`.
- Historical migrations 0001 and 0002 are unchanged.
- No production schema dump, result file, environment file, private key, or credential is included.
- Production, staging, deployment configuration, default branch, and the two production dummy users were untouched.

## N. Commit

The complete remediation is recorded as one cohesive commit with message `fix: remediate gate 2b counter-review`. Its final SHA is reported in the Gate 2B handoff after repository verification.

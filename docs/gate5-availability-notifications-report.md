# Gate 5 — Availability, Reminders, and Notification Reliability

## Release identity and safety

- Starting SHA (Gate 4B production base): `0ac94c2ef8c282c25334c692d7a4f56612ce56cb`
- Working branch: `gate5/availability-notifications`
- Final Gate 5 lineage, in order:
  - Gate 5 implementation: `bd89aa17e7d8608460afff94406aee2df8c2cc79`
  - Gate 5 documentation (also the narrow-remediation starting SHA): `046731f4acdc0186d45bb7b8ac01d7b8c4b66f82`
  - Gate 5 narrow remediation: `6937f041727526b202b7c5d296deb27c1ceab927`
  - Remediation documentation: `51c72dfbeedd7eb805637a77232aa56e8b28b3a7`
  - CI harness isolation: `08dc9b7a531c29cf29fafe24b57351cc67e5571b`
  - Next 16.4.5 security update: `187f7533f2e84b8ee41a297df4e2162263f0b19d`
  - Auth compatibility (engineering-accepted release candidate; this report is a documentation-only change on top of it): `4b97b85bbdd1b67e996756ee6b499261c40986ea`
- New forward-only migration: `0010_gate5_availability_notifications.sql`
- Migrations `0001` through `0009` remain byte-identical to Gate 5's starting state, and `0010` is byte-identical from the Gate 5 implementation commit onward. The `migrations/` tree hash (`927675549bf46a14fe1c9f6dd64c5a87deee1ac3`) is identical across every commit from the implementation through the auth-compatibility commit. No `0011` exists.
- Work and database verification used isolated local PostgreSQL databases only. Production Neon was not connected to or changed. Nothing was merged, deployed, or applied to production. The commits after `51c72df` were prepared and validated locally before publication.

## Outcome

Gate 5 makes the existing match-communications paths fail closed around current match/team identity, makes availability confirmation a single-use POST mutation, serializes reminder delivery claims, governs notification vocabulary, and gives email/push failures explicit behavior. It does not introduce a generic messaging framework.

For the accepted release candidate, P0 = 0 and P1 = 0. The deliberately deferred P2 items are recorded below.

## Verified behavior

- Every `sendEmail` invocation sends one idempotency key. A valid explicit caller key is preserved exactly; otherwise a random UUID is generated once per logical invocation, outside the retry loop, and reused for every internal attempt.
- Password-reset, captain/admin-message, and weather-alert route tests each reproduce provider acceptance followed by a lost response and prove one logical provider delivery.
- Reminder claim keys and midday/availability-response domain keys remain explicit and unchanged.
- Successful reminder finalization stores `last_reminder_at = clock_timestamp()`. The real-PostgreSQL blocker race proves a queued overlapping manual request is suppressed while a genuinely later request remains allowed.
- Required-email failure leaves reminder count and last-reminder time unchanged, and crash-window recovery reuses the same claim-derived provider key.

## Forensic inventory

### Email senders

The audit found and retained these domain senders:

- common match reminders, called by both the manual and cron endpoints;
- availability accepted/declined administrator notice;
- administrator-to-captain message;
- weather warning;
- round postponement;
- password-reset email;
- account/signup verification email;
- venue, organization, and platform invitation/acceptance flows;
- captain welcome email.

All continue through `src/app/api/utils/send-email.js`; no second provider or generic delivery abstraction was introduced.

Caller-key classification:

- Explicit domain keys: match reminder (`match-reminder/{claim_id}`), midday unconfirmed alert (`alert.dedupeKey`), and availability-response administrator follow-up (`availability-response/{availability_id}/{admin_id}`). These keys are passed through unchanged.
- Automatic per-invocation UUIDs: password reset, signup verification, organization invitation, organization/platform venue-admin invitation, administrator invite acceptance/welcome, captain welcome, captain/admin message, weather alert, and round postponement.

### Push senders

- common match reminders;
- administrator-to-captain message;
- weather warning;
- round postponement.

All continue through `src/app/api/utils/send-push.js`.

### Availability writers

- `src/app/api/utils/match-reminders.js` issues or rotates a pending token while claiming a required reminder delivery.
- `src/app/api/auth/confirm-availability/handler.js` is the only response consumer and atomically changes a pending row to `yes` or `no`.

The manual and cron endpoints no longer contain independent availability/reminder implementations. They call the same service.

### Notification emitters and consumers

In-app notification emitters are the common reminder service, availability confirmation, captain messaging, weather warning, and round postponement. `src/components/NotificationBell.jsx` is the principal consumer, with the captain team page and admin navigation mounting it. The communications cron is `/api/cron/match-reminders`; `/api/cron/cleanup-rate-limits` is unrelated and emits no notification.

## Notification type inventory

One shared constant and the database CHECK govern exactly these eight values:

1. `match_reminder`
2. `availability_confirmed`
3. `availability_declined`
4. `unconfirmed_alert`
5. `admin_message`
6. `weather_warning`
7. `match_postponed`
8. `round_postponed`

All audited emitters use the shared vocabulary. Migration `0010` fails before schema mutation if an unsupported production value exists, then installs and validates `notifications_type_supported`.

## Availability token lifecycle

1. A reminder request locks and revalidates the match, league, both current participant teams, selected side, captain, and schedule.
2. The service locks/upserts the availability row for the exact `(match_id, team_id)` identity.
3. A new token is 32 cryptographically random bytes represented as 64 hexadecimal characters. An unchanged schedule may reuse a still-pending token; a changed schedule rotates it.
4. `expires_at` is stored with the pending token. The required email is sent only after the claim transaction commits.
5. `GET /api/auth/confirm-availability` validates enough state to render a preview form but never changes availability, creates a notification, or sends email. Responses disable caching and indexing and use a no-referrer policy.
6. `POST` accepts only a well-formed token and `yes`/`no`, locks the authoritative match before the availability row, and revalidates the exact current participant team, league/match lifecycle, canonical schedule, and expiry. It does not re-resolve the team's current captain; captain reassignment is a deferred P2.
7. The winning POST stores the response and `responded_at`, clears the token, and creates the scoped in-app notification in one transaction. A repeated or racing POST fails safely with `410`.
8. The administrator email is attempted after commit, so a provider problem cannot roll back or falsely repeat the captain's accepted response.

Tokens are never put in logs. They remain plaintext at rest in v1; the residual risk and mitigations are recorded under P2.

## GET versus POST semantics

- GET is read-only preview, including crawler GETs and query strings that contain a proposed response.
- The preview submits an HTML POST form. No mutation is triggered by image prefetching, link scanners, email security crawlers, or browser navigation.
- POST is the only state-changing method and is guarded by row locks plus `response IS NULL`, an unexpired token, and authoritative state revalidation.
- Malformed, missing, nonexistent, expired, consumed, rescheduled, started, finalised, cancelled, inactive-team, and replaced-team opportunities fail closed without mutation. Current-captain reassignment is not revalidated at token consumption.

## Expiry and timezone semantics

The canonical expiry is the fixture's Johannesburg scheduled start:

```sql
(nova_planned_date(match_date) + time_slot::time)
  AT TIME ZONE 'Africa/Johannesburg'
```

`nova_planned_date` is used so both historical DATE environments and the accepted production TIMESTAMPTZ shape preserve the intended calendar date. Automatic morning selection uses Johannesburg local current date and fixtures one to three local days ahead. The same-day alert dedupe key interpolates the database driver's returned `match_local_date`; it is not explicitly normalized to a Johannesburg date string in application code. Invalid time-slot text prevents token issuance.

## Reminder claim and retry design

The shared reminder service implements this sequence:

1. lock the match;
2. reload an admitted manual actor and enforce venue/platform scope;
3. validate active league, scheduled/unstarted match, exact current side/team identity, both active participants, captain, email, and canonical schedule;
4. lock the exact availability row;
5. reject an existing response, automatic cadence inside 20 hours, or another live claim;
6. set a UUID claim and timestamp and issue/rotate token plus expiry;
7. commit;
8. send required email with Resend idempotency key `match-reminder/{claim_id}`;
9. attempt optional push independently;
10. lock match then availability again, insert the deduped in-app notification, increment `reminder_count`, set `last_reminder_at` with `clock_timestamp()`, and clear the same claim.

A claim is stale after 15 minutes. A required-email failure does not change reminder count or last-reminder time; it clears only the live timestamp so a retry is immediately possible. When the schedule is unchanged, that retry retains the claim UUID and provider idempotency key. The service never reports a failed required email as sent.

Automatic sends retain the established 20-hour cadence. For manual/manual overlap, the service also records when each request began: if another attempt completes while a queued manual request waits, `last_reminder_at >= attempt_started_at` suppresses the overlapping delivery. `last_reminder_at` is the wall-clock time of the finalization write; a request that begins after that write but before the transaction commits (a window of roughly one database round trip) is not covered. A genuinely later manual action remains permitted.

## Failure and provider semantics

### Email

- Existing Resend HTTP integration is preserved.
- Configuration, recipient, subject, and content are validated before I/O.
- Each request has a 10-second timeout and at most three attempts.
- Network failures, `429`, and `5xx` are retryable; other provider `4xx` responses are not retried.
- Non-2xx responses never claim success.
- Success returns the provider delivery ID.
- Errors exposed to callers are sanitized and bearer credentials are never logged.
- Idempotency keys are validated and bounded to 256 characters. A supplied key is used unchanged. Calls without one receive a cryptographically random UUID generated once outside the retry loop, and the header is present on every attempt.

The provider-failure matrix covers `400`, `429`, `500`, timeout, and network failure. Retryable attempts retain one key and ordinary `400` is attempted once. Every failed required reminder preserves retry eligibility.

### Expo push

- Accepted token formats are exactly `ExponentPushToken[...]` and `ExpoPushToken[...]`, bounded to 256 characters.
- Immediate `DeviceNotRegistered` and malformed-token outcomes clear only the exact token that failed.
- Network, timeout, `429`, and `5xx` outcomes retain the token for later recovery.
- Results distinguish `accepted`, `invalid_token`, and `provider_error` and carry retryability.
- A cleanup database failure is contained and reported as `tokenCleared: false`; it does not turn the provider result into false success.
- Optional push failure, including a thrown helper error after required email success, does not undo or misreport the email reminder.

Expo receipt polling is not added in Gate 5; the implementation governs immediate ticket responses only.

## Push-token ownership and mobile lifecycle

Gate 5 adopts ownership policy A: registering a valid token atomically removes it from any prior owner and assigns it to the currently authenticated user. A partial unique index on non-null `auth_users.push_token` is the database backstop. A concurrent ownership race returns a controlled `409`, not `500`.

The current data model remains one token per user. Registering a new device token replaces the user's previous value. The mobile client resolves the Expo project ID from `Constants.easConfig.projectId` with the configured Expo fallback, contains the whole registration sequence, and explicitly calls DELETE on `/api/push-token` before revoking the mobile session.

## Current-team and lifecycle integrity

Gate 4B team identity remains authoritative:

- reminder and response paths use `matches.home_team_id`/`away_team_id`, never current slot occupancy;
- both match participants must still be active for normal reminders;
- a withdrawn old team still assigned to a fixture blocks a normal reminder;
- when explicit replacement wins first, the reminder resolves the new team;
- when an old-team token exists first, replacement makes it unusable rather than transferring its history;
- a match start that wins first prevents issuance, and a token issued before start cannot be consumed after start.

No availability row is reassigned between old and replacement identities. Token consumption does not revalidate whether the team's captain has changed since issuance.

## Midday unconfirmed alerts

Midday processing locks and reloads the scheduled match and both current teams, then identifies unconfirmed current identities. Its deterministic key is `unconfirmed/{match_id}/{match_local_date}/{admin_id}`, where `match_local_date` is the raw database-driver value returned from `nova_planned_date`; application code does not explicitly normalize its representation. A partial unique index on notification `dedupe_key` prevents duplicate cron executions from flooding one administrator. Current team names are resolved under the match lock rather than taken from a stale candidate projection.

The in-app marker is committed before the external email attempt. This favors no-flood behavior; the lack of a durable email outbox is a documented P2. Morning reminder and midday candidate queries each stop at 100 rows without pagination or explicit truncation reporting.

## Notification read authorization

- List, mark-one, and mark-all operations require an authenticated user.
- Every read and update is scoped to that exact user ID.
- Mark-one for another user's ID returns safe `404` behavior.
- Mark-all changes only unread rows.
- Repetition does not overwrite the original `read_at` timestamp.

## Administration channel behavior

Captain-message email and push channels execute independently. The route returns a truthful channel summary and never exposes recipient addresses or push tokens. A thrown optional push helper error is contained rather than producing false all-channel failure or a server error after successful email.

## Transaction and lock boundaries

- Reminder claim: match → authoritative actor/team reads → availability row → claim commit → external providers.
- Reminder finalisation: match → availability row → in-app notification → metadata → commit.
- Availability POST: cheap token scope read → match → availability row → current league/participant-team revalidation (no captain re-resolution; see deferred item 4) → response plus notification → commit → external email.
- Replacement and match-start races therefore share the established match-first order and do not introduce the availability-first deadlock found during implementation testing.
- Same-day alert: match → current teams/responses → deduped notification commit → external email.
- Push ownership: one atomic database operation clears any prior owner and assigns the current owner; the unique index handles concurrent last-writer conflict safely.

## Authorization matrix

| Surface | Authority and scope |
| --- | --- |
| Availability preview/response | Possession of an exact valid token; POST additionally revalidates the current participant team, match/league lifecycle, schedule, and expiry, but not captain reassignment |
| Manual match reminder | Route admits `venue_admin` and `super_admin` only. Venue administrators are constrained to their venue; super administrators have platform-wide scope. `org_admin` is not admitted by this route. |
| Reminder/midday cron | Exact cron secret; unknown cron operation returns `400` |
| Notification list/read | Authenticated current user; row ownership enforced on every operation |
| Push-token POST/DELETE | Authenticated current user; affects that user's registration, with atomic reassignment policy for a submitted token |
| Captain message | Existing in-scope administrator authorization; captain identity re-resolved before delivery |
| Weather/round postponement | Existing in-scope administrator authorization and current recipient resolution |

## Migration `0010`

The migration begins with a finite lock timeout under the transaction supplied by the migration runner. Before changing schema it fails closed on:

- unsupported/null notification type;
- duplicate push-token ownership;
- unsupported availability response;
- inconsistent response/responded-at/token state;
- malformed or duplicate availability token;
- duplicate `(match_id, team_id)` availability identity;
- malformed time slot on a pending availability row.

It then:

- adds `expires_at`, `delivery_claim_id`, and `delivery_claimed_at` to availability;
- adds `dedupe_key` and, where absent, `read_at` to notifications;
- backfills only pending missing expiries from the canonical Johannesburg fixture start;
- replaces conflicting legacy availability/notification CHECK constraints with the Gate 5 vocabulary and state constraints, using `NOT VALID` followed by explicit validation;
- adds a nonnegative reminder-count constraint and claim-consistency constraint;
- adds unique partial indexes for pending tokens, notification dedupe keys, and push-token ownership;
- adds the live-claim lookup index.

No production migration was run. Existing migrations remain history.

## Migration rehearsals and adversarial fixtures

- Fresh isolated database `0001` → `0010`: passed; the ledger contains exactly 10 entries from `0001_initial.sql` through `0010_gate5_availability_notifications.sql`.
- Accepted production-shaped rehearsal `0001` → `0009` + Gate 5 facts + `0010`: passed with zero availability rows, one synthetic `unconfirmed_alert`, zero push tokens, production-like TIMESTAMPTZ `match_date`, five key validated constraints, and three key indexes.
- Unsupported notification vocabulary: rejected before migration.
- Duplicate push-token ownership: rejected before migration.
- Unsupported availability response vocabulary: rejected before migration.
- Inconsistent response/token state: rejected before migration.
- Duplicate availability match/team identity: rejected before migration.

These adversarial cases are part of Linux CI and cannot pass by silently deleting or repairing production data.

SHA-256 migration evidence at narrow-remediation handoff:

```text
0001 215BC2DAAACB335C1134A1B3EA4E5D0DB66FF6D35935D01E5EA6AFEA8479EEFC
0002 DCE1549D1CDF8593AB54076703EB2FDAE2DEA3D86ECA0648358B73F25043D44F
0003 BC7B1FC7BD6BD57C116C6A2C65DE615EACF707B289F549D1453E75C1184DE2DB
0004 39C1FF8988762135B39009595C19058B758D2815E1EA5BB4986CA25705AFC6D4
0005 6C865A1C1F0D45BD6C3CDAC13E4E9DAE95865F2507D79E1BBC3B1307965255CF
0006 DBD86BE897B9EC5ACACCB17A14349B158B8A347646B63D07B250B18E4693C1E1
0007 87802E593B4DDA16FED641342562E44D744B1FC72478E582AE9F4CA9655A26DC
0008 A8A06BAF6D2B8E62C54272473EC182586407B93D6D96056165B1140479E12C9C
0009 240367B2BB46DB71376876825CFA6A9222598F8208C5EB26CD2656D57FD02858
0010 21628D25AF6F5066FFD39347867B7C658B3AA43B34126A813AC7E3430C8D00BF
```

The `0001` and `0002` values were recorded from a CRLF Windows checkout; the committed (LF) blobs hash differently, but the files are unchanged and the `migrations/` tree hash quoted above is identical across all later commits.

## Concurrency proof

The Gate 5 integration suite uses independent PostgreSQL connections, blocker transactions, and observed lock waits. All required races A–J passed on the fresh DATE schema and the accepted production-shaped TIMESTAMPTZ schema:

1. A — concurrent availability `yes` versus `no`: one `200`, one `410`, one response and one notification.
2. B — cron versus cron: one required email and no stranded claim.
3. C — cron versus manual: one required email and no stranded claim.
4. D — manual versus manual: one required email when B starts before A finalization and when B starts after A's finalization transaction begins but before A's wall-clock `last_reminder_at` write (a request starting between that write and the commit is not covered); a genuinely later post-commit invocation remains allowed.
5. E — replacement queued first: reminder resolves and records the replacement identity.
6. F — `START_MATCH` queued first: reminder issuance is skipped.
7. G — response behind replacement: old-team availability is not transferred and the token returns `410`.
8. H — response behind match start: the token returns `410` without response mutation.
9. I — duplicate midday cron: one deduped administrator alert.
10. J — concurrent push-token assignment: one owner survives without `500`.

The availability oracle separately proves read-only GET, single-use POST, expiry, malformed/nonexistent tokens, lifecycle rejection, schedule-change rejection, and current participant-team identity. It does not prove captain-reassignment rejection because the implementation does not perform that check. The replacement/reminder oracle proves both permitted serial outcomes and rejects cross-team history attribution.

## Mutation-sensitive coverage

The narrow remediation explicitly injected and killed all requested mutations:

- M1 — generating the fallback key inside the retry loop caused two logical deliveries.
- M2 — omitting the header for an unkeyed call produced an undefined provider key.
- M3 — replacing an explicit key with a random key broke exact-key preservation.
- M4 — using one module-global fallback made independent invocations share a key.
- M5 — changing `clock_timestamp()` back to the transaction timestamp allowed the queued manual request to send.
- M6 — removing the overlap comparison allowed the queued manual request to send.
- M7 — moving finalization before required-email success failed the source-order contract; failed-email integration cases also assert count/time remain unchanged.
- M8 — rotating the claim after finalization failure changed the provider key on retry.

No requested high-value mutant survived. Broader unit/contract assertions and real PostgreSQL tests also fail if these protections are removed or weakened:

- GET read-only boundary and POST-only mutation;
- single-use response guard;
- token format and expiry validation;
- current participant-team and active lifecycle checks;
- delivery claim, overlapping manual-attempt guard, post-success metadata, and failure release;
- response vocabulary/state constraints;
- notification vocabulary constraint;
- push-token uniqueness and invalid-token cleanup;
- match-first lock ordering and replacement/start race revalidation;
- user-scoped notification reads.

No `.only`, `.skip`, `.todo`, or `passWithNoTests` marker is present under `src` or `tests`.

## Validation evidence

Final accepted evidence for the release candidate (the `ci.yml` steps replayed locally, in order, against a clean checkout with a clean `npm ci` on npm 10.9.10, using disposable PostgreSQL; P0 = 0, P1 = 0):

- Locked dependency install (`npm ci`): passed.
- Unit/contract suite: 22 files, 309/309 tests passed.
- Full DATE integration suite: 2 files, 184/184 tests passed.
- Focused Gate 5 DATE suite: 1 file, 34/34 tests passed.
- Focused Gate 5 production-shaped TIMESTAMPTZ suite: 1 file, 34/34 tests passed.
- Gate 2 route rehearsal on an isolated clone of the production-shaped database: 150/150 tests passed.
- Deterministic PostgreSQL concurrency A–J: pass on both shapes.
- Availability and lifecycle oracle: passed.
- Global email idempotency/provider matrix (`400`, `429`, `500`, accepted-then-timeout, accepted-then-network-reset, explicit and generated keys): passed.
- Duplicate-delivery route regressions for password reset, captain/admin message, and weather alert: passed.
- Claim-key crash-window/finalization recovery: passed with the exact same explicit key.
- Optional push structured-failure and thrown-error cases after email success: passed.
- Push-token validation, ownership race, and cleanup policy: passed.
- Notification authorization and idempotent `read_at`: passed.
- Email escaping and provider-boundary contracts: passed.
- Playwright: 21/21 passed (the 9 existing smoke tests plus 12 focused Accept Invite / Reset Password tests).
- ESLint: 0 errors.
- Next.js 16.4.5 production build: passed; only the pre-existing middleware-to-proxy deprecation warning remains.
- `npm audit --omit=dev --audit-level=high`: exit 0. Production findings: critical 0, high 0, moderate 5, low 0. The five moderate findings are in the unchanged Sentry dependency chain and are tracked in the deferred items below; they were not fixed by this work.
- `git diff --check`: passed.
- Migration ledger: exactly 10 entries (`0001`–`0010`) on both the fresh and the production-shaped rehearsal.
- Fail-closed Gate 5 migration fixtures: 5/5 rejected as intended.
- Migration immutability: `0001`–`0010` unchanged from the narrow-remediation start through the final release candidate; no `0011`.
- Secret/private-key scan: passed; no private keys or production credentials found.

## Final release notes — Next.js security update and auth-page compatibility

| Package | Previous | Final |
| --- | --- | --- |
| `next` | 16.3.8 | 16.4.5 |
| `eslint-config-next` | 16.3.8 | 16.4.5 |

- The update removes the Next.js advisories that affected 16.3.8 (image-optimizer and `use cache` remote code execution, and Server Actions denial of service: GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr, GHSA-p3m5-59mp-jv5r). Fixes begin at 16.4.1; 16.4.5 is the current stable release.
- Exactly one Next copy is installed and locked, and no Next 16.3.8 remains. `sharp` remains 0.35.5.
- `package-lock.json` was generated with npm 10.9.10 (the npm line that ships with GitHub's Node 22) and verified with a clean `npm ci`. Lock movement is limited to the `@next/*` 16.4.5 set, dev-only `eslint-plugin-react-hooks` 7.1.1 and `zod` 4.6.7, and bundled-dependency entries for the optional wasm32 package `@tailwindcss/oxide-wasm32-wasi`. The integrity of every changed entry matches the npm registry.
- `npm audit --omit=dev --audit-level=high` exits 0 (production: critical 0, high 0, moderate 5, low 0). The five moderate findings (`@sentry/nextjs`, `@sentry/bundler-plugins`, `@sentry/node`, `glob`, `minimatch`) are in the unchanged Sentry chain. Dev-only high advisories (`vite`, `js-yaml`, development copies of `brace-expansion`) remain outside the production audit gate; no untrusted-input exposure in CI or the build was identified.

### Auth-page compatibility

`eslint-config-next` 16.4.5 enables the stricter `react-hooks/set-state-in-effect` rule, so two client pages needed narrow changes (no lint-rule suppression):

- `src/app/account/accept-invite/page.jsx`
- `src/app/account/reset-password/page.jsx`

Both pages now derive the query token through `useSearchParams()` rather than synchronously copying URL state into React state from an effect:

- The validation result is stored together with the token it belongs to, so a result for one token is never treated as valid for another.
- A stale validation response cannot overwrite a newer token's state.
- Submit uses the token currently in the URL, and the form is shown only after that token has been validated.
- A missing or empty token renders the invalid-link state directly and does not call the validation endpoint.
- In production each page performs one read-only validation `GET` per page load.
- Both pages sit inside a `Suspense` boundary (Accept Invite already did; Reset Password gained one in place of its mount-state workaround), which Next 16.4.5 requires for `useSearchParams` on a static page. Both pages build as static pages.
- Accept Invite now URL-encodes the token when building its validation request, as Reset Password already did.
- Backend auth APIs and token semantics (expiry, single-use consumption, password rules) were unchanged; `src/app/api/**` is byte-identical across the range.
- Twelve focused Playwright tests in `tests/e2e/auth-pages.spec.js` (API mocked in the browser) cover missing, empty, valid, invalid/expired, and failed-request tokens, a rejected submit, token URL-encoding, the exact token submitted, request count, and the absence of hydration/Suspense console errors. They do not exercise in-page query-token switching (deferred item 16).

## Changed implementation files

- `.github/workflows/ci.yml`
- `migrations/0010_gate5_availability_notifications.sql`
- `mobile/src/utils/api.js`
- `mobile/src/utils/usePushNotifications.js`
- `src/__tests__/access-boundaries.test.js`
- `src/__tests__/gate5-availability-notifications.test.js`
- `src/__tests__/gate5-provider-boundaries.test.js`
- `src/__tests__/html-boundaries.test.js`
- `src/app/admin/captain-message/route.js`
- `src/app/api/auth/confirm-availability/handler.js`
- `src/app/api/auth/confirm-availability/route.js`
- `src/app/api/cron/match-reminders/handler.js`
- `src/app/api/cron/match-reminders/route.js`
- `src/app/api/leagues/postpone-round/route.js`
- `src/app/api/notifications/route.js`
- `src/app/api/push-token/route.js`
- `src/app/api/send-match-reminder/handler.js`
- `src/app/api/send-match-reminder/route.js`
- `src/app/api/utils/db.js`
- `src/app/api/utils/match-reminders.js`
- `src/app/api/utils/push-token-store.js`
- `src/app/api/utils/push-token.js`
- `src/app/api/utils/send-email.js`
- `src/app/api/utils/send-push.js`
- `src/app/api/weather/alert/route.js`
- `src/constants/notification-types.js`
- `tests/fixtures/gate5-production-facts.sql`
- `tests/integration/gate5-communications.test.js`

This report is a separate documentation-only handoff change.

### Narrow-remediation implementation diff

- `src/app/api/utils/send-email.js`
- `src/app/api/utils/match-reminders.js`
- `src/__tests__/gate5-availability-notifications.test.js`
- `src/__tests__/gate5-provider-boundaries.test.js`
- `src/__tests__/gate5-email-idempotency-routes.test.js`
- `tests/integration/gate5-communications.test.js`

No product route, dependency, package manifest, CI workflow, mobile source, or migration changed in the narrow-remediation implementation commit.

### Later release-candidate commits

- `08dc9b7` (CI harness isolation): `.github/workflows/ci.yml` only. The Gate 2 route suite now runs against a disposable clone of the production-shaped database so the Gate 5 facts fixture and fail-closed rehearsals inherit an intact database.
- `187f753` (Next 16.4.5 security update): `package.json` and `package-lock.json` only.
- `4b97b85` (auth compatibility): `src/app/account/accept-invite/page.jsx`, `src/app/account/reset-password/page.jsx`, and `tests/e2e/auth-pages.spec.js`.

No migration, backend route, Gate 5 communication source, or mobile source changed in these commits.

## Deferred P2 / known limitations

### P0 / P1

P0 = 0 and P1 = 0 for the accepted release candidate.

### P2 / explicitly deferred

1. Reusing a stale reminder claim also reuses its provider key. If the retry payload differs from the first attempt's (for example an automatic attempt later retried manually, which changes the subject and urgency label), a provider that enforces key/payload matching can reject the retry until the schedule rotates the claim or the key expires.
2. Morning reminder and midday-alert candidate queries have a silent hard cap of 100 and no pagination or truncation report.
3. Midday dedupe interpolates the raw driver-returned `match_local_date` rather than an explicitly formatted Johannesburg date.
4. Availability token consumption does not revalidate captain reassignment; the token remains bound to the current participant team, not the current captain.
5. Some malformed JSON/request-body paths can return `500` instead of a controlled client error.
6. Rescheduling does not immediately rotate a pending token; rotation happens on a later reminder. Previously responded rows suppress automatic reminder issuance, and prior confirmations survive rescheduling.
7. Administrator recipient and scope expansion, including any intentional `org_admin` access to manual reminders, remains a product-policy decision.
8. Expo receipt polling is not implemented; later receipt-time failures cannot trigger cleanup or operator feedback.
9. Availability tokens remain plaintext at rest. They have 256 bits of entropy, strict format, finite expiry, one-time consumption, current-state revalidation, and are never logged.
10. Push registration remains single-device v1 because `auth_users` stores one token per user.
11. No durable outbox exists for non-reminder external communications. Midday/admin/availability-follow-up failures are contained but not autonomously replayed.
12. No generic notification preferences or delivery ledger exists.
13. Push-token format is enforced by application validation, not a database CHECK.
14. Applying `0010` is not rollback-compatible with running the pre-Gate-5 application against that database shape.
15. Weather-alert and round-postponement routes contain normal structured push failures, but a theoretically throwing push helper is not isolated per recipient in every path.

Observations from the final Next 16.4.5 adversarial review (none is a P0 or P1):

16. The committed Playwright coverage for the two account pages does not exercise in-page query-token switching (the token changing while the page stays mounted). Independent adversarial probes verified the implementation for both orderings of overlapping validations, submission of the current token, and token removal; those probes are not part of the committed suite.
17. After an unusual same-page query-token change, some cosmetic client state can survive: an already-rendered success screen, typed password fields, or a previous submit error. Email links open as full page loads, and server-side token validation remains authoritative.
18. Reset Password emits two identical read-only validation `GET`s under development React StrictMode (it previously emitted one). Accept Invite emitted two both before and after the upgrade. Production emits one per page load.
19. Five moderate production dependency advisories remain in the unchanged Sentry chain (`@sentry/nextjs`, `@sentry/bundler-plugins`, `@sentry/node`, `glob`, `minimatch`), and dev-only high advisories (`vite`, `js-yaml`, development copies of `brace-expansion`) remain outside the production audit gate.
20. Historical reset-validation behavior is retained: if the validation endpoint were ever to return JSON without a `valid` field, Reset Password renders its form, as it did before the upgrade. The current server contract always returns a boolean, and the reset `POST` revalidates the token.
21. A provider `409 concurrent_idempotent_requests` response is not retried. Because every `sendEmail` call now carries a key, a retry that overlaps a still-processing earlier attempt can be reported as a failure even though the provider may deliver the email once; it cannot produce a duplicate delivery.

These items are not blockers for the implemented availability/reminder integrity gate, but should remain visible in adversarial review and future communications work.

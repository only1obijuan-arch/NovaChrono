# Gate 5 — Availability, Reminders, and Notification Reliability

## Release identity and safety

- Starting SHA: `0ac94c2ef8c282c25334c692d7a4f56612ce56cb`
- Working branch: `gate5/availability-notifications`
- Implementation SHA: `bd89aa17e7d8608460afff94406aee2df8c2cc79`
- New forward-only migration: `0010_gate5_availability_notifications.sql`
- Migrations `0001` through `0009` are byte-identical to the starting SHA.
- Work and database verification used isolated local PostgreSQL databases only. Production Neon was not connected to or changed. Nothing was pushed, merged, deployed, or applied to production.

## Outcome

Gate 5 makes the existing match-communications paths fail closed around current match/team identity, makes availability confirmation a single-use POST mutation, serializes reminder delivery claims, governs notification vocabulary, and gives email/push failures explicit behavior. It does not introduce a generic messaging framework.

No known P1 issue remains in the implemented scope. The deliberately deferred P2 items are recorded below.

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
6. `POST` accepts only a well-formed token and `yes`/`no`, locks the authoritative match before the availability row, and revalidates the exact current team, captain, league/match lifecycle, canonical schedule, and expiry.
7. The winning POST stores the response and `responded_at`, clears the token, and creates the scoped in-app notification in one transaction. A repeated or racing POST fails safely with `410`.
8. The administrator email is attempted after commit, so a provider problem cannot roll back or falsely repeat the captain's accepted response.

Tokens are never put in logs. They remain plaintext at rest in v1; the residual risk and mitigations are recorded under P2.

## GET versus POST semantics

- GET is read-only preview, including crawler GETs and query strings that contain a proposed response.
- The preview submits an HTML POST form. No mutation is triggered by image prefetching, link scanners, email security crawlers, or browser navigation.
- POST is the only state-changing method and is guarded by row locks plus `response IS NULL`, an unexpired token, and authoritative state revalidation.
- Malformed, missing, nonexistent, expired, consumed, rescheduled, started, finalised, cancelled, inactive-team, replaced-team, and wrong-captain opportunities fail closed without mutation.

## Expiry and timezone semantics

The canonical expiry is the fixture's Johannesburg scheduled start:

```sql
(nova_planned_date(match_date) + time_slot::time)
  AT TIME ZONE 'Africa/Johannesburg'
```

`nova_planned_date` is used so both historical DATE environments and the accepted production TIMESTAMPTZ shape preserve the intended calendar date. Automatic morning selection uses Johannesburg local current date and fixtures one to three local days ahead. Same-day alert dedupe keys also use the Johannesburg local fixture date. Invalid time-slot text prevents token issuance.

## Reminder claim and retry design

The shared reminder service implements this sequence:

1. lock the match;
2. reload any authenticated manual actor and enforce venue/organization/platform scope;
3. validate active league, scheduled/unstarted match, exact current side/team identity, both active participants, captain, email, and canonical schedule;
4. lock the exact availability row;
5. reject an existing response, automatic cadence inside 20 hours, or another live claim;
6. set a UUID claim and timestamp and issue/rotate token plus expiry;
7. commit;
8. send required email with Resend idempotency key `match-reminder/{claim_id}`;
9. attempt optional push independently;
10. lock match then availability again, insert the deduped in-app notification, increment `reminder_count`, set `last_reminder_at`, and clear the same claim.

A claim is stale after 15 minutes. A required-email failure does not change reminder count or last-reminder time; it clears only the live timestamp so a retry is immediately possible. When the schedule is unchanged, that retry retains the claim UUID and provider idempotency key. The service never reports a failed required email as sent.

Automatic sends retain the established 20-hour cadence. For manual/manual overlap, the service also records when each request began: if another attempt completes while a queued manual request waits, `last_reminder_at >= attempt_started_at` suppresses the overlapping delivery. A genuinely later manual action remains permitted.

## Failure and provider semantics

### Email

- Existing Resend HTTP integration is preserved.
- Configuration, recipient, subject, and content are validated before I/O.
- Each request has a 10-second timeout and at most three attempts.
- Network failures, `429`, and `5xx` are retryable; other provider `4xx` responses are not retried.
- Non-2xx responses never claim success.
- Success returns the provider delivery ID.
- Errors exposed to callers are sanitized and bearer credentials are never logged.
- Idempotency keys are validated and bounded to 256 characters.

The provider-failure matrix covers `400`, `429`, `500`, timeout, and network failure. Every failed required reminder preserves retry eligibility.

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

No availability row is reassigned between old and replacement identities.

## Midday unconfirmed alerts

Midday processing locks and reloads the scheduled match and both current teams, then identifies unconfirmed current identities. Its deterministic key is `unconfirmed/{match_id}/{Johannesburg-date}/{admin_id}`. A partial unique index on notification `dedupe_key` prevents duplicate cron executions from flooding one administrator. Current team names are resolved under the match lock rather than taken from a stale candidate projection.

The in-app marker is committed before the external email attempt. This favors no-flood behavior; the lack of a durable email outbox is a documented P2.

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
- Availability POST: cheap token scope read → match → availability row → current league/team/captain revalidation → response plus notification → commit → external email.
- Replacement and match-start races therefore share the established match-first order and do not introduce the availability-first deadlock found during implementation testing.
- Same-day alert: match → current teams/responses → deduped notification commit → external email.
- Push ownership: one atomic database operation clears any prior owner and assigns the current owner; the unique index handles concurrent last-writer conflict safely.

## Authorization matrix

| Surface | Authority and scope |
| --- | --- |
| Availability preview/response | Possession of an exact valid token; POST additionally revalidates the current captain/team/match/league and expiry |
| Manual match reminder | Authenticated venue, organization, or platform administrator with authoritative database scope for the fixture venue |
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

## Concurrency proof

The Gate 5 integration suite uses independent PostgreSQL connections, blocker transactions, and observed lock waits. All required races A–J passed on the fresh DATE schema and the accepted production-shaped TIMESTAMPTZ schema:

1. A — concurrent availability `yes` versus `no`: one `200`, one `410`, one response and one notification.
2. B — cron versus cron: one required email and no stranded claim.
3. C — cron versus manual: one required email and no stranded claim.
4. D — manual versus manual: one required email, including the fast-finalisation overlap case.
5. E — replacement queued first: reminder resolves and records the replacement identity.
6. F — `START_MATCH` queued first: reminder issuance is skipped.
7. G — response behind replacement: old-team availability is not transferred and the token returns `410`.
8. H — response behind match start: the token returns `410` without response mutation.
9. I — duplicate midday cron: one deduped administrator alert.
10. J — concurrent push-token assignment: one owner survives without `500`.

The availability oracle separately proves read-only GET, single-use POST, expiry, malformed/nonexistent tokens, lifecycle rejection, schedule-change rejection, and current captain/team identity. The replacement/reminder oracle proves both permitted serial outcomes and rejects cross-team history attribution.

## Mutation-sensitive coverage

Unit/contract assertions and real PostgreSQL tests fail if the following protections are removed or weakened:

- GET read-only boundary and POST-only mutation;
- single-use response guard;
- token format and expiry validation;
- current-team/current-captain and active lifecycle checks;
- delivery claim, overlapping manual-attempt guard, post-success metadata, and failure release;
- response vocabulary/state constraints;
- notification vocabulary constraint;
- push-token uniqueness and invalid-token cleanup;
- match-first lock ordering and replacement/start race revalidation;
- user-scoped notification reads.

No `.only`, `.skip`, `.todo`, or `passWithNoTests` marker is present under `src` or `tests`.

## Validation evidence

- Locked dependency install: passed.
- Unit/contract suite: 74 files, 298/298 tests passed.
- Full DATE integration suite: 16 files, 181/181 tests passed.
- Focused Gate 5 DATE suite: 31/31 tests passed.
- Focused Gate 5 production-shaped TIMESTAMPTZ suite: 31/31 tests passed.
- Deterministic PostgreSQL concurrency A–J: 10/10 passed on both shapes.
- Availability and lifecycle oracle: passed.
- Email failure/retry matrix (`400`, `429`, `500`, timeout, network): passed.
- Optional push structured-failure and thrown-error cases after email success: passed.
- Push-token validation, ownership race, and cleanup policy: passed.
- Notification authorization and idempotent `read_at`: passed.
- Email escaping and provider-boundary contracts: passed.
- Playwright: 9/9 passed.
- ESLint: passed.
- Next.js production build: passed; only the pre-existing middleware-to-proxy deprecation warning remains.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
- `git diff --check`: passed (Windows line-ending notices only).
- Historical migration immutability: `0001`–`0009` unchanged.
- Secret/private-key scan: no private keys or production credentials. Matches were limited to documented placeholders and localhost test URLs in `.env.example`, CI, and Playwright configuration.

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

## Remaining P1, P2, and deferred work

### P1

None known in the accepted Gate 5 scope.

### P2 / explicitly deferred

1. **Availability tokens are plaintext at rest.** They have 256 bits of entropy, strict format, finite fixture-start expiry, one-time consumption, current-state revalidation, and are never logged. A future token-digest migration would reduce database-read exposure.
2. **Expo receipt polling is not implemented.** Immediate Expo ticket errors are governed, but later receipt-time failures cannot yet trigger cleanup or operator feedback.
3. **Push registration is single-device v1.** The `auth_users` model stores one token per user; a separate device table is required for intentional multi-device delivery.
4. **No durable outbox exists for non-reminder external communications.** Midday/admin/availability follow-up email failures are truthful and contained, but are not autonomously replayed. Midday dedupe intentionally favors no-flood behavior.
5. **No generic user notification preferences or delivery ledger were added.** Those are outside the narrow Gate 5 objective and should be designed separately if product requirements demand them.

These items are not blockers for the implemented availability/reminder integrity gate, but should remain visible in adversarial review and future communications work.

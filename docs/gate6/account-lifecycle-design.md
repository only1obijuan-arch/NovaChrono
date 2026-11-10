# Gate 6A account lifecycle design

- Status: **PROPOSAL — OWNER/LEGAL APPROVAL REQUIRED BEFORE IMPLEMENTATION**
- Baseline reviewed: `7f83463fca7ab5215492c5506eada1c5fcaffa4b`
- Prepared: 2026-11-10

No deletion endpoint, irreversible anonymisation, or migration is implemented by this document. It is the Gate 6A.2 approval checkpoint.

## Design goals and non-negotiable invariants

- Give an authenticated person a clear way to request deletion of their account and associated personal information.
- Revoke web and mobile access safely and prevent a deleted identity from being recreated accidentally through a concurrent request.
- Preserve match results, match events, standings, league-slot identity, team history, audit integrity, and all accepted Gate 1–5 behaviour.
- Never transfer historical sporting acts to a different person. A successor may assume future responsibility, but does not become the historical captain, referee, or actor.
- Remove or irreversibly anonymise personal information unless an approved operational or legal reason requires retention.
- Make retries deterministic and safe.

## A. Data relationship matrix

The matrix is based on migrations `0001`–`0010`, `schema.sql` as a reference snapshot, and current route usage. A production read-only catalogue check remains mandatory before any migration because the accepted audit identified legacy drift, including a dormant `auth_sessions` table. `join_requests` is named in the programme brief but is absent from the accepted migration and source inventory; its production existence and columns must be checked explicitly.

| Table or store | Account relationship and personal information | Current FK/delete behaviour | Historical requirement | Proposed lifecycle handling | Idempotency/concurrency and schema impact | Unresolved decision |
|---|---|---|---|---|---|---|
| `auth_users` | Primary identity: name, email, verification state, role, venue/organisation scope, referee field, image, push token, timestamps | Primary row; several restrictive FKs; `sessions_valid_after` revokes sessions | Stable UUID is referenced by sporting and audit history | Retain an anonymised tombstone after completion; erase name/email/image/push token and operational scope; prevent authentication | Lock row `FOR UPDATE`; additive status/timestamps likely required | Whether historical screens may show a retained display label or only “Deleted user” |
| `auth_accounts` | Password hash and any provider tokens | `userId` cascades only if user row is deleted | None after access ends | Delete all rows during completion | Transactional delete; no new FK needed | Confirm credentials provider is still the only active provider |
| Auth.js JWT cookie | Signed web session contains account ID and live claims | No authoritative DB session row; `sessions_valid_after` is checked on each JWT refresh | None | Advance session boundary before any other lifecycle work; clear local cookie in UI | Existing epoch mechanism; status must also fail closed after migration | Whether request confirmation immediately signs the user out |
| Legacy `auth_sessions` | Dormant adapter sessions may contain user ID and session token | Not in `0001`–`0010`; production preflight described it as legacy text/no FK | None | If present and structurally compatible, delete rows for the account; do not make it authoritative | Migration/handler must use catalogue-gated SQL or an operator precondition | Confirm live row count and exact columns before implementation |
| `mobile_sessions` | Revocable JTI mapped to user | `ON DELETE CASCADE` | None | Delete all account JTIs when request is confirmed | Existing transactional revocation; repeated deletes are safe | None |
| `auth_verification_token` | Hashed token plus email identifier; no user FK | No cascade | None | Delete entries whose canonical identifier matches the account email before anonymising | Capture canonical email under lock; delete in same transaction | Retention for security investigation, if any |
| `password_reset_tokens` | Hashed token and account ID | `ON DELETE CASCADE` | None | Delete during request confirmation | Transactional and idempotent | None |
| `invite_tokens` | Invitee email plus `invited_by` account attribution | `invited_by` is restrictive and non-null | Used invitations may be legitimate admin history; pending invitations are operational authority | Revoke unused/unexpired invitations issued by the departing admin; retain used/expired records only if approved, pointing to the same anonymised actor UUID; assess invitee-email retention separately | Lock or update matching rows in the lifecycle transaction; no reassignment | Retention period for used/expired invitations and whether invitee email must be redacted |
| `teams.captain_user_id` | Ownership/responsibility link; captain name/email is joined from `auth_users` | Nullable restrictive FK | Team identity, fixtures, results, slots, and standings must remain unchanged | Active team: require approved successor or admin custody before completion. Inactive/historical team: keep same user UUID pointing to anonymised tombstone | Lock all account teams in stable order; succession update applies only to active operational ownership and must be separately audited | Who may select/approve a successor; fallback admin-custody policy |
| `matches.referee_id` | Referee assignment and historical attribution | Nullable restrictive FK | Completed match attribution must not be reassigned or erased silently | Upcoming/live assignment: require reassignment or explicit unassignment by authorised admin. Final/cancelled historical match: retain same UUID pointing to tombstone | Lock affected matches; scheduling conflicts must be revalidated for successor | Whether referee display name may be retained for completed matches |
| `audit_logs.action_by` | Actor UUID; JSON old/new values and reason may also contain personal information | Non-null restrictive FK | Security and sporting audit chain should remain attributable to a stable pseudonymous actor | Keep actor UUID to tombstone; prohibit PII in the lifecycle completion event; run targeted review/redaction of PII inside JSON rather than deleting audit events | Existing FK requires tombstone; add one minimal completion event in same transaction | Approved audit retention period and fields allowed to remain |
| `notifications` | User-owned messages, match reference, read state | `ON DELETE CASCADE`, but tombstone means no automatic delete | No sporting truth depends on the inbox copy | Delete user notifications on completion unless a legal reason is approved | Explicit transactional delete; repeated delete safe | Notification/log retention period |
| `auth_rate_limits` | Canonical email identifier and login-attempt metadata | No user FK | Short-lived abuse evidence only | Remove canonical email row on completion after approved security retention window | Exact-key delete; cleanup cron already handles expiry | Security retention window |
| `api_rate_limits` | Keys may include canonical email or trusted IP | No user FK | Short-lived abuse evidence only | Let normal expiry cleanup remove active windows; targeted deletion is impractical without approved key mapping | No migration required; avoid creating a new durable identifier | Security retention window and whether IPs are personal information in policy |
| `players` | Player name/number, linked to team rather than account | No account FK | Roster and goal history may be sporting records; player may be a different data subject | Do not alter automatically when a captain deletes their own account; provide a separate player-data request process | No lifecycle mutation | Whether players include minors and who can exercise their rights |
| `match_events` | Player/team/match attribution, timestamps | No account FK | Core sporting history | Preserve unchanged | No lifecycle mutation | Player-name retention policy is separate |
| `availability_responses` | Team/match response, hashed one-click token, delivery metadata | No account FK | Operational history may support fixture administration | Preserve response facts; expire/clear unused token according to existing flow and approved retention | No account-specific mutation unless a direct identifier is discovered | Retention period |
| `organizations`, `venues` | Organisation/venue names, location and coordinates; account scope is indirect | No ownership FK to user | Operational structure must remain | Preserve; remove only the departing user’s scope fields on tombstone | Must verify another administrator exists before privileged user completion | Minimum admin coverage per organisation/venue |
| `leagues`, `league_slots`, `standings` | Competition and historical identity | No direct account FK | Core sporting truth | Preserve unchanged | Protected invariant tests required | None |
| External email/push/error processors | Recipient email, push token/message, diagnostics may exist outside PostgreSQL | Provider-specific | Usually no sporting requirement | Define deletion/retention request procedures with each approved processor; remove device token immediately | Operational runbook, not migration | Processor contracts, regions, and retention terms |
| Possible production `join_requests` | Unknown until catalogue verification | Absent from accepted source/migrations | Unknown | Block implementation until read-only schema inspection resolves it | May change migration design | Exact live schema and retention purpose |

## B. Proposed lifecycle model

The smallest model that meets the current requirements is:

1. **Active** — current behaviour.
2. **Pending deletion** — a confirmed request has revoked sessions and frozen ordinary access while succession, retention, and legal checks are completed.
3. **Anonymised** — credentials and directly identifying fields are removed; the stable UUID remains only where required for sporting/audit integrity.

No general “suspended” state is proposed in Gate 6A because no disciplinary or support requirement has been approved. Administrative suspension should be designed separately if needed.

The recommended terminal state is anonymisation rather than physical deletion because restrictive FKs deliberately protect captain, referee, invitation, and audit attribution. Physical deletion is appropriate only for an account with no retained relationships and after the same policy checks; it must not be the default shortcut.

## C. Role-specific handling

### Captain

- A captain with an active team cannot complete anonymisation until future responsibility has been transferred to a verified successor or explicitly accepted by an authorised venue/platform administrator.
- Transfer changes only active operational ownership. Historical matches, events, standings, prior team identity, and audit events remain untouched.
- Pending invitations and availability actions must be resolved or reassigned before completion.
- Inactive/historical team rows continue to reference the same anonymised UUID unless owner/legal approves a different non-destructive presentation model.

### Referee

- Scheduled or live assignments must be reassigned or explicitly unassigned by an authorised administrator using existing scheduling-conflict rules.
- Final or cancelled matches keep the original referee UUID. They are never reassigned to the successor.
- Whether the historical UI shows a retained referee label or “Deleted referee” requires privacy/legal approval.

### Venue and organisation administrator

- Completion is blocked until every affected scope has another active authorised administrator or an approved super-admin custody path.
- Unused invitations issued by the departing admin are revoked.
- Used invitation and audit attribution remains attached to the anonymised UUID if retained under the approved policy.

### Super administrator

- The final active super administrator cannot request completion.
- A row lock plus a transaction-scoped count of other active super administrators must prevent concurrent requests from eliminating all platform administration.
- Succession must be completed and verified before anonymisation.

### Multiple responsibilities

All blockers are accumulated and returned together; the system must not partially transfer one responsibility and then fail on another. One transaction locks the user and all affected responsibility rows in deterministic order.

## D. Privacy lifecycle

1. User opens Account settings on web or mobile and selects “Delete account”.
2. The UI explains what will be deleted, what may be retained, active-responsibility blockers, expected timing, and the external request route.
3. User confirms intent and re-enters their password. The server performs Argon2 verification; a normal authenticated session alone is insufficient.
4. Web cookie requests must pass an Origin/Host CSRF check in addition to Auth.js SameSite protections. Mobile requests require a valid live bearer session plus the same recent credential confirmation.
5. The server locks the user, rechecks live status/role/responsibilities, advances `sessions_valid_after`, deletes mobile sessions and reset/verification credentials, and records a pending request. Ordinary auth immediately fails closed.
6. If blockers exist, the response returns a stable request ID and a complete, non-sensitive list of required handovers. No sporting row is changed automatically.
7. Once approved blockers and retention decisions are satisfied, one transaction deletes credentials, notifications and approved transient data; anonymises direct identity fields; preserves approved tombstone references; and writes one minimal `ACCOUNT_ANONYMIZED` audit event without name/email.
8. Repeating a pending or completed request returns the existing state. It never creates duplicate events or repeats a transfer.
9. The user receives a generic on-screen and email confirmation if an email channel is still permitted at that stage. The completion record must not contain the former email address.

Concurrent API operations must re-read an active account row and authorised role inside their own transaction before committing. Adding a status without enforcing it in `resolveCurrentUser`, Auth.js credential authorisation/JWT refresh, mobile sign-in, mobile refresh, and relevant long-running mutations would be incomplete.

## E. Migration assessment

An additive migration is likely required. Proposed filename after approval:

`0011_gate6a_account_lifecycle.sql`

Provisional contents:

- Add `auth_users.account_status` with only `active`, `pending_deletion`, and `anonymised`; default existing rows to `active`; validate before setting `NOT NULL`.
- Add nullable `deletion_requested_at` and `anonymised_at` timestamps with a consistency constraint.
- Add an index supporting active-role coverage checks.
- Optionally add a small deletion-request table only if the owner requires workflow metadata that cannot safely fit on `auth_users`; do not add it merely for architectural symmetry.
- Add no cascade or reassignment to teams, matches, audit logs, leagues, slots, standings, or events.
- Include preconditions for unknown production tables/FKs, especially `auth_sessions` and `join_requests`.

No migration file has been created. Before authorisation, a read-only production catalogue report must enumerate every FK to `auth_users`, relevant columns, counts by responsibility, status of `auth_sessions`, and existence/schema of `join_requests`.

## Approval decisions required

1. Approve anonymised tombstones as the default terminal model.
2. Decide whether historical captain/referee display names may be retained, separately from login identity.
3. Define who selects and approves captain, referee, venue-admin, and organisation-admin successors.
4. Define the final-super-admin succession procedure.
5. Approve retention periods for audit logs, invitations, notifications, rate-limit records, and provider copies.
6. Decide whether a pending request immediately blocks all access and whether a cancellation/grace period exists.
7. Confirm how player data and possible minors are handled.
8. Confirm the responsible party, Information Officer/privacy contact, identity-verification method, and request-completion service level.
9. Approve a read-only production catalogue check and, later, migration `0011` design before implementation.

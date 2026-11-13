# Gate 6A account lifecycle design

- Status: **OWNER-APPROVED DESIGN. ENGINEERING ACCEPTED LOCALLY AT `68c964c` (DRAFT PR #11, UNMERGED). NOT APPLIED TO ANY HOSTED DATABASE, NOT DEPLOYED, LIFECYCLE FLAGS DISABLED. PRODUCTION ACTIVATION NOT AUTHORISED.**
- Baseline reviewed: `7f83463fca7ab5215492c5506eada1c5fcaffa4b`
- Prepared: 2026-11-10; reconciled with the accepted implementation on 2026-11-12 (Gate 6A closure slice S0)

Owner decisions `6A-D01` through `6A-D09` were approved on 2026-11-10. Applying the migration, de-identifying real data, publishing policies, pushing, merging and deployment remain outside this approval.

## How to read this document

Each behaviour statement belongs to one of four classes. Where a section mixes them, the class is stated in brackets at the start of the statement.

| Class | Meaning |
|---|---|
| **Implemented** | Present in the accepted engineering at `68c964c` and covered by automated tests. It is code on a draft pull request, not behaviour in any hosted environment. |
| **Approved policy** | An owner decision (`6A-D01`-`6A-D09`) that the implementation follows or must follow. |
| **Proposed** | A design or policy suggestion that is NOT approved and NOT implemented. Anything tagged with a `6A-Q` number in the decision register at the end of this document is proposed or undecided. |
| **Future** | Work deliberately outside Gate 6A.2, owned by a later slice or gate. |

**Terminology.** *De-identified* (the state `deidentified`) means direct identifiers have been removed or replaced on the account row and the credentials deleted, while the stable user UUID is kept for sporting and audit integrity. It is **not** a claim of anonymisation: audit content (including free-text reasons), retained rows in other tables, processor copies and backups can still relate to the person. This document and the privacy readiness assessment therefore never describe the result as "anonymised" or "pseudonymised" as a legal conclusion, and do not claim POPIA compliance.

## Acceptance record

- Accepted engineering: commit `68c964c0921f08c84f94c2b69b5820fcf1a77404`, the head of draft pull request #11, not merged. Independent technical review: no P0, P1 or P2 findings.
- Canonical CI: GitHub Actions run `43207282894`, **attempt 2**, PASS on PostgreSQL 17.11 (Gate 2 167, Gate 5 34, Gate 6A 151, unit 374, integration 352, Playwright 33, lint, build, production dependency audit, secret scan). Attempt 1 of the same run failed on a pre-existing non-deterministic Gate 4A test unrelated to the lifecycle (runbook section 11, item TD-1); attempt 2 is a retry of the identical commit, not a fix.
- **Not done:** migration `0011` has not been applied to any hosted database; nothing is deployed; both lifecycle flags were recorded as unset in every hosted environment when last checked on 2026-11-12 (not re-verified since; re-check before any release); completion has not been enabled; no privacy policy or terms have been published; no restored-production-copy rehearsal, recovery point, device test of the mobile screens or hosted Host-header verification has been done. Accepted engineering is therefore *not* production activation.

## Design goals and non-negotiable invariants

- Give an authenticated person a clear way to request deletion of their account and associated personal information.
- Revoke web and mobile access safely and prevent a deleted identity from being recreated accidentally through a concurrent request.
- Preserve match results, match events, standings, league-slot identity, team history, audit integrity, and all accepted Gate 1–5 behaviour.
- Never transfer historical sporting acts to a different person. A successor may assume future responsibility, but does not become the historical captain, referee, or actor.
- Remove or de-identify personal information unless an approved operational or legal reason requires retention.
- Make retries deterministic and safe.

## A. Data relationship matrix

*Class: the matrix itself is analysis; the "proposed lifecycle handling" column states what the accepted engineering **implements** unless a cell says Proposed, Future or "Open".*

The matrix is based on migrations `0001`–`0010`, `schema.sql` as a reference snapshot, current route usage, a schema-only evidence file of the production database dated 7 October 2026, and the approved read-only production catalogue inspection of 10 November 2026. Both pre-date the Gate 5 migration (`0010`) being applied, so a fresh production read-only catalogue check remains mandatory before any migration (runbook section 1). Production-only objects exist that no migration or source file creates or uses: a dormant `auth_sessions` table, a `players.user_id` column, and a `join_requests` table. The lifecycle handles the first at run time and does not touch the other two (see their rows); a prepared, unexecuted census query set is in [`readonly-catalogue-census.sql`](readonly-catalogue-census.sql).

| Table or store | Account relationship and personal information | Current FK/delete behaviour | Historical requirement | Proposed lifecycle handling | Idempotency/concurrency and schema impact | Unresolved decision |
|---|---|---|---|---|---|---|
| `auth_users` | Primary identity: name, email, verification state, role, venue/organisation scope, referee field, image, push token, timestamps | Primary row; several restrictive FKs; `sessions_valid_after` revokes sessions | Stable UUID is referenced by sporting and audit history | Retain a deidentified tombstone after completion; replace direct identity with a generic role label and reserved non-deliverable email; clear image/push token and operational scope; prevent authentication | Lock row `FOR UPDATE`; additive status/timestamps required | Exact legal classification and retention periods remain under review |
| `auth_accounts` | Password hash and any provider tokens | `userId` cascades only if user row is deleted | None after access ends | Delete all rows during completion | Transactional delete; no new FK needed | Confirm credentials provider is still the only active provider |
| Auth.js JWT cookie | Signed web session contains account ID and live claims | No authoritative DB session row; `sessions_valid_after` is checked on each JWT refresh | None | Advance session boundary before any other lifecycle work; clear local cookie in UI | Existing epoch mechanism; status must also fail closed after migration | Whether request confirmation immediately signs the user out |
| Legacy `auth_sessions` | Dormant adapter sessions may contain user ID and session token | Not in `0001`–`0010`; production preflight described it as legacy text/no FK | None | Delete rows for the account if a table of that name exists, and do not make it authoritative. The service checks only that the table exists, not its columns: a table without a `"userId"` column would make the delete fail and roll the whole transaction back (fail-closed, but not tolerant of a different shape) | Migration/handler must use catalogue-gated SQL or an operator precondition | Confirm live row count and exact columns before implementation |
| `mobile_sessions` | Revocable JTI mapped to user | `ON DELETE CASCADE` | None | Delete all account JTIs when request is confirmed | Existing transactional revocation; repeated deletes are safe | None |
| `auth_verification_token` | Hashed token plus email identifier; no user FK | No cascade | None | Delete entries whose canonical identifier matches the account email before de-identifying | Capture canonical email under lock; delete in same transaction | Retention for security investigation, if any |
| `password_reset_tokens` | Hashed token and account ID | `ON DELETE CASCADE` | None | Delete during request confirmation | Transactional and idempotent | None |
| `invite_tokens` | Invitee email plus `invited_by` account attribution | `invited_by` is restrictive and non-null | Used invitations may be legitimate admin history; pending invitations are operational authority | Revoke unused/unexpired invitations issued by the departing admin; retain used/expired records only if approved, pointing to the same deidentified actor UUID; assess invitee-email retention separately | Lock or update matching rows in the lifecycle transaction; no reassignment | Retention period for used/expired invitations and whether invitee email must be redacted |
| `teams.captain_user_id` | Ownership/responsibility link; captain name/email is joined from `auth_users` | Nullable restrictive FK | Team identity, fixtures, results, slots, and standings must remain unchanged | Active team: require approved successor or admin custody before completion. Inactive/historical team: keep same user UUID pointing to a deidentified tombstone | Lock all account teams in stable order; succession update applies only to active operational ownership and must be separately audited | Who may select/approve a successor; fallback admin-custody policy |
| `matches.referee_id` | Referee assignment and historical attribution | Nullable restrictive FK | Completed match attribution must not be reassigned or erased silently | Upcoming/live assignment: require reassignment or explicit unassignment by authorised admin. Final/cancelled historical match: retain same UUID pointing to tombstone | Lock affected matches; scheduling conflicts must be revalidated for successor | Whether referee display name may be retained for completed matches |
| `audit_logs.action_by` | Actor UUID; JSON old/new values and reason may also contain personal information | Non-null restrictive FK | Security and sporting audit chain should remain attributable to a stable pseudonymous actor | **Implemented:** the actor UUID stays pointing to the tombstone and the lifecycle events (`ACCOUNT_DELETION_REQUESTED`, `ACCOUNT_DEIDENTIFIED`, succession, cancellation) carry only UUIDs, status values and the administrator's free-text reason, never a name or email. **Open:** review and redaction of personal data already inside historical audit JSON and free-text reasons (`6A-Q06`); nothing is redacted or deleted today | Existing FK requires tombstone; one minimal completion event is written in the same transaction | Approved audit retention period and fields allowed to remain (`6A-Q06`, `6A-Q07`) |
| `notifications` | User-owned messages, match reference, read state | `ON DELETE CASCADE`, but tombstone means no automatic delete | No sporting truth depends on the inbox copy | Delete user notifications on completion unless a legal reason is approved | Explicit transactional delete; repeated delete safe | Notification/log retention period |
| `auth_rate_limits` | Canonical email identifier and login-attempt metadata | No user FK | Short-lived abuse evidence only | Remove canonical email row on completion after approved security retention window | Exact-key delete; cleanup cron already handles expiry | Security retention window |
| `api_rate_limits` | Keys may include canonical email or trusted IP | No user FK | Short-lived abuse evidence only | Let normal expiry cleanup remove active windows; targeted deletion is impractical without approved key mapping | No migration required; avoid creating a new durable identifier | Security retention window and whether IPs are personal information in policy |
| `players` | Player name/number, linked to team rather than account. Production-only `players.user_id` (text, no FK, never read or written by the application) can link a player row to an account | `team_id` FK (cascade); `user_id` unconstrained; `match_events.player_id` is `ON DELETE SET NULL`, so deleting a player row would change event attribution | Roster and goal history may be sporting records; player may be a different data subject | **Implemented:** completion does not touch `players` (neither `name` nor `user_id`), so a de-identified account's UUID may remain in `players.user_id` beside a retained name. Approved policy (`6A-D07`): player and possible-minor data stay outside captain account deletion. **Open:** what happens to the link and the name (`6A-Q03`) | No lifecycle mutation | Whether players include minors and who can exercise their rights; treatment of `user_id` and `name` on de-identification (`6A-Q03`) |
| `match_events` | Player/team/match attribution, timestamps | No account FK | Core sporting history | Preserve unchanged | No lifecycle mutation | Player-name retention policy is separate |
| `availability_responses` | Team/match response, hashed one-click token, delivery metadata | No account FK | Operational history may support fixture administration | Preserve response facts; expire/clear unused token according to existing flow and approved retention | No account-specific mutation unless a direct identifier is discovered | Retention period |
| `organizations`, `venues` | Organisation/venue names, location and coordinates; account scope is indirect | No ownership FK to user | Operational structure must remain | Preserve; remove only the departing user’s scope fields on tombstone | Must verify another administrator exists before privileged user completion | Minimum admin coverage per organisation/venue |
| `leagues`, `league_slots`, `standings` | Competition and historical identity | No direct account FK | Core sporting truth | Preserve unchanged | Protected invariant tests required | None |
| External email/push/error processors | Recipient email, push token/message, diagnostics may exist outside PostgreSQL | Provider-specific | Usually no sporting requirement | Define deletion/retention request procedures with each approved processor; remove device token immediately | Operational runbook, not migration | Processor contracts, regions, and retention terms |
| Production-only `join_requests` | Per the 7 October schema evidence: `league_id` (FK, cascade), `team_name`, `captain_name`, `captain_email`, `captain_phone`, `status`, `created_at`. Direct personal data with no account FK. The 10 November inspection confirmed personal fields without an account FK | Absent from accepted source and migrations; the application never reads or writes it | Purpose and retention unknown; likely legacy | **Implemented:** completion does not touch it, so a de-identified captain's name, email address and phone number can remain here. **Open:** redact or delete by matching email, retire the table, or document and retain (`6A-Q04`). Requires a fresh catalogue check of the live columns first | None | Purpose, retention and handling (`6A-Q04`); live schema re-verification |

## B. Lifecycle model

*Class: **Approved policy** (`6A-D01`, `6A-D06`) and **Implemented**.*

The smallest model that meets the current requirements, as implemented by migration `0011` and the lifecycle service:

1. **Active** — current behaviour.
2. **Pending deletion** — a confirmed request has revoked sessions and frozen ordinary access while succession, retention, and legal checks are completed.
3. **Deidentified** - credentials and directly identifying fields are removed; the stable UUID remains where required for sporting/audit integrity. This is not claimed to be legal anonymisation.

No general “suspended” state is proposed in Gate 6A because no disciplinary or support requirement has been approved. Administrative suspension should be designed separately if needed.

The approved terminal state is de-identification rather than physical deletion because restrictive FKs deliberately protect captain, referee, invitation, and audit attribution. Physical deletion is not part of Gate 6A.2.

## C. Role-specific handling

*Class: the captain, referee and super-administrator rules below are **Implemented** and follow `6A-D03`/`6A-D04`. The venue/organisation-administrator coverage rule is **Implemented** in a simpler form than the approved wording suggests; the stricter custody policy is **Proposed** only (see that subsection).*

### Captain

- A captain with an active team cannot complete de-identification until future responsibility has been transferred to a verified successor or explicitly accepted by an authorised venue/platform administrator.
- Transfer changes only active operational ownership. Historical matches, events, standings, prior team identity, and audit events remain untouched.
- Pending invitations and availability actions must be resolved or reassigned before completion.
- Inactive/historical team rows continue to reference the same deidentified UUID unless owner/legal approves a different non-destructive presentation model.

### Referee

- Scheduled or live assignments must be reassigned or explicitly unassigned by an authorised administrator using existing scheduling-conflict rules.
- Final or cancelled matches keep the original referee UUID. They are never reassigned to the successor.
- Whether the historical UI shows a retained referee label or “Deleted referee” requires privacy/legal approval.

### Venue and organisation administrator

- **Implemented (coverage rule).** Completion of a venue administrator is blocked unless another *active* account covers the venue: an active venue administrator of the same venue, an active organisation administrator of the same organisation, **or any active super administrator**. Completion of an organisation administrator is blocked unless another active organisation administrator of the same organisation, or any active super administrator, exists. Pending and de-identified accounts never cover. The check runs only when the departing account has the scope field it relies on: a venue administrator with no venue assigned, or an organisation administrator with no organisation assigned, is not checked for coverage at all, and the organisation-administrator cover of a venue administrator is matched on that account's own organisation field, not on the venue's.
- **Not implemented: any recorded or audited super-administrator custody path.** A super administrator counts as cover *automatically*, with no assignment, no audit event and no expiry, and a venue can therefore lose its last scoped administrator without any record. Operational alerts addressed to "the venue's administrators" (for example the midday unconfirmed-availability alert and availability-response notices) are selected by the administrator's *own* `venue_id`, so a super administrator without that venue assigned never receives them, and organisation administrators are not recipients of these alerts at all.
- **Approved policy (`6A-D03`)** requires explicit, audited succession or custody and forbids automatic transfer. That is implemented for teams and fixtures (administrator custody leaves a team without a captain, or a fixture unassigned, each with an audit event) but **not** for administrator scope.
- **Proposed, NOT approved and NOT implemented (`6A-Q01`, `6A-Q02`):** super administrators stop counting automatically; local administration is covered by an active scoped administrator or an explicitly recorded, audited super-administrator custody assignment, so that deleting an administrator cannot leave a venue silently without critical notifications. Historical sporting information would remain unchanged. The existing behaviour is pinned by a characterisation test so that any change is a deliberate decision.
- Unused invitations issued by the departing admin are revoked.
- Used invitation and audit attribution remains attached to the deidentified UUID if retained under the approved policy.

### Super administrator

- The final active super administrator cannot request completion.
- A row lock plus a transaction-scoped count of other active super administrators must prevent concurrent requests from eliminating all platform administration.
- Succession must be completed and verified before de-identification.

### Multiple responsibilities

All blockers are accumulated and returned together; the system must not partially transfer one responsibility and then fail on another. One transaction locks the user and all affected responsibility rows in deterministic order.

## D. Privacy lifecycle

*Class: **Implemented** unless a step is marked otherwise. Every step is behind the two disabled flags described under Release control.*

1. User opens Account settings on web or mobile and selects “Delete account”.
2. The UI explains that access is blocked immediately, that sporting history may be retained under a generic label, that player records are handled separately and that active responsibilities must be resolved first. **Not implemented:** expected timing and an external request route are not shown, because no timing or published request route has been approved (`6A-Q07`, `6A-Q09`); "player records are handled separately" has no corresponding process yet (`6A-Q03`).
3. User confirms intent and re-enters their password. The server performs Argon2 verification; a normal authenticated session alone is insufficient.
4. Web cookie requests must pass an Origin/Host CSRF check in addition to Auth.js SameSite protections: the request's `Origin` host must equal the host the client addressed (`X-Forwarded-Host`, otherwise `Host`), the same rule Next.js applies to Server Actions. `request.url` is deliberately not used, because Next derives it from its configured listener (for example `localhost:PORT`) unless it is told to trust the Host header, which would reject genuine same-origin requests. The comparison is host-and-port, independent of scheme. A request that presents a bearer credential is exempt because that credential is not ambient. Mobile requests require a valid live bearer session plus the same recent credential confirmation; when a bearer header is present it is authoritative and the browser cookie is never consulted.
5. The server locks the user, rechecks live status/role/responsibilities, advances `sessions_valid_after`, deletes mobile sessions and reset/verification credentials, permanently revokes unused invitations issued by or addressed to the account, and records a pending request. Ordinary auth immediately fails closed.
6. If blockers exist, the requester's response carries a stable request ID and the complete, whitelisted list of the requester's own handovers. No sporting row is changed automatically. Administrators see a **scoped display projection**: a venue administrator sees only blockers inside their venue and an organisation administrator only those inside their organisation (a super administrator sees all), and internal columns such as `organization_id` never leave the service. Completion always evaluates the complete, unfiltered set, so hiding a record from a scoped administrator can never make a request completable.
7. Once approved blockers and retention decisions are satisfied, one transaction deletes credentials, notifications and approved transient data; de-identifies direct identity fields; preserves approved tombstone references; and writes one minimal `ACCOUNT_DEIDENTIFIED` audit event without name/email.
8. Repeating a pending or completed request returns the existing state. It never creates duplicate events or repeats a transfer.
9. **[Proposed - not implemented; `6A-Q10`]** The user receives a generic on-screen and email confirmation if an email channel is still permitted at that stage. The completion record must not contain the former email address. Today no completion email is sent and the on-screen confirmation is the sign-out after the *request*.

Concurrent API operations must re-read an active account row and authorised role inside their own transaction before committing. Adding a status without enforcing it in `resolveCurrentUser`, Auth.js credential authorisation/JWT refresh, mobile sign-in, mobile refresh, and relevant long-running mutations would be incomplete.

### Release control

`ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED` is the primary kill switch. Unless it is exactly `true`, every lifecycle mutation fails closed at both the HTTP route and service boundaries. Read-only scoped inspection remains available to active venue, organisation and super administrators.

`ACCOUNT_LIFECYCLE_COMPLETION_ENABLED` is a separate approval for irreversible de-identification. It is also required before a new user deletion request is accepted, preventing the application from deliberately creating pending requests while completion is unavailable. Succession and assisted withdrawal require only the primary switch, so an authorised operator can recover existing pending requests without enabling irreversible completion.

Both flags default to disabled. Neither flag is set by source code, migration or build configuration.

### Controlled recovery procedure

1. **Before initial release:** keep both flags unset. Confirm migration `0011`, operational ownership, privacy review and the administrator queue before enabling anything.
2. **Normal controlled release:** enable the primary switch, then enable completion only after the separate irreversible-operation approval. Verify both through the authenticated availability endpoint before exposing deletion navigation.
3. **Emergency pause with pending requests:** disable completion first. This blocks new requests and completion while leaving scoped succession and assisted withdrawal available if the primary switch remains enabled.
4. **Full emergency stop:** disable the primary switch. All mutations stop. Read-only inspection remains available for impact assessment.
5. **Assisted withdrawal:** an authorised super administrator completes the approved external identity-verification process, temporarily enables only the primary switch if required, records a meaningful audit reason and cancels the pending request. The API rejects the request unless it carries `identityVerified: true`, the service refuses to run without it, and the `ACCOUNT_DELETION_CANCELLED` audit event records `identity_verified: true`; the administrator screen enables the action only after an explicit identity-verification checkbox is ticked. Revoked invitations are not resurrected.
6. **Re-enable completion:** an authorised operator confirms the pending queue, blockers, migration state, backup/incident status and legal approval, records the operational change, then explicitly enables completion.

The step-by-step release order, rollback prohibition, trusted-proxy requirements and deadlock handling are in [account-lifecycle-release-runbook.md](account-lifecycle-release-runbook.md).

### Pre-enable verification (required before either flag is set in production)

These are operator steps; none is performed by the repository and neither flag is enabled by it.

1. Apply and verify migration `0011` on a restored copy of production first (the CI rehearsal covers the schema shape, not production data).
2. On the real domain, confirm that the deployment forwards the original host (`Host` or `X-Forwarded-Host`) so the Origin/Host rule above accepts genuine requests: submit a request from the web settings page with a disposable account while the flags are enabled only in a staging environment.
3. Confirm the availability endpoint reports `available: true` only when both flags are enabled, and that no deletion navigation appears on web or mobile otherwise.
4. Confirm the administrator queue is staffed and that irreversible completion has its own recorded approval.
5. Irreversible completion is a distinct, confirmed action in the administrator screen (a browser confirmation precedes the request) and an unresolved responsibility blocker keeps it disabled.
6. Obtain the separate operational approval described in runbook section 12 (hosting safeguards for non-production builds) before any further Gate 6A branch is pushed to GitHub.

The application does not yet send a completion-confirmation email because the approved sender, privacy contact, wording and retention details are unresolved. No placeholder public contact or compliance claim may be invented.

## E. Migration assessment

*Class: **Implemented** (in the accepted engineering; never applied to a hosted database).*

The approved additive migration is:

`0011_gate6a_account_lifecycle.sql`

Contents, exactly as implemented:

- Add `auth_users.account_status` (only `active`, `pending_deletion`, `deidentified`): existing rows are backfilled to `active`, then the column is given the default `active` and set `NOT NULL`.
- Add nullable `deletion_request_id`, `deletion_requested_at` and `deidentified_at` columns, with constraints that tie each state to the right combination of those fields, and a constraint that a de-identified account carries exactly its reserved `deidentified+<uuid>@account.invalid` address while active and pending accounts never use the reserved domain. All three constraints are added `NOT VALID` and then validated.
- Add a unique index on `deletion_request_id` (where set) and an index supporting active-role coverage checks.
- Do not add a deletion-request table; the account row and the existing audit log provide the minimum required workflow metadata.
- Add no cascade or reassignment to teams, matches, audit logs, leagues, slots, standings, or events.
- Set `lock_timeout = 5s` and `statement_timeout = 60s` for the migration transaction.
- **Preconditions evaluated before any change** (a failure aborts and changes nothing): migration `0010_gate5_availability_notifications.sql` is recorded in `schema_migrations`; no `auth_users.email` already ends with the reserved `@account.invalid` domain; no two accounts share a case-insensitive email address.
- The migration contains **no** catalogue preconditions about `auth_sessions`, `join_requests`, `players.user_id` or any other production-only table or foreign key. `auth_sessions` is handled at run time (its rows for the account are deleted by the lifecycle service only if the table exists); `join_requests` and `players` are not touched at all. Verifying the real catalogue is an operator step (runbook section 1), not something the migration enforces.

The migration file is part of the accepted engineering and has not been applied to a hosted database. The approved read-only catalogue inspection of 10 November confirmed the relevant FKs, the legacy `auth_sessions`, the production-only `players.user_id`, and `join_requests` personal fields without an account FK; it pre-dates the Gate 5 apply and must be repeated before release.

## Approved owner decisions

1. Retain deidentified tombstones where stable relationships are required; do not equate this with legal anonymisation.
2. Use generic historical role labels while preserving stable UUIDs.
3. Require explicit authorised-administrator succession or custody; never transfer automatically. *(Implemented for teams and fixtures. For administrator scope the implementation still counts any active super administrator as cover automatically; the stricter custody rule is proposed, not approved: `6A-Q01`.)*
4. Prevent the final active super administrator from entering the deletion lifecycle.
5. Retention categories are approved in principle; exact periods and exceptions remain under owner/legal review.
6. Revoke access immediately after verified confirmation; resolve responsibilities while access remains blocked.
7. Keep player and possible-minor data outside captain account deletion.
8. Require password reauthentication for in-account requests and proportionate verification for external requests.
9. Production catalogue inspection was authorised and completed read-only.

## Remaining owner/legal inputs

- Exact retention periods and legal exceptions for audit JSON, invitations, abuse records, provider logs and backups.
- Treatment of production `join_requests` personal fields where no safe account FK exists.
- Player/minor request authority, guardian verification and retention rules.
- Responsible-party and privacy-contact details, processor entities/regions/contracts and external-request service procedure.
- Publication approval for any privacy policy, terms or app-store disclosure.

These are itemised, with an owner-facing question and the consequence of each answer, in the register below.

## Owner and legal decision register (Gate 6A closure)

Status of every item is **OPEN**: none is approved, and nothing here is a legal conclusion. `6A-D01`-`6A-D09` above are the approved decisions; the `6A-Q` items below are the questions that remain. Recorded 2026-11-12.

| ID | Decision needed | What it unblocks | Kind |
|---|---|---|---|
| `6A-Q01` | Approve or reject the administrator-custody policy: super administrators do not count automatically as cover; local administration is covered by an active scoped administrator or an explicitly recorded, audited super-administrator custody assignment | Any custody implementation; closes runbook item C1 | Owner policy |
| `6A-Q02` | If approved: who may assign custody, whether organisation-level custody covers its venues, the review interval, which notifications are "critical", and whether super administrators who receive venue alerts today only because their own `venue_id` is set are converted to explicit custody (rather than silently losing alerts) | Custody specification and tests | Owner policy |
| `6A-Q03` | Players and possible minors: whether players may be minors, who may exercise their rights, and what happens to `players.user_id` and `players.name` when a linked account is de-identified (keep, clear the link, redact the name; deleting the row would change `match_events` attribution) | The UI promise "player records are handled separately"; any change to completion | Owner + legal |
| `6A-Q04` | Production `join_requests`: purpose, retention, and whether to redact/delete by matching email, retire the table, or document and retain | Any change to completion for these rows; the live-schema check | Owner + legal |
| `6A-Q05` | How de-identified captains and referees are presented in historical results (generic label or other) | Presentation only; labels are generic today | Owner |
| `6A-Q06` | Audit logs: allowed personal fields, handling of free-text reasons, and whether personal data already in historical audit JSON is redacted | A redaction slice; the audit census result | Owner + legal |
| `6A-Q07` | Retention periods and exceptions for every category in the privacy readiness assessment section 4 (none is proposed here) | Retention automation, completion timing statements, policy text | Owner + legal |
| `6A-Q08` | Processors and cross-border transfers: legal entity, region, contract and deletion route for each processor; whether Sentry stays enabled; whether the remote login artwork is self-hosted | Processor deletion procedure; policy text; store disclosures | Owner + legal |
| `6A-Q09` | User-rights handling: Information Officer and privacy contact, intake channel and published request page, identity verification, response time, refusal and complaint routes | The external request route required by Google Play; UI wording | Owner + legal |
| `6A-Q10` | Notices: completion-confirmation email (sender, wording, whether permitted), versioned signup acknowledgement and proof, publication of the policy and terms | Any notice implementation | Owner + legal |
| `6A-Q11` | Hosting safeguards: how non-production builds are kept away from production data and service credentials (the detail is held in a private operator record) | Pushing any further Gate 6A branch (runbook section 12) | Owner + operator |
| `6A-Q12` | Complete the credential-hygiene review of the removed legacy utility pages that is recorded in the privacy readiness checklist, without printing or logging any secret | Closing that checklist item | Owner |
| `6A-Q13` | Confirm that "Gate 6A complete" means engineering, decisions and documentation complete, and excludes production steps and flag activation | The completion definition | Owner |
| `6A-Q14` | Who approves each lifecycle flag (primary, then completion), and in which window | Flag activation | Owner |
| `6A-Q15` | Whether the retained technical debt (runbook section 11: deadlock, password verification under super-administrator locks, dependency audit findings, public-route rate limiting) is accepted for release or must be fixed first | Release readiness | Owner |

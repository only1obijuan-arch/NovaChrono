# Gate 6A.2 account-lifecycle release runbook

- Status: **LOCAL DRAFT - NO PRODUCTION ACTIVATION IS AUTHORISED**
- Applies to: the Gate 6A.2 account lifecycle (`ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED`, `ACCOUNT_LIFECYCLE_COMPLETION_ENABLED`, migration `0011`)
- Companion: [account-lifecycle-design.md](account-lifecycle-design.md) (design and invariants), [privacy-legal-readiness.md](privacy-legal-readiness.md) (open legal decisions)

Nothing in the repository applies a hosted migration, sets a flag, deploys, pushes or de-identifies a real account. Every step below is an **operator action that needs its own recorded approval**. This runbook describes the order and the checks; it does not grant authority.

## 1. Deployment prerequisites for migration `0011`

All of these must be true before `0011` is applied anywhere real.

1. The exact release commit has a green **GitHub Actions run on that SHA** (PostgreSQL 17, the pinned CI image). Local PostgreSQL 18 results are supporting evidence only.
2. Migration `0010_gate5_availability_notifications.sql` is recorded in `schema_migrations` under exactly that name. `0011` aborts, changing nothing, if it is not (an unrecorded manual apply of `0010` must be reconciled first).
3. No `auth_users.email` ends with `@account.invalid` and no two accounts share a case-insensitive email. `0011` aborts, changing nothing, otherwise.
4. A read-only catalogue check of the real database has been reviewed against the design matrix, in particular `auth_sessions`, `players.user_id` and `join_requests`.
5. `0011` has been rehearsed on a **restored copy of production**, not only on the CI fixture.
6. A recovery point exists (provider backup or point-in-time marker) and the person applying the migration knows how to restore it.
7. Apply in a quiet window. `0011` sets `lock_timeout = 5s`; if it cannot take its lock it fails cleanly and can simply be re-run.

**Order matters: apply `0011` first, deploy the application second.** The application reads `auth_users.account_status` on every authenticated request, so code deployed before the migration fails for every signed-in user. `0011` is additive (new nullable columns plus `account_status DEFAULT 'active'`), so old code keeps working against the migrated database.

## 2. Feature flags are disabled by default

- Both flags are read at request time and must equal the exact string `true`. Unset, empty, `TRUE`, `1` and `yes` all mean **disabled**.
- Neither flag is set by source code, migration, build configuration or CI. Do not add either to a committed `.env` file.
- With both unset the shipped behaviour is: no deletion option anywhere, every lifecycle mutation refused with HTTP 503 (`LIFECYCLE_DISABLED`), read-only inspection still available to administrators, and the legacy hard-delete routes permanently refused with HTTP 409.

| Primary | Completion | Effect |
|---|---|---|
| unset | unset | Everything refused (shipped default). |
| `true` | unset | No new requests, no completion. Scoped succession and assisted withdrawal still work, so existing pending requests can be recovered. |
| `true` | `true` | Fully enabled. |
| unset | `true` | Everything refused; completion alone does nothing. |

## 3. Separate approval for irreversible completion

De-identification cannot be undone by the application. Enabling `ACCOUNT_LIFECYCLE_COMPLETION_ENABLED` therefore needs its own recorded approval, distinct from the approval to enable the primary switch. Before granting it, confirm and record:

1. The pending queue and its blockers have been reviewed by an authorised super administrator.
2. A recovery point exists and the incident contact is known.
3. The owner/legal decisions that affect what is retained (audit JSON, invitations, players and minors, `join_requests`, processors) are recorded - see the design document's remaining inputs.
4. Another active super administrator exists. The final active super administrator cannot request deletion and cannot be completed.

Completing an account is a separate, confirmed action in the administrator screen, and it stays disabled while any responsibility blocker remains.

## 4. Handling pending requests safely

- A confirmed request immediately blocks web and mobile access and revokes sessions, reset tokens, verification tokens and unused invitations issued by or addressed to the account. Nothing sporting changes.
- **Who sees what.** An administrator's pending list shows only the blockers inside their own venue (venue administrator) or organisation (organisation administrator). A super administrator sees everything. Removing out-of-scope records from the *display* never relaxes completion: completion always evaluates the complete set, so a request whose remaining responsibilities are hidden from a scoped administrator is still blocked, and an empty displayed list does **not** mean "nothing outstanding". Only a super administrator can complete.
- **Succession is always an explicit, audited human decision** by an administrator within scope: hand a team to a named active captain, place it in administrator custody, reassign a scheduled fixture to a conflict-free active referee at the same venue, or leave it unassigned. Live fixtures must finish or be formally postponed first.
- **Assisted withdrawal** (cancelling a pending request) is for a person who contacts you after the fact. A super administrator completes the approved external identity check, enters a meaningful reason, and ticks the identity-verification attestation. The server refuses the action without that attestation and records `identity_verified: true` in the `ACCOUNT_DELETION_CANCELLED` audit event. Invitations revoked by the original request are **not** recreated.
- **Emergency pause with requests already pending:** disable completion first (this blocks new requests and completion, but keeps succession and withdrawal available). **Full stop:** disable the primary switch; everything mutating stops and read-only inspection remains. A pending account stays locked out while the primary switch is off; temporarily enable only the primary switch to recover it.

## 5. Rollback safety - read before any rollback

**Do not roll back to application code that predates Gate 6A.2 (Gate 5 or earlier) once any account is `pending_deletion` or `deidentified`.**

Pre-6A.2 code has no concept of `account_status`. A `pending_deletion` account still holds its credentials, so that code would let the person sign in again on web and mobile, would honour their old password-reset flow, and would treat them as a normal user in every query - silently undoing the request. De-identified accounts have no credentials and an undeliverable email, but older code would still list them and could address messages to them.

- **Preferred response to any defect: disable the flags and forward-fix.** Setting both flags to unset needs no deployment and leaves the new, status-aware authentication code in place.
- **Application-only rollback is acceptable only to another build that contains the Gate 6A.2 authentication changes** (it must still read `account_status`).
- **Do not drop the `0011` columns or constraints** once any account is non-active. The migration is additive precisely so that it never needs to be reversed.
- If a revert to pre-6A.2 code is ever unavoidable: first leave no account pending - complete or withdraw every pending request (this needs the flags on), confirm `SELECT count(*) FROM auth_users WHERE account_status = 'pending_deletion'` is `0`, take a recovery point, and treat de-identified rows as data the old code does not understand.
- A mistaken **completion** is not recoverable by the application. The only route is restoring from backup, which also loses newer data; decide that with the owner and legal contact, not under time pressure. This is the reason completion has its own approval.

## 6. Forward-fix and recovery procedures

| Situation | Action |
|---|---|
| Defect found after enabling | Unset completion flag, then primary flag if needed. Fix forward in a new commit, re-run CI, redeploy. |
| Request stuck pending while the primary switch is off | Enable only the primary switch, resolve or withdraw, then restore the previous setting. |
| Succession/completion call returned HTTP 500 | See section 8. Check the audit log and pending list, then repeat once. |
| Migration `0011` aborted | Nothing was changed. Read the precondition message, fix the data, re-run. |
| Wrong host/origin behaviour (every web request returns 403 `Invalid request origin`) | Section 7. Disable the flags; fix the proxy; retest on staging. |
| Suspected unauthorised completion | Disable both flags, preserve the audit log (`ACCOUNT_*` actions), restore only on the owner's decision. |

## 7. Trusted `Host` / `X-Forwarded-Host` handling

Cookie-authenticated lifecycle mutations (`POST /api/account/deletion`, `PATCH /api/admin/account-lifecycle`, `PATCH /api/org-admin/account-lifecycle`) require an `Origin` header whose host equals the host the client addressed: the first `X-Forwarded-Host` value, otherwise `Host`. The comparison covers host and port and ignores scheme. A request carrying a bearer credential (the mobile app) is exempt because that credential is not ambient, and a bearer header is then authoritative - the cookie is never consulted.

What the deployment must guarantee:

1. The edge/proxy delivers the **public** host to the application in `Host` or `X-Forwarded-Host` (the host in the browser's address bar). If neither carries it, genuine requests fail closed with HTTP 403.
2. The edge/proxy **overwrites** `X-Forwarded-Host`; it must not append to a client-supplied value. The application takes the first value, and Next.js 16.4.5 itself answers HTTP 500 to a multi-value `X-Forwarded-Host` before the application runs, so an appending proxy is incompatible in any case.
3. Nothing other than the browser address bar chooses the host: the application does not authenticate the proxy and trusts these headers as given.

Why this is safe: a browser cannot set `X-Forwarded-Host` cross-origin (the preflight is refused; the application sends no CORS headers), so a hostile page cannot make a victim's browser send a matching pair. A non-browser client can set both headers freely, but it has no ambient cookie to abuse. The check is a CSRF defence layered on top of the `SameSite=Lax` session cookie, not a substitute for it, and it must not be reused to make any other trust decision.

Related, separate assumption: rate limiting trusts the client address only when `VERCEL=1` (Vercel's edge). On any other host every caller shares one `unknown` bucket. Do not deploy elsewhere without a trusted-proxy design.

**Verification before enabling (staging, disposable account, flags on only in staging):**

1. From the real settings page, submit a deletion request with the correct password: expect success.
2. Repeat from the command line with the same cookie but `Origin: https://attacker.example`: expect HTTP 403.
3. Repeat with no `Origin`: expect HTTP 403.
4. Confirm `GET /api/account/deletion` reports `available: true` only when both flags are on.
5. Confirm the mobile app can request and that the response is not blocked by the origin rule.

## 8. Retryable deadlock behaviour

Lifecycle transactions lock rows in a fixed order (super administrators first for request/complete/withdraw; league, team, then users for team succession; fixture, then users, then the referee schedule for referee succession). Two concurrent operations by the **same administrator** that touch overlapping rows can, rarely, request the same locks in opposite orders. PostgreSQL then aborts one transaction with SQLSTATE `40P01` (`deadlock detected`).

- The aborted transaction is rolled back completely. No team, fixture, credential, session or audit change from that attempt survives.
- The caller receives the generic HTTP 500 `An unexpected error occurred.` and the server log records `deadlock detected`.
- The application **does not retry automatically**. An unattended retry could repeat an action whose outcome the operator has not seen. The operator should open the pending list (or the audit log), confirm the action did not already apply, and repeat it once.
- Repeating is safe: a second attempt either completes or is refused cleanly (`NOT_PENDING`, `TEAM_NOT_OWNED`, `FIXTURE_NOT_ASSIGNED`, `SUCCESSOR_CONFLICT`, `REFEREE_CONFLICT`). Concurrent mixed-operation stress testing found no lost or half-applied state, no double-booked referee and never zero active super administrators.
- Repeated 500s on the same action are not a deadlock. Check the server log for a different error.

## 9. After enabling - verification checklist

1. `GET /api/account/deletion` returns `available: true` for a signed-in user, and the web settings page and mobile screens show the deletion option only then.
2. A disposable captain request revokes web and mobile access immediately and appears in the correct administrators' lists with only in-scope blockers.
3. A cross-venue administrator does not see the captain's other-venue teams; a super administrator does.
4. Succession, withdrawal (with attestation) and, only after the separate approval, completion each write exactly one audit event.
5. No audit event, rate-limit row or invitation row retains the former email after completion.

## 10. Known residual items (not blockers to the local candidate)

- Production-only `players.user_id` and `join_requests` personal data are **not** changed by account de-identification; they need the separate player/minor process in the design document.
- Free-text administrator reasons are stored in the audit log; instruct administrators not to enter personal information in them.
- `requestAccountDeletion` verifies the password while holding the super-administrator row locks (rate-limited to three attempts per hour per account); a burst of requests can briefly delay super-administrator sign-in and admin actions.
- Mobile screens are parse-checked only until an Expo build and device test is performed.

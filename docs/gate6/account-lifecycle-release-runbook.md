# Gate 6A.2 account-lifecycle release runbook

- Status: **DRAFT RELEASE PROCEDURE FOR ENGINEERING ACCEPTED LOCALLY AT `68c964c` - NO PRODUCTION ACTIVATION IS AUTHORISED**
- Applies to: the Gate 6A.2 account lifecycle (`ACCOUNT_LIFECYCLE_MUTATIONS_ENABLED`, `ACCOUNT_LIFECYCLE_COMPLETION_ENABLED`, migration `0011`)
- Companion: [account-lifecycle-design.md](account-lifecycle-design.md) (design and invariants), [privacy-legal-readiness.md](privacy-legal-readiness.md) (open legal decisions)

Nothing in the repository applies a hosted migration, sets a flag, deploys, pushes or de-identifies a real account. Every step below is an **operator action that needs its own recorded approval**. This runbook describes the order and the checks; it does not grant authority.

**Where things stand (2026-11-12).** Accepted engineering: commit `68c964c0921f08c84f94c2b69b5820fcf1a77404`, draft pull request #11, unmerged; independent technical review found no P0, P1 or P2 issues. Canonical CI: GitHub Actions run `43207282894`, attempt 2, PASS on PostgreSQL 17.11 (attempt 1 failed on the pre-existing Gate 4A test described in section 11, TD-1). Not done: migration `0011` not applied to any hosted database, nothing deployed, both flags recorded as unset in every hosted environment when last checked on 2026-11-12 (not re-verified since), the prerequisites in section 1 other than item 1 not performed, and the hosting safeguards for non-production builds still need a separate operational approval before any further Gate 6A branch is pushed (section 12). Accepted engineering is *not* a release.

## 1. Deployment prerequisites for migration `0011`

All of these must be true before `0011` is applied anywhere real.

1. The exact release commit has a green **GitHub Actions run on that SHA** (PostgreSQL 17, the pinned CI image). Local PostgreSQL 18 results are supporting evidence only. *Status: satisfied for `68c964c` by run `43207282894` attempt 2; any later commit needs its own run.*
2. Migration `0010_gate5_availability_notifications.sql` is recorded in `schema_migrations` under exactly that name. `0011` aborts, changing nothing, if it is not (an unrecorded manual apply of `0010` must be reconciled first).
3. No `auth_users.email` ends with `@account.invalid` and no two accounts share a case-insensitive email. `0011` aborts, changing nothing, otherwise.
4. A read-only catalogue check of the real database has been reviewed against the design matrix, in particular `auth_sessions`, `players.user_id` and `join_requests`. The earlier inspection (10 November) pre-dates the Gate 5 apply and must be repeated. A prepared, **unexecuted** query set is in [readonly-catalogue-census.sql](readonly-catalogue-census.sql): fixed statements only (no dynamic SQL), psql 10 or later, a dedicated read-only role with the column grants listed in its header, counts and catalogue metadata only, category labels restricted to allow-listed or pattern-checked values, and counts of 1 to 4 suppressed. This revision has not been executed or parsed by any database server, and any run - hosted, or on a disposable local database - needs its own recorded approval.
5. `0011` has been rehearsed on a **restored copy of production**, not only on the CI fixture.
6. A recovery point exists (provider backup or point-in-time marker) and the person applying the migration knows how to restore it.
7. Apply in a quiet window. `0011` sets `lock_timeout = 5s`; if it cannot take its lock it fails cleanly and can simply be re-run.

**Order matters: apply `0011` first, deploy the application second.** The application reads `auth_users.account_status` on every authenticated request, so code deployed before the migration fails for every signed-in user. `0011` is additive (new nullable columns plus `account_status DEFAULT 'active'`), so old code keeps working against the migrated database.

## 2. Feature flags are disabled by default

- Both flags are read from the process environment at request time and must equal the exact string `true`. Unset, empty, `TRUE`, `1` and `yes` all mean **disabled**.
- **Changing a flag is an environment change, and a hosting platform normally applies one by restarting or redeploying the service** (for example Vercel applies a changed variable only to a new deployment, and Railway redeploys the service when a variable changes). The application needs no code change or new build, but plan every flag change as a restart: expect a brief interruption, do not assume it is instantaneous, and confirm the new state afterwards with `GET /api/account/deletion` (`available`). The same applies to the emergency stop in sections 5 and 6.
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

- **Preferred response to any defect: disable the flags and forward-fix.** Setting both flags to unset needs no code change or new build and leaves the new, status-aware authentication code in place. It is still an environment change, which the platform will normally apply by restarting or redeploying the service (section 2), so treat it as a restart and confirm that `GET /api/account/deletion` reports `available: false` afterwards.
- **Application-only rollback is acceptable only to another build that contains the Gate 6A.2 authentication changes** (it must still read `account_status`).
- **Do not drop the `0011` columns or constraints** once any account is non-active. The migration is additive precisely so that it never needs to be reversed.
- If a revert to pre-6A.2 code is ever unavoidable: first leave no account pending - complete or withdraw every pending request (this needs the flags on), confirm `SELECT count(*) FROM auth_users WHERE account_status = 'pending_deletion'` is `0`, take a recovery point, and treat de-identified rows as data the old code does not understand.
- A mistaken **completion** is not recoverable by the application. The only route is restoring from backup, which also loses newer data; decide that with the owner and legal contact, not under time pressure. This is the reason completion has its own approval.

## 6. Forward-fix and recovery procedures

| Situation | Action |
|---|---|
| Defect found after enabling | Unset completion flag, then primary flag if needed (each is an environment change; section 2). Fix forward in a new commit, re-run CI, redeploy. |
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

Related, separate assumption: the shared helper `getTrustedClientIp`, used by the authentication routes (signup, email status, mobile sign-in, password reset), trusts the client address only when `VERCEL=1` (Vercel's edge). On any other host those callers share one `unknown` bucket. Do not deploy elsewhere without a trusted-proxy design.

**Exception (pre-existing, outside the lifecycle; TD-4 in section 11):** two public read-only routes, `GET /api/matches` and `GET /api/stats`, build their rate-limit key from the raw client-supplied `X-Forwarded-For` header on every host and do not use the helper. A caller can vary that header to avoid their 60-per-minute limit. The lifecycle endpoints are not affected: the account-deletion endpoint keys its limit on the account, not on a client address.

**Verification before enabling (staging, disposable account, flags on only in staging):**

1. From the real settings page, submit a deletion request with the correct password: expect success.
2. Repeat from the command line with the same cookie but `Origin: https://attacker.example`: expect HTTP 403.
3. Repeat with no `Origin`: expect HTTP 403.
4. Confirm `GET /api/account/deletion` reports `available: true` only when both flags are on.
5. Confirm the mobile app can request and that the response is not blocked by the origin rule.

## 8. Retryable deadlock behaviour

Lifecycle transactions lock rows in a fixed order (super administrators first for request/complete/withdraw; league, team, then users for team succession; fixture, then users, then the referee schedule for referee succession). Two concurrent operations by the **same administrator** that touch overlapping rows can, rarely, request the same locks in opposite orders. PostgreSQL then aborts one transaction with SQLSTATE `40P01` (`deadlock detected`). The independent review reproduced this deterministically against the **real** `ASSIGN_REFEREE` route (an administrator whose user id sorts after the referee's, running referee succession and an assignment at the same time), so it is a demonstrated, not merely theoretical, limitation. **Which side is aborted is not fixed:** PostgreSQL's deadlock detector aborts whichever transaction it examines first. In the review's runs the victim was sometimes the lifecycle operation (a `40P01` from the service) and sometimes the `ASSIGN_REFEREE` request (an HTTP 500 from the route), so an operator must check both after any unexplained 500. The pending-list endpoints also take shared row locks on the accounts they list, which adds a little exposure to the same pattern. Lock ordering is deliberately unchanged until a validated concurrency design exists.

- The aborted transaction is rolled back completely. No team, fixture, credential, session or audit change from that attempt survives.
- The caller that was aborted receives the generic HTTP 500 `An unexpected error occurred.` and the server log records `deadlock detected`. The other side may complete, or may be refused with an ordinary 4xx (for example HTTP 409 `Referee account is not active` when the lifecycle operation committed first); that is a normal outcome, not a second failure.
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

- Production-only `players.user_id` and `join_requests` personal data are **not** changed by account de-identification, and no separate player/minor process exists yet; the web and mobile deletion screens nevertheless say "player records are handled separately". Both are open owner/legal decisions (`6A-Q03`, `6A-Q04`).
- Free-text administrator reasons are stored in the audit log; instruct administrators not to enter personal information in them.
- `requestAccountDeletion` verifies the password while holding the super-administrator row locks (rate-limited to three attempts per hour per account); a burst of requests can briefly delay super-administrator sign-in and admin actions.
- Mobile screens are parse-checked only until an Expo build and device test is performed.

## 11. Retained findings register (independent acceptance review and Gate 6A closure)

Findings F1-F4 of the independent acceptance review are **closed** in code or tests (F3 is the only production-code change: the `account_status = 'active'` predicate, inside the existing lock order, in both actor lookups of `POST /api/leagues/postpone-round`). Everything below is **retained on purpose**, except TD-1 and TD-2, which the Gate 6A closure slice S1 corrects (test-only). None is a release blocker for the local candidate; each is an input to a release decision (`6A-Q15`).

| ID | Sev | Retained item | What is known | Why it is not changed here |
|---|---|---|---|---|
| F5 | P3 | `requestAccountDeletion` verifies the password while holding every super-administrator row lock | On the review machine one Argon2 verify took about 283 ms; a burst of 8 wrong-password requests delayed a super-administrator `FOR SHARE` by about 1.2 s (normally 2-4 ms). Throttled to 3 requests per hour per account | The remedy (verify first, lock afterwards, re-validate the credential under the lock) alters the lock/identity protocol and needs its own concurrency design and tests |
| F6 | P3 | Same-administrator `40P01` deadlock between referee succession and `ASSIGN_REFEREE` | Reproduced deterministically through the real route (section 8); rolls back cleanly; a retry succeeds; the pending-list endpoints also take shared row locks | No automatic retry (an unattended retry could repeat an unseen action) and no lock re-ordering without a validated concurrency design |
| F7a | P4 | Runbook claimed flag changes need no deployment | Corrected in sections 2, 5 and 6: a flag change is an environment change that the platform normally applies by restart or redeploy | Documentation only |
| F7b | P4 | Captain successors are not venue- or organisation-scoped | An administrator may name any active captain by UUID as successor; referee successors are restricted to the venue | Behavioural/policy decision for the owner |
| F7c | P4 | Build telemetry | `next build` attempts a Next upgrade-advisory fetch and Sentry build telemetry by default. Set `SENTRY_BUILD_TELEMETRY=0` and `NEXT_TELEMETRY_DISABLED=1` for offline or CI builds; refused requests are not fatal | Build configuration, no uploads are configured |
| S1 | P4 | Signup reserved-domain route pre-check has no test of its own | The database `CHECK` (`auth_users_lifecycle_email_consistent`) is the authoritative control: without the pre-check signup answers HTTP 500 and creates no account or team | Backstopped by the database; a route-level test is optional hardening |
| S2 | P4 | `authorize()` status check pinned only by Playwright | It is defence in depth beneath the Auth.js `jwt` callback, which is pinned at integration level | Observed only through the full sign-in journey |
| C1 | owner | Whether a super administrator should count as venue or organisation cover | Today any active super administrator does, so the coverage blockers cannot fire in practice and a venue or organisation can lose its last scoped administrator without any recorded custody. Alerts addressed to "the venue's administrators" (for example the midday unconfirmed-availability alert) match on the administrator's own venue column and therefore never reach a super administrator who has no venue assigned; organisation administrators are not recipients of them at all. The current rule is pinned by an explicit characterisation test in `tests/integration/gate6a-blocker-rules.test.js`. A stricter policy (explicit, audited custody) is **proposed, not approved** (`6A-Q01`, `6A-Q02`) | Unresolved owner decision; the rule must not change silently |
| TD-1 | P3 | **Inherited Gate 4A non-deterministic test.** `serializes correction racing finalisation and preserves final truth` fired `END_MATCH` and `ADMIN_OVERRIDE` with `Promise.all` and asserted 200/200 | Either operation can take the match row first (both begin with `lockMatch ... FOR UPDATE OF m`); if `ADMIN_OVERRIDE` wins it correctly answers 409 `Cannot correct a match with status 'live'`. The test is unchanged since Gate 4A. GitHub run `43207282894` **attempt 1 failed on it** (PostgreSQL 17.11) and attempt 2 passed on the identical commit; the implementer's warm local loop of 300 iterations saw the 409 order 104 times on the accepted candidate and 103 times on the Gate 5 baseline (14 of 14 fresh-process runs passed), but an independent reviewer's 150-iteration loop of the unchanged test on a different local PostgreSQL 18.6 setup saw it 0 times, so that frequency depends on the environment and is **not independently reproduced**. What is established is the code-level cause and the failed first CI attempt. It is a defect of the test (its dependence on which operation takes the lock first), not an infrastructure failure, a Gate 6A.2 regression or a production defect | **Corrected test-only in closure slice S1 (included in this change):** the test now holds the match row in a barrier transaction and releases `END_MATCH` and `ADMIN_OVERRIDE` into the lock queue one at a time, each only once it is visibly queued (a `waitForLockWaiters` helper counts lock waiters in `pg_stat_activity`), so the arrival order is fixed and each order's exact outcome is asserted: `END_MATCH` first finalises and the correction rewrites the final result with one audit row; `ADMIN_OVERRIDE` first is refused with 409 and the finalisation stands, with nothing audited or rewritten. Both orders also check the match row, the single end event, the audit trail and the standings. No production code changed. Timing parameters: the two concurrent tests set an explicit 20-second per-test timeout (the replaced test used the 5-second default), and the lock-wait helper polls for about 6 seconds before failing loudly; the poll interval is not used to hide the race. No assertion, accepted status or retry was loosened. The accepted commit `68c964c` still contains the old test |
| TD-2 | P3 | **Vacuous notification assertions** in `gate6a-postpone-round-account-status.test.js`: "no email / no push" could not fail because the fixture teams had no captain | A successful postponement notified nobody in that fixture | **Corrected test-only in closure slice S1 (included in this change):** captains are seeded, a precondition proves they are reachable, success asserts exact inbox/email/push effects, refusals assert none, and unauthorised-delivery mutants are detected |
| TD-3 | P4 | Dependency audit findings | `npm audit --omit=dev` (the CI gate, threshold `high`) reports 5 moderate findings from the Sentry build-plugin chain (`glob`/`minimatch`); the suggested fix needs `@sentry/nextjs` 11.12.0, outside the pinned range. The full dependency tree reports 18 findings (15 moderate, 3 high: `brace-expansion`, `js-yaml`, `vite` via `launch-editor`), all indirect and development-only. The CI gate passes | Dependency changes need their own gate; not addressed in Gate 6A |
| TD-4 | P4 | Raw `X-Forwarded-For` rate-limit key on two public read-only routes (section 7) | Pre-existing; unrelated to the lifecycle; the limiter on those routes can be avoided by varying the header | Outside Gate 6A.2 scope; candidate for a small separate fix |
| OP-1 | operational | Hosting safeguards for non-production builds | Section 12 and the private operator record | Needs separate operational approval |

Release prerequisites that are not code, and are therefore still open: Expo build and device test of the mobile screens; the legal/privacy decisions listed in section 10 and the design document (register `6A-Q01`-`6A-Q15`); the restored-copy rehearsal, catalogue check and recovery point in section 1; hosting safeguards for non-production builds (section 12); staging verification of the Host/`X-Forwarded-Host` behaviour (section 7); and separate recorded approvals for each flag (sections 2 and 3). A green GitHub Actions run on PostgreSQL 17 exists for `68c964c` (run `43207282894`, attempt 2) and is required again for any different release commit. Local PostgreSQL 18.6 results are supporting evidence only.

## 12. Hosting safeguards for non-production builds

*Class: operational. The wording is deliberately generic because this repository is public; the detailed record is held privately by the operator and is not part of the repository.*

Preview and staging deployments of this application need explicit, recorded operational safeguards before any further Gate 6A branch is pushed to GitHub, because pushing a branch can start a hosted build. The safeguards, their current state and their owner are kept in a private operator record. This document does not describe them and does not claim that they are complete.

Required before any further Gate 6A branch is pushed: the operator confirms in that private record, under a separate operational approval (`6A-Q11`), that non-production builds cannot reach production data or production service credentials. Do not open or sign in to any Gate 6A preview deployment until then. Neither lifecycle flag may be enabled in any environment other than a disposable staging environment (sections 2 and 7).

# Gate 6A privacy and legal readiness

- Status: **DRAFT — REQUIRES OWNER/LEGAL APPROVAL**
- Prepared: 2026-11-10; reconciled with the accepted engineering on 2026-11-12 (Gate 6A closure slice S0)
- Jurisdictional focus: South Africa / POPIA readiness

This is a technical readiness assessment, not legal advice and not a statement that NovaChrono is compliant. No policy text in this document is approved for publication, and nothing in it has been published. Open owner and legal questions are itemised in the decision register (`6A-Q01`-`6A-Q15`) at the end of [account-lifecycle-design.md](account-lifecycle-design.md).

**Terminology.** The accepted engineering produces a *de-identified* account (state `deidentified`): credentials deleted, direct identifiers replaced, stable user UUID kept. That is **not** anonymisation: audit content including free-text reasons, rows in tables the lifecycle does not touch (for example production-only `join_requests` and `players`), processor copies and backups can still relate to the person. Earlier drafts used "anonymised"; wherever this document or any future user-facing text says "anonymised" it must be reconciled with this definition by the owner and legal review.

## Current readiness summary

The application has technical controls for credential hashing, email verification, session revocation, tenant/role checks, token hashing, push-token ownership, and limited public responses.

**Implemented but disabled.** The accepted engineering at `68c964c` (draft pull request #11, unmerged; canonical CI PASS on PostgreSQL 17.11, run `43207282894` attempt 2) contains an account-deletion request path: a web settings screen, mobile screens (parse-checked only, not device-tested), `POST /api/account/deletion`, administrator succession and completion screens, and a de-identification service. It is **not live**: migration `0011` is applied to no hosted database and both lifecycle flags are unset in every hosted environment (observed 2026-11-12), so no deletion option is exposed anywhere.

**Still absent:** a privacy policy, terms of use, a retention schedule, a privacy-request contact or published request page, a signup acknowledgement, a completion-confirmation notice, and any process for player records or the production-only `join_requests` table (the deletion screens say player records "are handled separately", but no such process exists). Mobile notification permission is requested through the operating-system permission flow.

The obsolete admin password-reset utility pages and their hardcoded reset details were confirmed to have no corresponding API routes or supported workflow. They are removed in the accepted engineering (a test pins their absence) but remain in the public Git history. The supported password-reset, email-verification, invitation, and mobile logout flows remain.

## 1. Personal data inventory

| Category | Examples in NovaChrono | Subjects | Location/recipient |
|---|---|---|---|
| Account identity | Name, email, verification state, role, image, organisation/venue association | Captains, referees, admins | PostgreSQL/Neon; Auth.js JWT; authorised UI/API responses |
| Credentials and recovery | Argon2 password hash; hashed reset, verification and invitation tokens; session epoch | Account holders and invitees | PostgreSQL/Neon; web/mobile auth services |
| Mobile access/device | Signed bearer token in SecureStore, session JTI, Expo push token, notification permission state | Mobile users | Device SecureStore, PostgreSQL/Neon, Expo push service |
| Sporting participation | Team/captain link, referee assignment, player name/number, match events, availability response | Captains, referees, players | PostgreSQL/Neon; public and authenticated competition views depending on field |
| Administration/audit | Actor UUID, action type, old/new JSON, reason, invitation issuer | Administrators and other actors | PostgreSQL/Neon; authorised admin routes |
| Communications | Email recipient/name, email body, notification title/body, delivery metadata | Account holders, invitees | Resend, Expo, PostgreSQL notifications |
| Security/usage | Canonical email and IP-derived rate-limit keys, timestamps, server/error logs | Visitors and account holders | PostgreSQL rate-limit tables; Vercel/runtime logs; optional Sentry |
| Legacy production-only records | `join_requests`: captain name, captain email, captain phone, team name, status, created time, linked to a league but not to an account. `players.user_id`: an unconstrained text link from a player row to an account. `auth_sessions`: dormant adapter sessions. None is created or read by current source or migrations (per the 7 October schema evidence and the 10 November read-only catalogue inspection; to be re-verified before release) | Captains and players who used earlier versions; possibly minors (unknown) | PostgreSQL/Neon only. Account de-identification does **not** change `join_requests` or `players`; it deletes `auth_sessions` rows for the account if the table exists |
| Venue data | Venue name, location, latitude/longitude | Organisations/venues; may identify operators indirectly | PostgreSQL/Neon; OpenWeather request; public/admin UI as applicable |
| Public configuration/asset access | App URL/version, public Sentry DSN, mobile API base URL; CDN request metadata for logo asset | Visitors/devices | Client bundles; Vercel/Sentry/Uploadcare network requests |

Special review is required for player names because the application does not prove that every player is the account holder, and indoor leagues may include minors. No age/guardian model exists in the accepted source.

## 2. Collection purposes to validate

- Create and secure user accounts.
- Verify email ownership and recover access.
- Administer organisations, venues, leagues, teams and fixtures.
- Assign captains and referees and record legitimate sporting results/history.
- Communicate fixture, availability, postponement, weather and administrative notices.
- Deliver push notifications requested through device permission.
- Prevent abuse, investigate incidents and maintain a minimal audit trail.
- Obtain venue weather information from coordinates.
- Diagnose application failures where Sentry is configured.

The business owner must confirm that each purpose is necessary, describe the lawful processing basis, and identify any mandatory versus optional fields. Consent should not be presented as the universal basis where another lawful basis is intended.

## 3. Recipients and processors requiring disclosure

| Recipient/processor | Technical role | Data potentially sent | Decision/evidence needed |
|---|---|---|---|
| Neon/PostgreSQL provider | Primary database | All persisted application data | Contract, region, subprocessors, security and deletion/backup retention |
| Vercel | Web hosting, edge and function logs | IP/request metadata, application responses/errors | Production region/log retention, DPA and subprocessors |
| Resend | Transactional email | Recipient email/name and message content | DPA, delivery/log retention, regions, deletion process |
| Expo | Push delivery/mobile build ecosystem | Push token and notification content; project/device metadata | DPA/terms, retention, store disclosures, deletion process |
| Sentry, if enabled | Error monitoring | Request/error context that may include identifiers | Scrubbing configuration, environment, retention, region and access |
| OpenWeather | Venue weather | Venue latitude/longitude and request metadata | Confirm coordinates are not personal/home location; contract and disclosure |
| Uploadcare-hosted asset | Remote login/signup artwork | Visitor IP/request metadata | Replace/self-host or disclose CDN processing as owner decides |
| Apple and Google | Mobile distribution/OS services | Store account/device and permission metadata governed by platform | Complete store privacy/data-safety disclosures |
| WhatsApp, user initiated | Shares league invitation text/link | Content selected by user and platform metadata | Explain that sharing leaves NovaChrono and is user initiated |

Cross-border transfers are likely because several processors are international. Owner/legal must confirm transfer safeguards and the actual contracted entities/regions rather than relying on package names.

## 4. Retention questions

No retention periods should be invented. The owner/legal review must set and justify periods for:

- Active accounts and pending deletion requests.
- De-identified captain/referee tombstones (not claimed to be anonymous) and historical sporting records.
- Legacy `join_requests` rows (captain name, email, phone) and the `players.user_id` link.
- Player names/numbers and records involving minors.
- Match events, results, standings and league history.
- Audit logs and the personal fields allowed inside JSON snapshots.
- Used, expired and unused invitations.
- Notifications and availability/reminder delivery records.
- Password reset and email verification tokens after expiry/use.
- API/auth rate-limit records and trusted client IP-derived identifiers.
- Vercel logs, Sentry events, Resend logs, Expo tokens/tickets and database backups.
- Legal holds, disputes, security incidents and restoration copies.

The policy must explain backup deletion latency and any data retained for a legitimate legal/security reason.

## 5. User rights and request handling

Provide an accessible process for people to request access, correction, objection/restriction where applicable, and deletion. Requests require proportionate identity verification and must not expose whether another person has an account. Define intake, verification, tracking, escalation, response timing, third-party processor actions, completion notice, refusal reasons and complaint handling.

The Information Regulator’s own notice describes rights to request correction/deletion of inaccurate, irrelevant, excessive, outdated, incomplete, misleading or unlawfully obtained information, with identity verification and lawful exceptions. Owner/legal must map NovaChrono’s process to the applicable POPIA provisions and prescribed forms.

Official references reviewed:

- Information Regulator privacy notice: https://inforegulator.org.za/privacy-notice/
- Information Regulator POPIA resources/forms: https://inforegulator.org.za/popia/
- Apple account-deletion guidance: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Google Play account-deletion guidance: https://support.google.com/googleplay/android-developer/answer/13327111

## 6. Proposed privacy-policy structure

1. Identity and contact details of the responsible party and Information Officer/privacy contact.
2. Scope, effective date and version history.
3. Categories and sources of personal information.
4. Purposes and lawful bases, including mandatory/voluntary fields and consequences of not providing them.
5. Public sporting information versus authenticated/admin-only information.
6. Children/minors and captain/guardian responsibilities.
7. Cookies, web sessions, mobile SecureStore, push permissions and diagnostics.
8. Recipients, processors and international transfers.
9. Retention schedule and deletion/de-identification model (use the owner-approved term; see the terminology note above).
10. Security safeguards and incident communication at a non-sensitive level.
11. Data-subject rights, identity verification and request procedure.
12. Complaint route and Information Regulator details.
13. Policy changes and notification method.

## 7. Proposed terms-of-use structure

1. Operator identity, eligibility and authority to accept terms.
2. Account security and accurate information.
3. Role responsibilities for captains, referees and administrators.
4. Authority to submit player information and rules for minors.
5. League, fixture, score, correction and sporting-history rules.
6. Acceptable use, abuse, impersonation and prohibited activity.
7. Notification/email expectations and user-controlled permissions.
8. Account suspension, deletion, succession and retained sporting history.
9. Third-party services and user-initiated sharing.
10. Intellectual property and user-submitted content.
11. Availability, support, disclaimers and liability for owner/legal drafting.
12. Governing law, disputes, changes and contact details.

## 8. Required business-owner decisions

- Legal identity, physical/service address, Information Officer and privacy-request contact.
- Approved processing purposes and lawful bases.
- Whether players may be minors and the guardian/club authority model.
- Which roster, result and referee information is public.
- Retention schedule and de-identified-history presentation.
- Treatment of production `join_requests` rows and of `players.user_id` / `players.name` when a linked account is de-identified (`6A-Q03`, `6A-Q04`).
- Whether any administrator-custody rule (`6A-Q01`, `6A-Q02`) needs to appear in user-facing terms.
- Account-deletion completion time, grace/cancellation policy and succession authority.
- Processor list, contracted regions, subprocessors and cross-border safeguards.
- Sentry enablement, scrubbing, sampling and retention.
- Whether the remote Uploadcare asset should be self-hosted.
- Support/complaint route and incident-response ownership.
- Versioned acknowledgement required at signup/invitation acceptance and how proof is recorded.

## 9. App-store compliance checklist

**Status on 2026-11-12 (no box below is ticked, because none is verified in a store submission):** the in-app initiation path exists on web (account settings) and in the mobile app (`account/delete` screen), but only behind the disabled flags and the mobile screens are parse-checked, not device-tested. The de-identification service deletes credentials and de-identifies the account rather than merely freezing it, and automated tests exercise captain, referee, venue-administrator and organisation-administrator fixtures while asserting that results, standings and events are unchanged. Still missing: the completion confirmation, timing and retention explanation, the functional external web resource that works after uninstall, any published policy or terms link, and the store disclosures.

### Apple

- [ ] Provide an easy-to-find in-app initiation path in Account settings.
- [ ] Offer entire account deletion, not only deactivation.
- [ ] Explain retained data and timing; provide completion confirmation.
- [ ] If completion occurs on web, deep-link directly to the deletion page.
- [ ] Ensure subscription/billing wording is accurate if monetisation is later introduced.
- [ ] Align App Store privacy answers with actual collection and processors.

### Google Play

- [ ] Provide an in-app deletion initiation path.
- [ ] Provide a functional external web resource that works after uninstall and identifies NovaChrono/developer.
- [ ] Complete Data safety deletion questions and provide the external URL.
- [ ] Delete associated user data or clearly disclose justified retention; freezing alone is insufficient.
- [ ] Request processor deletion where applicable.
- [ ] Align Data safety declarations with code, permissions and policy.

### Both platforms

- [ ] Publish approved privacy policy and terms links inside mobile and web apps.
- [ ] Explain push permission before/when requested and keep denial non-blocking.
- [ ] Validate store metadata against actual data flows before each release.
- [ ] Test deletion with captain, referee and administrator fixtures without changing historical results.

## 10. Open legal review items

- POPIA roles and lawful bases for each processing purpose.
- Children’s personal information and guardian/competent-person authorisation.
- Cross-border transfer requirements.
- Public display of names, team membership and match attribution.
- Legal/operational basis and duration for historical records, audit logs and security logs.
- Data breach procedure and regulator/data-subject notification duties.
- PAIA/POPIA request forms, identity verification and refusal/escalation process.
- Processor agreements, backup deletion and downstream deletion obligations.
- Marketing/direct-communication distinction versus service communications.

## Candidate user-facing wording

**DRAFT — REQUIRES OWNER/LEGAL APPROVAL**

> You can request deletion of your NovaChrono account from Account settings or through our published privacy-request page. We will verify the request, revoke account access, and explain any active team, referee or administrative responsibilities that must be handed over safely. We will delete or de-identify personal information that is no longer required. Match results, standings and other sporting records may be retained under a generic label where needed to preserve competition integrity or meet approved legal obligations. We will tell you what is retained and confirm when the request is complete.

This wording must not be published until the operator identity, contact details, retention decisions, timing and legal bases are approved. Drafting note: the term "de-identify" replaces the earlier "anonymise"/"anonymised" because the accepted engineering does not anonymise (see the terminology note at the top). The sentence "we will confirm when the request is complete" describes a completion notice that is **not implemented** (`6A-Q10`), and "published privacy-request page" refers to a page that does not exist (`6A-Q09`).

## Secure production configuration checklist

No hosted configuration is changed by Gate 6A local work.

- [ ] Confirm `AUTH_SECRET` is present, stable and at least 32 characters before deployment; never print it.
- [ ] After the remediated app is deployed and verified, remove obsolete `MOBILE_SECRET` and `EXPO_PUBLIC_MOBILE_SECRET` from hosted/build configuration; no rotation is required merely to remove the invalid design assumption.
- [ ] Keep `DATABASE_URL`, `RESEND_API_KEY`, `CRON_SECRET`, `OPENWEATHER_API_KEY` and `SENTRY_AUTH_TOKEN` server-only.
- [ ] Treat `NEXT_PUBLIC_APP_URL`, release labels, public Sentry DSN/sampling and `EXPO_PUBLIC_BASE_URL` as public configuration.
- [ ] Confirm Vercel remains the trusted edge for production client-IP headers; a future reverse proxy requires an explicit trusted-proxy design. Outside Vercel (`VERCEL` is not `1`) every caller of the shared helper (signup, email status, mobile sign-in, password reset) deliberately shares one `unknown` rate-limit bucket, so a non-Vercel production host would throttle all users together (for example signup at 5 per hour and mobile sign-in at 20 per 15 minutes in total). Do not deploy to another host without that design. Known exception: two public read-only routes (`GET /api/matches`, `GET /api/stats`) use the raw `X-Forwarded-For` header on every host (runbook section 7, TD-4).
- [ ] Credential hygiene for the removed utility pages: they hard-coded a super-administrator email address and two plaintext temporary passwords, and the repository is public, so Git history still contains them. Treat those passwords as exposed. Owner to confirm, without printing or logging any password, that no production account has used them, force a reset for any account that did, and keep the super-administrator password unique. Rewriting history is not proposed here.
- [ ] Review Vercel/Sentry logging and scrubbing so credentials, bearer tokens, raw reset/invite links and full request bodies are never recorded.
- [ ] Confirm production and preview environments do not share credentials unnecessarily. Open: the status is held in a private operator record and needs a separate operational approval before any further Gate 6A branch is pushed; see runbook section 12 and `6A-Q11`.
- [ ] Document secret ownership, rotation, incident response and rollback without exposing values.

# NovaChrono finalisation Gate 1 report

Prepared 2026-10-07. This report records the pre-commit Gate 1 state and the exact evidence available in this checkout. Commit SHAs and final remote state are recorded in the task handoff because a commit cannot contain its own SHA.

## A. Baseline verification

- Initial working tree: clean.
- Branch: `astra/critical-stabilisation`.
- HEAD: `2d10ea793b8130daabbdaefdc27c532791e010f2` (`fix: stabilise critical access and onboarding boundaries`).
- `git merge-base HEAD origin/railway-clean`: `7d4bb58d4cc9f240ad3c2809160e2fb8f8adb823`.
- The expected last-five log and GitHub origin were confirmed before edits.
- Work was performed in an isolated clone; the original checkout was not modified.

## B. Git preservation / remote branch result

- GitHub `main` resolves to `ddb96e89d733dcf18063545291e1a8d7811fde50`.
- GitHub `railway-clean` resolves to `7d4bb58d4cc9f240ad3c2809160e2fb8f8adb823`.
- GitHub currently has neither `astra/critical-stabilisation` nor `archive/pre-v1-main-2026-10`.
- A local lightweight tag `archive/pre-v1-main-2026-10` now preserves the confirmed old-main commit without joining the unrelated histories.
- Normal non-force pushes of the verified baseline and archival tag were attempted. GitHub rejected both with HTTP 403 because the available credential authenticates as `Smartsure2020`, which lacks write permission to `only1obijuan-arch/NovaChrono`.
- No default branch, deploy branch, history, or remote ref was changed.

Operator action after authenticating an identity with write permission:

    git push origin astra/critical-stabilisation
    git push origin refs/tags/archive/pre-v1-main-2026-10

Then verify both with `git ls-remote`; do not force-push or switch the default/deploy branches as part of this action.

## C. `a7bdfb3` investigation

- The object was absent from the target clone and GitHub refs, but present in a different local checkout.
- Full SHA: `a7bdfb307471f1d055a09b977ff6073a08d91f84`.
- Subject: `debug server`.
- Date: `2026-06-05T19:58:52+02:00`.
- Parent: `7d4bb58d4cc9f240ad3c2809160e2fb8f8adb823`.
- Diffstat: 5 files, 145 insertions, 31 deletions.
- Files: `src/app/admin/league/[id]/print/page.jsx` (new), `src/app/admin/league/print/page.jsx`, `src/app/admin/page.jsx`, `src/app/api/matches/route.js`, and `src/components/LeagueDetail/LeagueHeader.jsx`.
- Relationship: it and `2d10ea7` are sibling commits whose merge base is `railway-clean` (`7d4bb58`). It is not an ancestor of the active lineage.
- Some capabilities have analogues in the active baseline (weekly report/captain message and a non-dynamic print route), but the implementations and match-route changes are not equivalent. The dynamic print route is absent from the active lineage.
- It was not merged, cherry-picked, rebased, reset to, or reconstructed.

## D. Production schema truth / schema drift

Production access was unavailable: no production `DATABASE_URL`, read-only credential/certificate, Sentry credential, or `pg_dump` executable was present. No production/staging query or migration was attempted. [schema-drift-gate1.md](./schema-drift-gate1.md) contains the safe schema-only export process, comparison matrix, known uncertainty, and forward-migration rule. Historical migrations were not edited.

This remains an explicit Gate 1 acceptance blocker until an authorised read-only export is compared.

## E. Runtime crash fixes

`weekdayLabel` now accepts integers, numeric strings, and canonical day names with safe invalid-value handling. `leagueDayLabel` is shared by both reproduced crash sites. Regression coverage exercises days 0, 1, 6, numeric strings, names, and invalid values. Browser scenarios render integer `day_of_week: 2` in both the venue dashboard and league detail.

The duplicate root routes `src/app/page.js` and `src/app/page.jsx` were also surfaced by the real dev server. The older redirect-only `page.js` was removed so the newer public landing page is unambiguous.

## F. Dependency remediation

- Next.js `16.2.1` → `16.3.8`.
- `eslint-config-next` `16.2.1` → `16.3.8`.
- Auth.js core `^0.41.0` → exact `0.41.3`.
- `next-auth` `^5.0.0-beta.30` → exact `5.0.0-beta.32`.
- Resend `^6.10.0` → exact `6.32.1`.
- Added Sentry `11.4.0` and Playwright `1.63.0`.
- A compatible, non-forced audit fix updated transitive packages. `npm audit fix --force` was never used.
- Production advisories moved from 11 (4 moderate, 4 high, 3 critical) to 0.

## G. CI + Playwright

One CI workflow performs locked install, 214 unit/contract tests, lint, production build, Chromium install, six browser smoke scenarios, production audit, and a lightweight secret/private-key check. Playwright runs against the production build with deterministic browser-level API/session fixtures and no database mutation.

Covered shells: sign-in, venue-admin dashboard, league detail, captain team, referee, and public standings/results.

## H. Lint result

ESLint is 0 errors and 0 warnings, down from the historical 133 errors / 9 warnings. No lint rule or file was disabled. Decorative `//` product microcopy was converted to normal labels; remaining hook, ref, purity, link, image, and accessibility findings were fixed narrowly.

## I. Health + Sentry

`/api/health` returns safe alive/version/environment/readiness data, performs a lightweight database query, reads migration state only if the metadata table exists, returns a safe 503 on failure, and never exposes raw configuration or errors.

Current supported Sentry foundation is present for client, server, edge, global errors, release, and environment. It is disabled when no DSN is supplied; source-map upload additionally requires `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN`. External project/DSN provisioning remains blocked on credentials. Mobile rollout is documented but deliberately not forced into Gate 1.

## J. Design-system foundations

Central background/surface/text/border/accent/state/radius/spacing/motion/font tokens, focus-visible behavior, and reduced-motion support were added. Runtime Google CSS imports were removed in favor of local system stacks and existing bundled mobile fonts. Mechanically touched product surfaces now use shared font tokens where safe; no broad screen redesign occurred.

## K. Documentation

Create Next App boilerplate was replaced with product model, stacks, Node/npm assumptions, setup, verification, explicit migration safety, environment names, providers, branch lineage, Sentry requirements, mobile setup, and deployment safety. `.env.example` contains names/placeholders only.

## L. Test/build/audit results

- Vitest: 12 files, 214 tests passed (198 historical + 16 Gate 1 regression/readiness tests).
- Playwright: 1 file, 6 scenarios passed.
- ESLint: 0 errors, 0 warnings.
- Production build: passed on Next.js 16.3.8; explicit Turbopack root removed the parent-lockfile warning. The separate Next middleware-to-proxy deprecation warning is deferred.
- Production dependency audit: 0 low, 0 moderate, 0 high, 0 critical.
- Migration preflight: three tests pass, including an assertion that status mode emits no DDL/DML/transaction statements.
- `git diff --check`: passed.
- Pre-commit working tree: intentionally contains the Gate 1 changes below. Final post-commit status is recorded in the task handoff.

## M. Changed-file inventory

Every intended source change is listed below. “Presentation” means visible copy/style/accessibility changed but domain behavior did not.

| Path | Purpose | Behavior impact |
|---|---|---|
| `.env.example` | Safe environment-name baseline | No runtime change |
| `.github/workflows/ci.yml` | Single repeatable verification workflow | Tooling only |
| `.gitignore` | Ignore Playwright artifacts; allow example env | Tooling only |
| `README.md` | Replace boilerplate with Nova setup/safety docs | Documentation only |
| `docs/gate1-report.md` | Gate evidence, inventory, blockers | Documentation only |
| `docs/schema-drift-gate1.md` | Read-only schema export/drift process | Documentation only |
| `instrumentation-client.js` | Optional Sentry browser initialization | Yes, only when DSN configured |
| `instrumentation.js` | Optional Sentry server/edge registration | Yes, only when DSN configured |
| `next.config.mjs` | Explicit Turbopack root, images, Sentry wrapper | Build/runtime configuration |
| `package.json` | Controlled dependency/tool scripts | Tooling/runtime dependency versions |
| `package-lock.json` | Reproducible resolved dependency graph | Dependency resolution only |
| `playwright.config.js` | Production-build browser harness | Test tooling only |
| `scripts/migrate.js` | Make status catalogue-only and testable | Yes: status can no longer write; execution remains explicit |
| `sentry.edge.config.js` | Optional edge capture foundation | Yes, only when DSN configured |
| `sentry.server.config.js` | Optional server capture foundation | Yes, only when DSN configured |
| `vitest.config.js` | Exclude Playwright tests from Vitest | Test tooling only |
| `mobile/global.css` | Remove runtime Google import | Presentation only |
| `mobile/src/app/(captain-tabs)/index.jsx` | Remove decorative microcopy/font literals | Presentation only |
| `mobile/src/app/(captain-tabs)/more.jsx` | Remove decorative microcopy/font literals | Presentation only |
| `mobile/src/app/(captain-tabs)/schedule.jsx` | Remove decorative microcopy | Presentation only |
| `mobile/src/app/(captain-tabs)/standings.jsx` | Remove decorative microcopy | Presentation only |
| `mobile/src/app/(referee-tabs)/history.jsx` | Remove decorative microcopy | Presentation only |
| `mobile/src/app/(referee-tabs)/index.jsx` | Remove decorative microcopy; valid apostrophe | Presentation only |
| `mobile/src/app/(referee-tabs)/profile.jsx` | Remove decorative microcopy/font literals | Presentation only |
| `mobile/src/app/auth/forgot-password.jsx` | Remove decorative microcopy; lint-safe copy | Presentation only |
| `mobile/src/app/auth/login.jsx` | Remove decoration; correct router dependency | Behavior preserved; effect dependency corrected |
| `mobile/src/app/auth/role-select.jsx` | Stable Animated values without render ref reads | Behavior preserved; animation lifecycle corrected |
| `mobile/src/app/auth/signup.jsx` | Remove decorative microcopy/font literals | Presentation only |
| `mobile/src/app/captain/join-league.jsx` | Remove decorative microcopy | Presentation only |
| `mobile/src/app/players/manage.jsx` | Remove decorative microcopy/font literals | Presentation only |
| `mobile/src/app/referee/match/[id].jsx` | Remove decorative microcopy/font literals | Presentation only |
| `mobile/src/app/rules/[leagueId].jsx` | Remove decorative microcopy/font literals | Presentation only |
| `src/__tests__/health.test.js` | Health readiness/redaction regression tests | Tests only |
| `src/__tests__/migration-status.test.js` | Prove status mode is read-only | Tests only |
| `src/__tests__/weekday.test.js` | Numeric/string weekday regression coverage | Tests only |
| `src/app/account/accept-invite/page.jsx` | Remove decorative microcopy/font literals | Presentation only |
| `src/app/account/forgot-password/page.jsx` | Remove decoration; lint-safe copy | Presentation only |
| `src/app/account/reset-password/page.jsx` | Remove decorative microcopy/font literals | Presentation only |
| `src/app/account/signin/page.jsx` | Decoration cleanup, accessible labels, stable effects/image | Accessibility/presentation; sign-in flow preserved |
| `src/app/account/signup/page.jsx` | Stable join-code initialization and image handling | Behavior preserved; query code initializes deterministically |
| `src/app/account/verify/page.jsx` | Framework-native internal redirect | Behavior preserved |
| `src/app/admin/create-league/page.jsx` | Remove decorative microcopy/font literals | Presentation only |
| `src/app/admin/league/[id]/page.jsx` | Remove decorative microcopy/font literals | Presentation only |
| `src/app/admin/onboarding/page.jsx` | Stable pending-venue initialization | Behavior preserved |
| `src/app/admin/page.jsx` | Decoration cleanup and optimized weather image contract | Presentation only |
| `src/app/api/admin/accept-invite/route.js` | Remove decorative email copy | Output copy only |
| `src/app/api/auth/confirm-availability/route.js` | Remove remote font/decorative response copy | HTML presentation only |
| `src/app/api/auth/request-reset/route.js` | Remove decorative email copy | Output copy only |
| `src/app/api/health/route.js` | Safe health/readiness endpoint | New operational behavior |
| `src/app/api/send-match-reminder/route.js` | Remove decorative email copy | Output copy only |
| `src/app/api/super-admin/invite-venue-admin/route.js` | Remove decorative email copy | Output copy only |
| `src/app/api/utils/captain-welcome.js` | Remove decorative email copy | Output copy only |
| `src/app/captain/rules/[leagueId]/page.jsx` | Decoration cleanup and framework link | Navigation preserved; presentation only |
| `src/app/captain/team/[id]/page.jsx` | Remove decorative labels/font literals | Presentation only |
| `src/app/captain/team/page.jsx` | Shared weekday reader and normal labels | Presentation; numeric weekday now safe |
| `src/app/global-error.jsx` | Sentry-aware global error boundary | New operational error capture/fallback |
| `src/app/globals.css` | Central tokens, focus, reduced motion | Shared presentation/accessibility foundation |
| `src/app/layout.js` | Remove network-fetched fonts | Presentation/build reliability |
| `src/app/league/[id]/page.jsx` | Normal labels, shared weekday reader, framework link | Presentation; numeric weekday now safe |
| `src/app/match/[id]/page.jsx` | Remove decorative labels/font literals | Presentation only |
| `src/app/org-admin/page.jsx` | Remove decorative labels/font literals | Presentation only |
| `src/app/page.js` | Remove obsolete duplicate root redirect | Yes: resolves root route to canonical public landing page |
| `src/app/page.jsx` | Normal product labels/lint-safe copy | Presentation only |
| `src/app/referee/match/[id]/page.jsx` | Derive match display state; pure timer initialization | Behavior preserved; removes render/effect impurity |
| `src/app/referee/page.jsx` | Normal labels and framework home link | Navigation/presentation preserved |
| `src/app/super-admin/page.jsx` | Normal labels and framework home link | Navigation/presentation preserved |
| `src/components/AdminDashboard/AdminDashboardStyles.jsx` | Normal labels/font tokens | Presentation only |
| `src/components/AdminDashboard/CredentialsModal.jsx` | Remove decorative copy | Presentation only |
| `src/components/AdminDashboard/DashboardHeader.jsx` | Remove decorative copy | Presentation only |
| `src/components/AdminDashboard/GenerateRefereeModal.jsx` | Remove decorative copy | Presentation only |
| `src/components/AdminDashboard/LeagueCard.jsx` | Shared safe league-day formatter | Yes: fixes numeric weekday crash |
| `src/components/AdminDashboard/LeaguesSection.jsx` | Remove decorative copy | Presentation only |
| `src/components/AdminDashboard/Navigation.jsx` | Framework home link | Navigation preserved |
| `src/components/AdminDashboard/RefereesSection.jsx` | Remove decorative copy/font literals | Presentation only |
| `src/components/LeagueDetail/AddTeamModal.jsx` | Remove decorative copy | Presentation only |
| `src/components/LeagueDetail/LeagueDetailStyles.jsx` | Normal labels/font tokens | Presentation only |
| `src/components/LeagueDetail/LeagueHeader.jsx` | Shared safe day formatter and normal labels | Yes: fixes numeric weekday crash |
| `src/components/LeagueDetail/ManageTeamModal.jsx` | Remove decorative copy | Presentation only |
| `src/components/LeagueDetail/NewSeasonModal.jsx` | Remove decorative copy | Presentation only |
| `src/components/LeagueDetail/OverviewTab.jsx` | Remove decorative copy/font literals | Presentation only |
| `src/components/LeagueDetail/StandingsTab.jsx` | Remove decorative copy/font literals | Presentation only |
| `src/components/LeagueDetail/TeamsTab.jsx` | Remove decorative copy/font literals | Presentation only |
| `src/components/NotificationBell.jsx` | Pure relative time and accessible icon control | Accessibility; behavior preserved |
| `src/components/OrganizationManagement/AddAdminModal.jsx` | Remove decorative copy | Presentation only |
| `src/components/OrganizationManagement/AddVenueModal.jsx` | Remove decorative copy | Presentation only |
| `src/components/OrganizationManagement/AdminCredentialsModal.jsx` | Normal labels/font tokens | Presentation only |
| `src/components/OrganizationManagement/AdminsSection.jsx` | Remove decorative copy | Presentation only |
| `src/components/OrganizationManagement/InviteVenueAdminModal.jsx` | Remove decorative copy | Presentation only |
| `src/components/OrganizationManagement/OrganizationHeader.jsx` | Remove decorative copy | Presentation only |
| `src/components/OrganizationManagement/OrganizationStyles.jsx` | Normal labels/font tokens | Presentation only |
| `src/components/OrganizationManagement/VenuesSection.jsx` | Remove decorative copy | Presentation only |
| `src/emails/inviteOrgAdminEmail.js` | Normal email labels | Output copy only |
| `src/emails/inviteVenueAdminEmail.js` | Normal email labels | Output copy only |
| `src/emails/verifyEmail.js` | Normal email labels | Output copy only |
| `src/utils/printCredentials.js` | Normal printed labels | Output copy only |
| `src/utils/weekday.js` | Canonical safe weekday/league labels | Yes: shared crash fix |
| `tests/e2e/smoke.spec.js` | Six browser runtime scenarios | Tests only |

`AGENTS.md` and `CLAUDE.md` are local, ignored instruction files and are intentionally not part of Gate 1.

## N. Deferred findings for Gate 2+

- Obtain and reconcile the real production schema before any forward domain migration.
- Complete the Gate 2 authentication/authorization/schema programme exactly as separately approved.
- Keep referee command HTTP semantics and transaction work together in Gate 3; no opportunistic `res.ok` half-fix was made.
- Handle fixture/standings/season work in Gate 4, communications reliability in Gate 5, and broad UX/accessibility/deployment/default-branch work in Gate 6.
- Convert deprecated Next middleware convention to proxy in a separately reviewed change; the current behavior and tests remain intact.
- Provision Sentry web credentials and decide mobile release integration externally.

## O. Commit SHA(s) and remote branch state

The task handoff records the resulting local commit SHA(s). GitHub publication is credential-blocked as described in section B; no merge is authorised or performed.

## P. Gate 1 acceptance matrix

| Criterion | Result |
|---|---|
| Verified canonical baseline | PASS |
| `a7bdfb3` inspected and not incorporated | PASS |
| Historical main preserved locally without graph rewrite | PASS locally / BLOCKED remotely (403) |
| Recovered branch present on origin | BLOCKED (403) |
| Production schema obtained read-only or inability documented | DOCUMENTED BLOCKER |
| Historical migrations unchanged | PASS |
| Migration status performs no writes | PASS |
| Numeric weekday crashes fixed | PASS |
| Browser runtime smoke exists and passes | PASS |
| CI baseline exists | PASS locally; remote run awaits push |
| Build/tests/lint/audit green | PASS |
| Next root explicit | PASS |
| Health endpoint | PASS |
| Sentry foundation | PASS; external credentials pending |
| README and safe env example | PASS |
| Mechanical design/accessibility foundation | PASS |
| No production/staging mutation or deployment | PASS |
| No default/deploy switch, force push, or history rewrite | PASS |

Gate 1 implementation is locally complete. Acceptance cannot truthfully be marked fully passed until the authorised GitHub pushes and production schema evidence are supplied.

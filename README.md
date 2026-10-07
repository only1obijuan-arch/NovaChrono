# NovaChrono

NovaChrono is an indoor-football league management and live match operations platform. It supports public competition views plus role-specific workflows for captains, referees, venue administrators, organisation administrators and platform administrators.

## Product model

    Organisation
      └─ Venue
          └─ League / season
              ├─ slots and teams
              ├─ players and captains
              ├─ fixtures and referee assignments
              └─ match events, results and standings

The web application is a Next.js App Router service backed by PostgreSQL/Neon. The mobile application is an Expo/React Native client for captain and referee workflows.

## Runtime baseline

- Node.js 22
- npm with the committed package-lock.json
- Next.js 16 / React 19
- PostgreSQL (Neon-compatible connection)
- Expo 54 / React Native 0.81 for mobile

Use npm ci rather than regenerating the lockfile during ordinary setup.

## Local setup

1. Copy .env.example to .env.local and supply development-only values.
2. Install the locked dependencies:

       npm ci

3. Inspect migration state with the read-only status command:

       npm run migrate:status

4. Apply migrations only to an explicitly selected non-production database when authorised:

       npm run migrate

5. Start the web application:

       npm run dev

The migration command is never an implicit startup step. Production migrations require a backup, reviewed forward migration and explicit release approval.

## Verification commands

    npm test
    npm run lint
    npm run build
    npx playwright install chromium
    npm run test:e2e
    npm audit --omit=dev

The Playwright suite starts a local web server and uses browser-level mocked API fixtures. It verifies that the main shells render without requiring or mutating a database. It is intentionally a small Gate 1 smoke suite, not complete business-flow coverage.

## Environment variables

The authoritative variable-name baseline is .env.example. Important groups are:

- Database/authentication: DATABASE_URL, AUTH_SECRET, MOBILE_SECRET
- Public URLs/mobile: NEXT_PUBLIC_APP_URL, EXPO_PUBLIC_BASE_URL
- Providers: RESEND_API_KEY, RESEND_FROM_EMAIL, OPENWEATHER_API_KEY
- Scheduled jobs: CRON_SECRET
- Sentry: SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT and SENTRY_AUTH_TOKEN
- Release identity: APP_VERSION or platform commit-SHA variables

EXPO_PUBLIC_* values are embedded in the mobile application and are not secrets. Never commit real credentials or production exports.

## Database and schema truth

Migrations under migrations/ are historical, forward-only records. schema.sql is a reference snapshot, not permission to rewrite applied migrations. scripts/migrate.js --status is catalogue-only and does not create schema_migrations.

Production schema access was unavailable during Gate 1. The exact read-only export and drift-comparison procedure is documented in docs/schema-drift-gate1.md. Do not run a production migration until that comparison and the later forward-migration plan are approved.

## External services

- Neon/PostgreSQL for relational data
- Auth.js credentials/JWT authentication
- Resend for email
- Expo for mobile notifications and releases
- OpenWeather for venue weather context
- Sentry for web error visibility once a NovaChrono project/DSN is provisioned

Sentry code is safe when no DSN is configured: capture is disabled. Source-map upload additionally requires SENTRY_ORG, SENTRY_PROJECT and SENTRY_AUTH_TOKEN in trusted CI/deployment secrets.

## Repository and branch safety

The recovered active lineage is astra/critical-stabilisation, descended from railway-clean. The historical remote main is a disconnected lineage and must not be merged merely to make the graph look tidy. Gate 1 work must be pushed as a normal branch without force; changing the GitHub default branch or Railway deployment branch is a later, separately approved action.

At the start of Gate 1, this machine could read the remote but its configured GitHub identity did not have write permission. See docs/gate1-report.md for the exact preservation state and remaining operator actions.

## Mobile

The Expo project lives in mobile/.

    cd mobile
    npm ci
    npm start

Mobile release configuration and store deployment are outside Gate 1. Do not publish a mobile build merely to verify the web baseline.

## Deployment safety

No deployment should proceed from a workstation-only state. A release requires a protected canonical branch, green CI, an approved schema/migration plan, environment verification, backup/rollback evidence and post-deploy health checks. Gate 1 does not switch defaults, deploy or mutate production/staging data.

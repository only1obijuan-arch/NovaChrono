# Gate 1 production schema truth

## Status

Production schema export was not available in the Gate 1 execution environment. No DATABASE_URL, database certificate, read-only database credential or pg_dump executable was available. No production or staging database query was attempted, and no migration was run.

The checked-in files therefore remain reference evidence only:

- schema.sql
- migrations/0001_initial.sql
- migrations/0002_add_unique_league_slots.sql
- application queries under src/app

This is an explicit Gate 1 acceptance blocker, not permission to infer production state.

## Safe operator process

Use a database account that has CONNECT and catalogue/schema read access only. It must not own application objects and must not have CREATE, INSERT, UPDATE, DELETE, TRUNCATE or ALTER privileges.

    pg_dump "$DATABASE_URL_READ_ONLY" \
      --schema-only \
      --no-owner \
      --no-privileges \
      --file novachrono-production-schema.sql

The export contains definitions only, not row data. Review it for security-sensitive comments before sharing. Record the database host/environment and export timestamp separately; never put a credential in the file or repository.

For a catalogue-only fallback, a read-only operator can export tables, columns, types, defaults, nullability, constraints, indexes, foreign keys, functions, triggers and extensions from pg_catalog/information_schema. Do not use npm run migrate:status against production until the Gate 1 implementation containing its read-only fix is deployed or run from a trusted workstation.

## Required comparison

Compare the production export to the three checked-in schema artefacts and to every column referenced by application SQL. At minimum resolve:

| Area | Evidence to verify | Why |
|---|---|---|
| Auth.js users/accounts | id types, email verification, password/account columns, session tables | Application and historical migrations may reflect different Auth.js stages |
| League scoring | points_win, points_draw, forfeit_score_home, forfeit_score_away | Reported in a live environment but absent from the checked-in baseline |
| Push notifications | auth_users.push_token or device-token structure | The application currently attempts request-time DDL |
| Notifications | allowed type constraint | Current writers and checked-in constraint disagree |
| Match lifecycle | timestamps, score/status constraints, referee FK | Critical runtime expectations |
| Migration metadata | table existence and applied names | Needed before any forward migration plan |

## Gate 2 handoff rule

Do not edit 0001 or 0002 to imitate production. Once the export is reviewed, Gate 2 must define forward-only migrations that converge each supported starting schema. Any duplicate cleanup must preserve dependent references and be rehearsed on a restored copy before production.

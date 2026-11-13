-- =====================================================================================================
-- NovaChrono Gate 6A - READ-ONLY catalogue and data-census queries (initial publication version)
--
-- STATUS: PREPARED ONLY - NOT APPROVED FOR EXECUTION.
--   * This is the initial publication version. It has not been executed, and has not been parsed by a
--     PostgreSQL server, anywhere (hosted or local). Its first run, even on a disposable local database, needs
--     a separate recorded approval, and the first run of any version must be treated as an unreviewed run of
--     untested text.
--   * It uses no dynamic SQL (see "NO DYNAMIC SQL" below).
--
-- PURPOSE (design document sections A and E; runbook section 1 steps 3-5; privacy readiness section 1):
--   * confirm what the real catalogue looks like before migration 0011 (tables, columns, constraints);
--   * measure, with COUNTS ONLY, how much data sits in the places the account lifecycle does not yet handle
--     (auth_sessions, players.user_id / players.name, join_requests, audit-log JSON and free text);
--   * report the 0011 preconditions exactly as the migration will evaluate them;
--   * (optional section 8) count venues whose operational cover relies on a super administrator, to inform
--     decisions 6A-Q01 and 6A-Q02.
--
-- WHAT IT DOES NOT DO (reviewers: please verify each point on the text below):
--   * It never outputs a personal value. Every result is a count, a length, a boolean, a year-month bucket, a
--     category label that passed a shape or allow-list test, or catalogue metadata (names of tables, columns,
--     indexes, constraints, migrations). No name, email address, phone number, password, hash, token, session
--     value, push token, IP address, audit reason text or JSON value is selected for output.
--   * It writes nothing. It runs in a READ ONLY transaction that is always ROLLED BACK, with statement, lock and
--     idle timeouts, and it stops (see "Read-only is verified, not assumed") if the transaction is not read-only.
--     It creates no objects, calls no volatile function, and uses no dynamic SQL.
--   * It never reads a credential. No password-hash column is read; the only auth_accounts column it reads is
--     provider.
--
-- NO DYNAMIC SQL. This file does not use query_to_xml() or any other function that executes a query given as
-- text (a common way to make an absent legacy table produce NULL instead of an error). It uses only fixed
-- statements. Whether a production-only object exists is decided in section 0 from the catalogue and kept
-- in psql variables (\gset); each section that reads a legacy object sits inside a psql \if block, and a skipped
-- block is never sent to the server. Consequences the reviewer should know:
--   * psql 10 or later is required (\if, \gset). Any other client cannot run this file unchanged; run the
--     statements of one section at a time and run sections 3-5 only for objects that section 0 reported present.
--   * Text-mode substitution of the gate values (:'g_...') is the only client-side interpolation. It inserts the
--     quoted string 't' or 'f' produced by section 0, never operator input.
--   * An absent object is reported as a "not run" row, not as NULL.
--
-- HOW TO RUN (only after separate approval): connect with a dedicated read-only role (below), or to a read
-- replica or a point-in-time branch of the database, then
--     psql -X -v ON_ERROR_STOP=1 -f readonly-catalogue-census.sql
-- Review the output before sharing it and store it with the approval record. The output contains no personal
-- data by construction, but category labels come from the live database (see OUTPUT RULES).
--
-- MINIMUM DATABASE PRIVILEGES (operator step; none of this is executed by the file). Create a role that can do
-- nothing but read these columns, and make it read-only by default:
--     ALTER ROLE census_reader SET default_transaction_read_only = on;
--     GRANT CONNECT ON DATABASE <database> TO census_reader;
--     GRANT USAGE ON SCHEMA public TO census_reader;
--     GRANT SELECT (id, email, role, venue_id, organization_id, "emailVerified", image, push_token)
--           ON public.auth_users TO census_reader;                 -- add account_status once 0011 is applied
--     GRANT SELECT (provider)                       ON public.auth_accounts TO census_reader;
--     GRANT SELECT (name)                           ON public.schema_migrations TO census_reader;
--     GRANT SELECT (action_by, action_type, old_value, new_value, reason, created_at)
--           ON public.audit_logs TO census_reader;
--     GRANT SELECT (expires_at)                     ON public.mobile_sessions TO census_reader;
--     GRANT SELECT (expires_at)                     ON public.password_reset_tokens TO census_reader;
--     GRANT SELECT (expires)                        ON public.auth_verification_token TO census_reader;
--     GRANT SELECT (used, expires_at)               ON public.invite_tokens TO census_reader;
--     GRANT SELECT (created_at)                     ON public.notifications TO census_reader;
--     GRANT SELECT (attempts)                       ON public.auth_rate_limits TO census_reader;
--     GRANT SELECT (window_start)                   ON public.api_rate_limits TO census_reader;
--     GRANT SELECT (captain_user_id, status)        ON public.teams TO census_reader;
--     GRANT SELECT (referee_id, status)             ON public.matches TO census_reader;
--     GRANT SELECT (id, organization_id)            ON public.venues TO census_reader;
--     GRANT SELECT (venue_id, status)               ON public.leagues TO census_reader;
--     GRANT SELECT (id)                             ON public.organizations TO census_reader;
--     GRANT SELECT (player_id)                      ON public.match_events TO census_reader;
--   and, only for the production-only legacy objects that section 0 reports present:
--     GRANT SELECT ("userId", expires)              ON public.auth_sessions TO census_reader;
--     GRANT SELECT (name, user_id, is_active)       ON public.players TO census_reader;
--     GRANT SELECT (captain_name, captain_email, captain_phone, created_at, status)
--           ON public.join_requests TO census_reader;
--   Every column above is read only to count, measure a length or test for NULL; email, push_token, image,
--   players.name, players.user_id, the join_requests captain_* columns, audit_logs.reason/old_value/new_value and
--   auth_sessions."userId" are nevertheless personal data, so the role can read them and the run needs the same
--   approval as any access to personal data. Catalogue views (pg_class, pg_attribute, pg_constraint, pg_indexes)
--   are readable without table privileges. Section 0 reports whether the connected role is a superuser or can
--   write to any public table; neither is acceptable for a run, and both are recorded so a reviewer can see it.
--
-- READ-ONLY IS VERIFIED, NOT ASSUMED. BEGIN READ ONLY is only honoured when it is the statement that opens the
-- transaction: under `psql -1` (or a pooler that already opened one) it is a warning, not a restriction.
-- The file therefore (1) repeats SET TRANSACTION READ ONLY inside the transaction and (2) divides by zero in
-- section 0 unless transaction_read_only = on, which aborts the transaction, so every later statement fails.
--
-- OUTPUT RULES (small cells and labels):
--   * Exact counts are given only for structural facts: table row totals, the migration preconditions, role
--     totals and the administrator-cover figures of section 8.
--   * Any other count (an attribute of, or a category inside, a table) is shown as '<5' when it is 1 to 4, and as
--     0 when it is 0. A population of fewer than 5 rows hides its dates and lengths ('(population < 5)').
--   * A category label is printed only if it passes an allow-list or a shape test (lower-case words, upper-case
--     action codes, identifier-like JSON keys); anything else is bucketed as '(other)'. A '(other)' row is a
--     signal for a follow-up query that needs its own approval, not something to be investigated ad hoc.
--   * Results are ordered by label, never by count.
--
-- Dependencies: PostgreSQL 13 or later; psql 10 or later.
-- =====================================================================================================

\set ON_ERROR_STOP on

BEGIN READ ONLY;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '2s';
SET LOCAL idle_in_transaction_session_timeout = '120s';

-- ----- 0. Fail-closed checks, role report and catalogue gates ------------------------------------------------
-- 0a. Division by zero (and therefore an aborted transaction) unless the transaction is really read-only.
SELECT current_setting('transaction_read_only')                                                  AS transaction_read_only,
       1 / (CASE WHEN current_setting('transaction_read_only') = 'on' THEN 1 ELSE 0 END)         AS read_only_guard_value;

-- 0b. Where and as whom this ran (recorded with the approval).
SELECT current_database()                         AS database_name,
       current_setting('server_version')          AS server_version,
       current_setting('TimeZone')                AS session_time_zone,
       current_user                               AS connected_role,
       (SELECT r.rolsuper FROM pg_roles r WHERE r.rolname = current_user)                      AS role_is_superuser,
       (SELECT bool_or(has_table_privilege(current_user, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE'))
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p'))                                AS role_can_write_a_public_table;

-- 0c. Gates for production-only or version-dependent objects. Catalogue lookups only (they do not depend on the
--     role's table privileges). 't' means the section that needs the object will run.
SELECT
  to_regclass('public.schema_migrations') IS NOT NULL AS g_migrations,
  EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('public.auth_users')
          AND a.attname = 'account_status' AND a.attnum > 0 AND NOT a.attisdropped) AS g_account_status,
  (SELECT count(*) = 2 FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.auth_sessions') AND a.attnum > 0 AND NOT a.attisdropped
     AND (a.attname = 'userId'
          OR (a.attname = 'expires' AND a.atttypid IN ('timestamptz'::regtype, 'timestamp'::regtype)))) AS g_sessions,
  EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('public.players')
          AND a.attname = 'name' AND a.attnum > 0 AND NOT a.attisdropped) AS g_players_name,
  EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('public.players')
          AND a.attname = 'user_id' AND a.attnum > 0 AND NOT a.attisdropped) AS g_players_user_id,
  EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('public.players')
          AND a.attname = 'is_active' AND a.atttypid = 'boolean'::regtype
          AND a.attnum > 0 AND NOT a.attisdropped) AS g_players_is_active,
  (to_regclass('public.players') IS NOT NULL
   AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('public.match_events')
               AND a.attname = 'player_id' AND a.attnum > 0 AND NOT a.attisdropped)) AS g_player_events,
  (SELECT count(*) = 4 FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.join_requests') AND a.attnum > 0 AND NOT a.attisdropped
     AND (a.attname IN ('captain_name', 'captain_email', 'captain_phone')
          OR (a.attname = 'created_at' AND a.atttypid IN ('timestamptz'::regtype, 'timestamp'::regtype)))) AS g_join_requests,
  EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('public.join_requests')
          AND a.attname = 'status' AND a.attnum > 0 AND NOT a.attisdropped) AS g_join_status
\gset

SELECT :'g_migrations'      AS schema_migrations_present,
       :'g_account_status'  AS account_status_column_present,
       :'g_sessions'        AS auth_sessions_queryable,
       :'g_players_name'    AS players_name_present,
       :'g_players_user_id' AS players_user_id_present,
       :'g_players_is_active' AS players_is_active_present,
       :'g_player_events'   AS match_events_player_id_present,
       :'g_join_requests'   AS join_requests_queryable,
       :'g_join_status'     AS join_requests_status_present;

-- ----- 1. Migration history and the preconditions migration 0011 will evaluate ------------------------------
-- 1a. The recorded migration names (file names only).
\if :g_migrations
SELECT name AS recorded_migration FROM public.schema_migrations ORDER BY name;
\else
SELECT 'not run: schema_migrations is absent' AS recorded_migration;
\endif

-- 1b. The three conditions 0011 checks before changing anything. Expected before 0011:
--     recorded_0010 = true, recorded_0011 = false, account_status_column_exists = false,
--     reserved_domain_accounts = 0, canonical_email_duplicate_groups = 0, canonical_email_unique_index = true.
\if :g_migrations
SELECT (SELECT count(*) FROM public.schema_migrations WHERE name = '0010_gate5_availability_notifications.sql') = 1 AS recorded_0010,
       (SELECT count(*) FROM public.schema_migrations WHERE name = '0011_gate6a_account_lifecycle.sql') = 1          AS recorded_0011;
\else
SELECT NULL::boolean AS recorded_0010, NULL::boolean AS recorded_0011;
\endif

SELECT :'g_account_status'::boolean                                                          AS account_status_column_exists,
       (SELECT count(*) FROM public.auth_users WHERE lower(email) LIKE '%@account.invalid')  AS reserved_domain_accounts,
       (SELECT count(*) FROM (SELECT lower(email) FROM public.auth_users GROUP BY lower(email) HAVING count(*) > 1) d)
                                                                                             AS canonical_email_duplicate_groups,
       EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'auth_users_email_lower_unique')
                                                                                             AS canonical_email_unique_index;

-- ----- 2. Catalogue metadata (no row data) ------------------------------------------------------------------
-- 2a. Every base table in public with its planner row estimate (an estimate from statistics, not a count).
SELECT c.relname AS table_name, c.reltuples::bigint AS estimated_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

-- 2b. Columns of the tables the lifecycle touches or must reason about. Read from pg_attribute, not
--     information_schema, so the list does not depend on which columns the role may read.
SELECT c.relname AS table_name, a.attnum AS ordinal_position, a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS data_type, NOT a.attnotnull AS is_nullable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  AND c.relname IN ('auth_users', 'auth_accounts', 'auth_sessions', 'players', 'join_requests', 'audit_logs',
                    'invite_tokens', 'notifications', 'password_reset_tokens', 'mobile_sessions',
                    'auth_verification_token', 'auth_rate_limits', 'api_rate_limits', 'availability_responses')
ORDER BY c.relname, a.attnum;

-- 2c. Columns anywhere in public whose NAME suggests personal data or a person/device identifier. This finds
--     stores the design matrix does not list. Names and types only.
SELECT c.relname AS table_name, a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS data_type
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  AND a.attname::text ~* '(email|e_mail|phone|mobile|cell|msisdn|address|birth|dob|guardian|parent|passport|id_?number|ssn|token|secret|password|passwd|ip_?addr|image|avatar|photo|latitude|longitude|(^|_)lat($|_)|(^|_)lng($|_)|name)'
ORDER BY c.relname, a.attname;

-- 2d. Foreign keys that reference auth_users (the design assumes the restrictive set listed in section A).
--     confdeltype: a = no action, r = restrict, c = cascade, n = set null, d = set default.
SELECT conrelid::regclass::text AS referencing_table, conname AS constraint_name, confdeltype AS on_delete,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'f' AND confrelid = 'public.auth_users'::regclass
ORDER BY 1, 2;

-- 2e. Constraints on the legacy tables (players, join_requests, auth_sessions): is there any account FK?
SELECT conrelid::regclass::text AS table_name, conname AS constraint_name, contype AS constraint_type,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid::regclass::text IN ('players', 'join_requests', 'auth_sessions', 'public.players', 'public.join_requests', 'public.auth_sessions')
ORDER BY 1, 2;

-- ----- 3. auth_sessions (legacy Auth.js adapter table; runtime cleanup deletes rows for a de-identified account) --
SELECT to_regclass('public.auth_sessions') IS NOT NULL AS auth_sessions_exists;

\if :g_sessions
WITH c AS (
  SELECT count(*) AS total_rows,
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.auth_users u WHERE u.id::text = s."userId"::text)) AS matching_accounts,
         count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.auth_users u WHERE u.id::text = s."userId"::text)) AS orphan_rows,
         count(*) FILTER (WHERE s.expires < now()) AS expired_rows,
         count(DISTINCT s."userId"::text) AS distinct_user_ids
  FROM public.auth_sessions s
)
SELECT c.total_rows,
       CASE WHEN c.matching_accounts BETWEEN 1 AND 4 THEN '<5' ELSE c.matching_accounts::text END AS rows_matching_an_account,
       CASE WHEN c.orphan_rows       BETWEEN 1 AND 4 THEN '<5' ELSE c.orphan_rows::text       END AS rows_without_an_account,
       CASE WHEN c.expired_rows      BETWEEN 1 AND 4 THEN '<5' ELSE c.expired_rows::text      END AS expired_rows,
       CASE WHEN c.distinct_user_ids BETWEEN 1 AND 4 THEN '<5' ELSE c.distinct_user_ids::text END AS distinct_user_ids
FROM c;
\else
SELECT 'not run: auth_sessions is absent or lacks "userId" / a timestamp expires column' AS section_3;
\endif

-- ----- 4. players: name, user_id link, and what deleting a player row would do to history ------------------
\if :g_players_name
WITH c AS (
  SELECT count(*) AS total_rows,
         count(*) FILTER (WHERE p.name IS NULL OR btrim(p.name::text) = '') AS blank_or_null_name,
         min(char_length(p.name::text)) AS min_name_length,
         max(char_length(p.name::text)) AS max_name_length
  FROM public.players p
)
SELECT c.total_rows,
       CASE WHEN c.blank_or_null_name BETWEEN 1 AND 4 THEN '<5' ELSE c.blank_or_null_name::text END AS blank_or_null_name,
       CASE WHEN c.total_rows >= 5 THEN coalesce(c.min_name_length, 0)::text ELSE '(population < 5)' END AS min_name_length,
       CASE WHEN c.total_rows >= 5 THEN coalesce(c.max_name_length, 0)::text ELSE '(population < 5)' END AS max_name_length
FROM c;
\else
SELECT 'not run: players.name is absent' AS section_4;
\endif

-- 4a2. Player rows flagged inactive (is_active exists only on the production schema).
\if :g_players_is_active
WITH c AS (
  SELECT count(*) FILTER (WHERE p.is_active IS FALSE) AS inactive_rows FROM public.players p
)
SELECT CASE WHEN c.inactive_rows BETWEEN 1 AND 4 THEN '<5' ELSE c.inactive_rows::text END AS inactive_rows FROM c;
\else
SELECT 'not run: players.is_active (boolean) is absent' AS section_4a2;
\endif

-- 4b. players.user_id (production-only text column with no foreign key). Counts only.
\if :g_players_user_id
WITH c AS (
  SELECT count(*) FILTER (WHERE p.user_id IS NOT NULL AND btrim(p.user_id::text) <> '') AS with_user_id,
         count(DISTINCT p.user_id::text) FILTER (WHERE p.user_id IS NOT NULL AND btrim(p.user_id::text) <> '') AS distinct_user_ids,
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.auth_users u WHERE u.id::text = p.user_id::text)) AS matching_accounts,
         count(*) FILTER (WHERE p.user_id IS NOT NULL AND btrim(p.user_id::text) <> ''
                          AND NOT EXISTS (SELECT 1 FROM public.auth_users u WHERE u.id::text = p.user_id::text)) AS unmatched
  FROM public.players p
)
SELECT CASE WHEN c.with_user_id      BETWEEN 1 AND 4 THEN '<5' ELSE c.with_user_id::text      END AS rows_with_user_id,
       CASE WHEN c.distinct_user_ids BETWEEN 1 AND 4 THEN '<5' ELSE c.distinct_user_ids::text END AS distinct_user_ids,
       CASE WHEN c.matching_accounts BETWEEN 1 AND 4 THEN '<5' ELSE c.matching_accounts::text END AS rows_matching_an_account,
       CASE WHEN c.unmatched         BETWEEN 1 AND 4 THEN '<5' ELSE c.unmatched::text         END AS rows_with_user_id_but_no_account
FROM c;
\else
SELECT 'not run: players.user_id is absent' AS section_4b;
\endif

-- 4c. The roles (a category) of accounts that are also linked to a player row.
\if :g_players_user_id
WITH c AS (
  SELECT CASE WHEN u.role IS NULL THEN '(none)'
              WHEN u.role IN ('captain', 'referee', 'venue_admin', 'org_admin', 'super_admin') THEN u.role
              ELSE '(other)' END AS role_label,
         count(*) AS n
  FROM public.players p JOIN public.auth_users u ON u.id::text = p.user_id::text
  GROUP BY 1
)
SELECT c.role_label AS role, CASE WHEN c.n BETWEEN 1 AND 4 THEN '<5' ELSE c.n::text END AS rows
FROM c ORDER BY c.role_label;
\else
SELECT 'not run: players.user_id is absent' AS section_4c;
\endif

-- 4d. History impact of removing a player row: how many players are referenced by match events
--     (match_events.player_id is ON DELETE SET NULL, so deleting such a player would change event attribution).
\if :g_player_events
WITH c AS (
  SELECT count(DISTINCT e.player_id) AS players_in_events, count(*) AS events_with_player
  FROM public.match_events e WHERE e.player_id IS NOT NULL
)
SELECT CASE WHEN c.players_in_events  BETWEEN 1 AND 4 THEN '<5' ELSE c.players_in_events::text  END AS players_referenced_by_match_events,
       CASE WHEN c.events_with_player BETWEEN 1 AND 4 THEN '<5' ELSE c.events_with_player::text END AS match_events_with_a_player
FROM c;
\else
SELECT 'not run: players or match_events.player_id is absent' AS section_4d;
\endif

-- ----- 5. join_requests (production-only; no account FK; not read or written by the application) -------------
SELECT to_regclass('public.join_requests') IS NOT NULL AS join_requests_exists;

\if :g_join_requests
WITH c AS (
  SELECT count(*) AS total_rows,
         count(*) FILTER (WHERE j.captain_name IS NOT NULL AND btrim(j.captain_name::text) <> '') AS with_name,
         count(*) FILTER (WHERE j.captain_email IS NOT NULL AND btrim(j.captain_email::text) <> '') AS with_email,
         count(*) FILTER (WHERE j.captain_phone IS NOT NULL AND btrim(j.captain_phone::text) <> '') AS with_phone,
         count(DISTINCT lower(j.captain_email::text)) AS distinct_emails,
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.auth_users u WHERE lower(u.email) = lower(j.captain_email::text))) AS matching_accounts,
         min(j.created_at) AS oldest,
         max(j.created_at) AS newest
  FROM public.join_requests j
)
SELECT c.total_rows,
       CASE WHEN c.with_name        BETWEEN 1 AND 4 THEN '<5' ELSE c.with_name::text        END AS rows_with_captain_name,
       CASE WHEN c.with_email       BETWEEN 1 AND 4 THEN '<5' ELSE c.with_email::text       END AS rows_with_captain_email,
       CASE WHEN c.with_phone       BETWEEN 1 AND 4 THEN '<5' ELSE c.with_phone::text       END AS rows_with_captain_phone,
       CASE WHEN c.distinct_emails  BETWEEN 1 AND 4 THEN '<5' ELSE c.distinct_emails::text  END AS distinct_captain_emails,
       CASE WHEN c.matching_accounts BETWEEN 1 AND 4 THEN '<5' ELSE c.matching_accounts::text END AS rows_whose_email_matches_an_account,
       CASE WHEN c.total_rows >= 5 THEN to_char(c.oldest, 'YYYY-MM') ELSE '(population < 5)' END AS oldest_created_month,
       CASE WHEN c.total_rows >= 5 THEN to_char(c.newest, 'YYYY-MM') ELSE '(population < 5)' END AS newest_created_month
FROM c;
\else
SELECT 'not run: join_requests is absent or lacks the captain_* / created_at columns' AS section_5;
\endif

-- 5b. join_requests by status. Only a fixed list of status words is printed; any other value is '(other)', so a
--     status column that ever held free text cannot leak it.
\if :g_join_status
WITH c AS (
  SELECT CASE WHEN j.status IS NULL THEN '(null)'
              WHEN lower(j.status::text) IN ('pending', 'approved', 'rejected', 'accepted', 'declined', 'denied',
                                             'cancelled', 'canceled', 'expired', 'confirmed', 'completed')
                THEN lower(j.status::text)
              ELSE '(other)' END AS status_label,
         count(*) AS n
  FROM public.join_requests j
  GROUP BY 1
)
SELECT c.status_label AS status, CASE WHEN c.n BETWEEN 1 AND 4 THEN '<5' ELSE c.n::text END AS rows
FROM c ORDER BY c.status_label;
\else
SELECT 'not run: join_requests.status is absent' AS section_5b;
\endif

-- ----- 6. audit_logs: where personal data could sit (JSON snapshots and the free-text reason) --------------
-- 6a. Volume and spread.
WITH c AS (
  SELECT count(*) AS total_rows,
         count(DISTINCT a.action_by) AS distinct_actors,
         count(*) FILTER (WHERE a.old_value IS NOT NULL) AS with_old_value,
         count(*) FILTER (WHERE a.new_value IS NOT NULL) AS with_new_value,
         min(a.created_at) AS oldest,
         max(a.created_at) AS newest
  FROM public.audit_logs a
)
SELECT c.total_rows,
       CASE WHEN c.distinct_actors BETWEEN 1 AND 4 THEN '<5' ELSE c.distinct_actors::text END AS distinct_actors,
       CASE WHEN c.with_old_value  BETWEEN 1 AND 4 THEN '<5' ELSE c.with_old_value::text  END AS rows_with_old_value,
       CASE WHEN c.with_new_value  BETWEEN 1 AND 4 THEN '<5' ELSE c.with_new_value::text  END AS rows_with_new_value,
       CASE WHEN c.total_rows >= 5 THEN to_char(c.oldest, 'YYYY-MM') ELSE '(population < 5)' END AS oldest_month,
       CASE WHEN c.total_rows >= 5 THEN to_char(c.newest, 'YYYY-MM') ELSE '(population < 5)' END AS newest_month
FROM c;

-- 6b. Rows per action type. The application writes action_type as an upper-case code; only values of that shape
--     are printed, anything else is '(other)'.
WITH c AS (
  SELECT CASE WHEN a.action_type ~ '^[A-Z][A-Z0-9_]{0,59}$' THEN a.action_type ELSE '(other)' END AS action_label,
         count(*) AS n
  FROM public.audit_logs a
  GROUP BY 1
)
SELECT c.action_label AS action_type, CASE WHEN c.n BETWEEN 1 AND 4 THEN '<5' ELSE c.n::text END AS rows
FROM c ORDER BY c.action_label;

-- 6c. Free-text reason: presence and LENGTH only, plus counts of email-like and long-digit-run shapes.
WITH c AS (
  SELECT count(*) FILTER (WHERE a.reason IS NOT NULL AND btrim(a.reason) <> '') AS rows_with_reason,
         min(char_length(a.reason)) FILTER (WHERE a.reason IS NOT NULL AND btrim(a.reason) <> '') AS min_len,
         avg(char_length(a.reason)) FILTER (WHERE a.reason IS NOT NULL AND btrim(a.reason) <> '') AS avg_len,
         max(char_length(a.reason)) AS max_len,
         count(*) FILTER (WHERE a.reason ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}') AS email_shape,
         count(*) FILTER (WHERE a.reason ~ '[0-9][0-9 ()-]{7,}[0-9]') AS digit_run
  FROM public.audit_logs a
)
SELECT CASE WHEN c.rows_with_reason BETWEEN 1 AND 4 THEN '<5' ELSE c.rows_with_reason::text END AS rows_with_reason,
       CASE WHEN c.rows_with_reason >= 5 THEN coalesce(c.min_len, 0)::text ELSE '(population < 5)' END AS min_reason_length,
       CASE WHEN c.rows_with_reason >= 5 THEN coalesce(round(c.avg_len), 0)::text ELSE '(population < 5)' END AS avg_reason_length,
       CASE WHEN c.rows_with_reason >= 5 THEN coalesce(c.max_len, 0)::text ELSE '(population < 5)' END AS max_reason_length,
       CASE WHEN c.email_shape BETWEEN 1 AND 4 THEN '<5' ELSE c.email_shape::text END AS reasons_containing_an_email_shape,
       CASE WHEN c.digit_run   BETWEEN 1 AND 4 THEN '<5' ELSE c.digit_run::text   END AS reasons_containing_a_long_digit_run
FROM c;

-- 6d. JSON snapshots: how many rows contain an email-shaped string or a phone-like digit run anywhere in the JSON.
WITH c AS (
  SELECT count(*) FILTER (WHERE a.old_value::text ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
                             OR a.new_value::text ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}') AS email_shape,
         count(*) FILTER (WHERE a.old_value::text ~ '[0-9][0-9 ()-]{7,}[0-9]'
                             OR a.new_value::text ~ '[0-9][0-9 ()-]{7,}[0-9]') AS digit_run
  FROM public.audit_logs a
)
SELECT CASE WHEN c.email_shape BETWEEN 1 AND 4 THEN '<5' ELSE c.email_shape::text END AS json_rows_containing_an_email_shape,
       CASE WHEN c.digit_run   BETWEEN 1 AND 4 THEN '<5' ELSE c.digit_run::text   END AS json_rows_containing_a_long_digit_run
FROM c;

-- 6e. JSON top-level KEY NAMES and how many rows carry each (names only, never values). Objects only; a key is
--     printed only if it looks like an identifier (lower-case letters, digits, underscore), otherwise '(other)'.
WITH k AS (
  SELECT 'old_value' AS snapshot, o.key AS json_key
  FROM public.audit_logs a,
       LATERAL jsonb_object_keys(CASE WHEN jsonb_typeof(a.old_value) = 'object' THEN a.old_value ELSE '{}'::jsonb END) AS o(key)
  UNION ALL
  SELECT 'new_value', o.key
  FROM public.audit_logs a,
       LATERAL jsonb_object_keys(CASE WHEN jsonb_typeof(a.new_value) = 'object' THEN a.new_value ELSE '{}'::jsonb END) AS o(key)
), l AS (
  SELECT k.snapshot,
         CASE WHEN k.json_key ~ '^[a-z][a-z0-9_]{0,39}$' THEN k.json_key ELSE '(other)' END AS key_label,
         count(*) AS n
  FROM k
  GROUP BY 1, 2
)
SELECT l.snapshot, l.key_label AS json_key, CASE WHEN l.n BETWEEN 1 AND 4 THEN '<5' ELSE l.n::text END AS rows
FROM l ORDER BY l.snapshot, l.key_label;

-- ----- 7. Account status and personal-data reference census -------------------------------------------------
-- 7a. Accounts by role (a category). The role total is exact; attribute slices of a role with fewer than 5
--     accounts are hidden, and a slice of 1 to 4 is shown as '<5'.
WITH c AS (
  SELECT CASE WHEN u.role IS NULL THEN '(none)'
              WHEN u.role IN ('captain', 'referee', 'venue_admin', 'org_admin', 'super_admin') THEN u.role
              ELSE '(other)' END AS role_label,
         count(*) AS accounts,
         count(*) FILTER (WHERE u."emailVerified" IS NULL) AS email_unverified,
         count(*) FILTER (WHERE u.image IS NOT NULL) AS with_image,
         count(*) FILTER (WHERE u.venue_id IS NULL) AS without_venue,
         count(*) FILTER (WHERE u.organization_id IS NULL) AS without_organisation
  FROM public.auth_users u
  GROUP BY 1
)
SELECT c.role_label AS role, c.accounts,
       CASE WHEN c.accounts < 5 THEN '(population < 5)' WHEN c.email_unverified BETWEEN 1 AND 4 THEN '<5' ELSE c.email_unverified::text END AS email_unverified,
       CASE WHEN c.accounts < 5 THEN '(population < 5)' WHEN c.with_image       BETWEEN 1 AND 4 THEN '<5' ELSE c.with_image::text       END AS with_image,
       CASE WHEN c.accounts < 5 THEN '(population < 5)' WHEN c.without_venue    BETWEEN 1 AND 4 THEN '<5' ELSE c.without_venue::text    END AS without_venue,
       CASE WHEN c.accounts < 5 THEN '(population < 5)' WHEN c.without_organisation BETWEEN 1 AND 4 THEN '<5' ELSE c.without_organisation::text END AS without_organisation
FROM c ORDER BY c.role_label;

-- 7a2. Accounts by lifecycle status (exists only once 0011 has been applied). 0 is printed exactly, 1 to 4 as '<5'.
\if :g_account_status
WITH c AS (
  SELECT CASE WHEN u.account_status IN ('active', 'pending_deletion', 'deidentified') THEN u.account_status
              ELSE '(other)' END AS status_label,
         count(*) AS n
  FROM public.auth_users u
  GROUP BY 1
)
SELECT c.status_label AS account_status, CASE WHEN c.n BETWEEN 1 AND 4 THEN '<5' ELSE c.n::text END AS accounts
FROM c ORDER BY c.status_label;
\else
SELECT 'not run: auth_users.account_status does not exist yet (migration 0011 not applied)' AS section_7a2;
\endif

-- 7b. Credential and device stores: counts and categories only. The credential provider is the only
--     auth_accounts column read; hashes are never touched.
WITH c AS (
  SELECT CASE WHEN a.provider ~ '^[a-z][a-z0-9_-]{0,29}$' THEN a.provider ELSE '(other)' END AS provider_label,
         count(*) AS n
  FROM public.auth_accounts a
  GROUP BY 1
)
SELECT 'auth_accounts' AS store, c.provider_label AS category, CASE WHEN c.n BETWEEN 1 AND 4 THEN '<5' ELSE c.n::text END AS rows
FROM c ORDER BY c.provider_label;

WITH c AS (
  SELECT (SELECT count(*) FROM public.auth_users WHERE push_token IS NOT NULL)               AS with_push_token,
         (SELECT count(*) FROM public.mobile_sessions)                                       AS mobile_sessions,
         (SELECT count(*) FROM public.password_reset_tokens)                                 AS password_reset_tokens,
         (SELECT count(*) FROM public.auth_verification_token)                               AS verification_tokens,
         (SELECT count(*) FROM public.invite_tokens)                                         AS invitations_total,
         (SELECT count(*) FROM public.invite_tokens WHERE used)                              AS invitations_used,
         (SELECT count(*) FROM public.invite_tokens WHERE NOT used AND expires_at > now())   AS invitations_unused_and_live,
         (SELECT count(*) FROM public.notifications)                                         AS notifications,
         (SELECT count(*) FROM public.auth_rate_limits)                                      AS auth_rate_limit_rows,
         (SELECT count(*) FROM public.api_rate_limits)                                       AS api_rate_limit_rows
)
SELECT CASE WHEN c.with_push_token BETWEEN 1 AND 4 THEN '<5' ELSE c.with_push_token::text END AS accounts_with_push_token,
       c.mobile_sessions, c.password_reset_tokens, c.verification_tokens, c.invitations_total,
       CASE WHEN c.invitations_used BETWEEN 1 AND 4 THEN '<5' ELSE c.invitations_used::text END AS invitations_used,
       CASE WHEN c.invitations_unused_and_live BETWEEN 1 AND 4 THEN '<5' ELSE c.invitations_unused_and_live::text END AS invitations_unused_and_live,
       c.notifications, c.auth_rate_limit_rows, c.api_rate_limit_rows
FROM c;

-- 7c. Responsibilities that block completion (categories and counts; no identifiers). Status words are printed
--     only if they look like a lower-case code.
WITH c AS (
  SELECT 'teams with a captain' AS responsibility,
         CASE WHEN t.status ~ '^[a-z_]{1,20}$' THEN t.status ELSE '(other)' END AS category,
         count(*) AS n
  FROM public.teams t
  WHERE t.captain_user_id IS NOT NULL
  GROUP BY 2
  UNION ALL
  SELECT 'fixtures with a referee',
         CASE WHEN m.status ~ '^[a-z_]{1,20}$' THEN m.status ELSE '(other)' END,
         count(*)
  FROM public.matches m
  WHERE m.referee_id IS NOT NULL
  GROUP BY 2
)
SELECT c.responsibility, c.category, CASE WHEN c.n BETWEEN 1 AND 4 THEN '<5' ELSE c.n::text END AS rows
FROM c ORDER BY c.responsibility, c.category;

-- ----- 8. OPTIONAL: administrator-cover census for decisions 6A-Q01 / 6A-Q02 (exact counts, structural) -----
-- Two different notions are counted, because the lifecycle and the alerts use different rules:
--   * Lifecycle cover (account-lifecycle.js, getLifecycleBlockers): another active venue administrator of the
--     venue, an organisation administrator of its organisation, OR any super administrator. The "scoped
--     administrator" figures below leave the super-administrator escape out on purpose.
--   * Alert recipients (match-reminders.js: unconfirmed-availability alert; confirm-availability handler:
--     availability-response notices): accounts whose role is venue_admin or super_admin AND whose OWN venue_id
--     equals the venue (and, after 0011, whose account_status is active). An organisation administrator is
--     never an alert recipient, and a super administrator is one only for the single venue on their own row.
SELECT
  (SELECT count(*) FROM public.venues)                                                                  AS venues,
  (SELECT count(*) FROM public.venues v
   WHERE NOT EXISTS (SELECT 1 FROM public.auth_users u WHERE u.role = 'venue_admin' AND u.venue_id = v.id)
     AND NOT EXISTS (SELECT 1 FROM public.auth_users u WHERE u.role = 'org_admin' AND u.organization_id = v.organization_id))
                                                                                                         AS venues_without_a_scoped_administrator,
  (SELECT count(*) FROM public.venues v
   WHERE NOT EXISTS (SELECT 1 FROM public.auth_users u WHERE u.role = 'venue_admin' AND u.venue_id = v.id)
     AND NOT EXISTS (SELECT 1 FROM public.auth_users u WHERE u.role = 'org_admin' AND u.organization_id = v.organization_id)
     AND EXISTS (SELECT 1 FROM public.leagues l WHERE l.venue_id = v.id AND l.status = 'active'))
                                                                                                         AS such_venues_with_an_active_league,
  (SELECT count(*) FROM public.venues v
   WHERE EXISTS (SELECT 1 FROM public.leagues l WHERE l.venue_id = v.id AND l.status = 'active')
     AND NOT EXISTS (SELECT 1 FROM public.auth_users u
                     WHERE u.role IN ('venue_admin', 'super_admin') AND u.venue_id = v.id))
                                                                                                         AS active_venues_with_no_alert_recipient,
  (SELECT count(*) FROM public.auth_users WHERE role = 'super_admin')                                   AS super_administrators,
  (SELECT count(*) FROM public.auth_users WHERE role = 'super_admin' AND venue_id IS NOT NULL)          AS super_administrators_with_a_venue,
  (SELECT count(*) FROM public.organizations o
   WHERE NOT EXISTS (SELECT 1 FROM public.auth_users u WHERE u.role = 'org_admin' AND u.organization_id = o.id))
                                                                                                         AS organisations_without_an_org_administrator;

-- 8b. The same alert-recipient count restricted to ACTIVE accounts, as the application selects them once 0011
--     is applied. Before 0011 every account counts as active, which is what the figure above already assumes.
\if :g_account_status
SELECT (SELECT count(*) FROM public.venues v
        WHERE EXISTS (SELECT 1 FROM public.leagues l WHERE l.venue_id = v.id AND l.status = 'active')
          AND NOT EXISTS (SELECT 1 FROM public.auth_users u
                          WHERE u.role IN ('venue_admin', 'super_admin') AND u.venue_id = v.id
                            AND u.account_status = 'active'))
                                                                                                         AS active_venues_with_no_active_alert_recipient;
\else
SELECT 'not run: auth_users.account_status does not exist yet (migration 0011 not applied)' AS section_8b;
\endif

ROLLBACK;

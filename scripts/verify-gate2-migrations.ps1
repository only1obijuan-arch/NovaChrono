param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 5432,
  [string]$AdminUser = "postgres",
  [string]$DatabasePrefix = "novachrono_gate2"
)

$ErrorActionPreference = "Stop"
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$createdb = "C:\Program Files\PostgreSQL\18\bin\createdb.exe"
$dropdb = "C:\Program Files\PostgreSQL\18\bin\dropdb.exe"
$root = Split-Path -Parent $PSScriptRoot
$freshDb = "${DatabasePrefix}_fresh"
$productionDb = "${DatabasePrefix}_production"
$holdDb = "${DatabasePrefix}_hold"
$preflightDb = "${DatabasePrefix}_preconditions"

function Invoke-PsqlFile([string]$Database, [string]$File) {
  & $psql -X -v ON_ERROR_STOP=1 -1 -h $HostName -p $Port -U $AdminUser -d $Database -f $File
  if ($LASTEXITCODE -ne 0) { throw "Failed applying $File to $Database" }
}

function New-TestDatabase([string]$Database) {
  & $dropdb --if-exists -h $HostName -p $Port -U $AdminUser $Database
  & $createdb -h $HostName -p $Port -U $AdminUser $Database
  if ($LASTEXITCODE -ne 0) { throw "Failed creating $Database" }
}

function Assert-PsqlFileFails([string]$Database, [string]$File, [string]$ExpectedMessage) {
  $output = & $psql -X -v ON_ERROR_STOP=1 -1 -h $HostName -p $Port -U $AdminUser -d $Database -f $File 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) { throw "$File unexpectedly accepted an invalid fixture" }
  if ($output -notmatch [regex]::Escape($ExpectedMessage)) {
    throw "$File failed without the expected precondition message: $ExpectedMessage"
  }
}

function Assert-PsqlCommandFails([string]$Database, [string]$Query, [string]$ExpectedMessage) {
  $output = & $psql -X -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $AdminUser -d $Database -c $Query 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) { throw "Invalid SQL fixture unexpectedly succeeded: $Query" }
  if ($output -notmatch [regex]::Escape($ExpectedMessage)) {
    throw "Invalid SQL fixture failed without the expected message: $ExpectedMessage"
  }
}

function Assert-PsqlValue([string]$Database, [string]$Query, [string]$Expected, [string]$Description) {
  $actual = (& $psql -X -A -t -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $AdminUser -d $Database -c $Query | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "Failed checking: $Description" }
  if ($actual -ne $Expected) {
    throw "$Description. Expected '$Expected', got '$actual'"
  }
}

$historical = @("0001_initial.sql", "0002_add_unique_league_slots.sql")
$gate2 = @(
  "0003_auth_identity_integrity.sql",
  "0004_application_schema_integrity.sql",
  "0005_enforce_user_role_not_null.sql",
  "0006_remove_redundant_match_index.sql"
)
$gate3 = @("0007_match_goal_idempotency.sql")

New-TestDatabase $freshDb
foreach ($migration in ($historical + $gate2 + $gate3)) {
  Invoke-PsqlFile $freshDb (Join-Path $root "migrations\$migration")
}

New-TestDatabase $productionDb
foreach ($migration in $historical) {
  Invoke-PsqlFile $productionDb (Join-Path $root "migrations\$migration")
}
Invoke-PsqlFile $productionDb (Join-Path $root "tests\fixtures\gate2-production-shape.sql")
foreach ($migration in $gate2) {
  Invoke-PsqlFile $productionDb (Join-Path $root "migrations\$migration")
}
& $psql -X -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $AdminUser -d $productionDb -c "ALTER TABLE match_events ALTER COLUMN type DROP NOT NULL"
if ($LASTEXITCODE -ne 0) { throw "Failed reproducing the production-nullable match event type" }
& $psql -X -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $AdminUser -d $productionDb -c "INSERT INTO match_events (match_id, type) VALUES ('70000000-0000-4000-8000-000000000001', 'start_first_half')"
if ($LASTEXITCODE -ne 0) { throw "Failed seeding a historical match event before Gate 3 migration" }
foreach ($migration in $gate3) {
  Invoke-PsqlFile $productionDb (Join-Path $root "migrations\$migration")
}

Assert-PsqlValue $productionDb "SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'auth_accounts' AND column_name = 'id'" "text" "Production-shaped account IDs must remain opaque text"
Assert-PsqlValue $productionDb "SELECT id FROM auth_accounts WHERE id = 'opaque-account-id'" "opaque-account-id" "The existing opaque account ID must be preserved"
Assert-PsqlValue $productionDb "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'auth_accounts' AND column_name IN ('access_token', 'expires_at', 'refresh_token', 'id_token', 'scope', 'session_state', 'token_type')" "7" "Auth.js compatibility columns must remain available"
Assert-PsqlValue $productionDb "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'auth_users' AND column_name = 'push_token'" "1" "push_token must exist after migration"
Assert-PsqlValue $productionDb "SELECT coalesce(venue_id::text, 'NULL') FROM invite_tokens WHERE token = 'historical-invite'" "NULL" "Historical invitations must retain a NULL venue"
Assert-PsqlValue $productionDb "SELECT string_agg(data_type, ',' ORDER BY table_name) FROM information_schema.columns WHERE table_schema = 'public' AND (table_name, column_name) IN (('invite_tokens', 'invited_by'), ('matches', 'referee_id'), ('notifications', 'user_id'), ('teams', 'captain_user_id'))" "uuid,uuid,uuid,uuid" "Validated identity references must converge to UUID"
Assert-PsqlValue $productionDb "SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'availability_responses' AND column_name = 'token'" "YES" "Availability tokens must be nullable"
Assert-PsqlValue $productionDb "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'availability_responses' AND column_name IN ('reminder_count', 'last_reminder_at')" "2" "Availability reminder compatibility columns must exist"
& $psql -X -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $AdminUser -d $productionDb -c "UPDATE availability_responses SET token = NULL WHERE token = 'availability-fixture'"
if ($LASTEXITCODE -ne 0) { throw "Availability token could not be cleared after migration" }
Assert-PsqlValue $productionDb "SELECT count(*) FROM notifications WHERE type = 'unconfirmed_alert'" "1" "The production notification vocabulary must remain valid"
Assert-PsqlValue $productionDb "SELECT count(*) FROM pg_constraint WHERE conrelid = 'notifications'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%type%'" "0" "Notification type governance must remain deferred"
Assert-PsqlValue $productionDb "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leagues' AND column_name IN ('win_points', 'draw_points', 'forfeit_score_home', 'forfeit_score_away')" "4" "Canonical scoring columns must exist"
Assert-PsqlValue $productionDb "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leagues' AND column_name IN ('points_win', 'points_draw')" "0" "Legacy scoring aliases must not be introduced"
Assert-PsqlValue $productionDb "SELECT count(*) FROM pg_class WHERE oid = to_regclass('public.idx_matches_league_id')" "1" "The canonical matches league index must remain"
Assert-PsqlValue $productionDb "SELECT count(*) FROM pg_class WHERE oid = to_regclass('public.matches_league_idx')" "0" "The redundant matches league index must be removed"
Assert-PsqlValue $productionDb "SELECT count(*) FROM match_events WHERE match_id = '70000000-0000-4000-8000-000000000001' AND type = 'start_first_half' AND operation_id IS NULL" "1" "Historical match events must survive Gate 3 migration"
Assert-PsqlValue $productionDb "SELECT count(*) FROM pg_class WHERE oid = to_regclass('public.match_events_match_goal_operation_unique')" "1" "Goal idempotency index must exist"
& $psql -X -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $AdminUser -d $productionDb -c "INSERT INTO match_events (match_id, type) VALUES ('70000000-0000-4000-8000-000000000001', NULL)"
if ($LASTEXITCODE -ne 0) { throw "Historical NULL type/NULL operation fixture must remain valid" }
Assert-PsqlCommandFails $productionDb "INSERT INTO match_events (match_id, type, operation_id) VALUES ('70000000-0000-4000-8000-000000000001', NULL, '90000000-0000-4000-8000-000000000090')" "match_events_goal_operation_check"
Assert-PsqlCommandFails $productionDb "INSERT INTO match_events (match_id, type, operation_id) VALUES ('70000000-0000-4000-8000-000000000001', 'end_match', '90000000-0000-4000-8000-000000000091')" "match_events_goal_operation_check"
& $psql -X -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $AdminUser -d $productionDb -c "INSERT INTO match_events (match_id, type, operation_id) VALUES ('70000000-0000-4000-8000-000000000001', 'goal_home', '90000000-0000-4000-8000-000000000092')"
if ($LASTEXITCODE -ne 0) { throw "Goal operation ID fixture must be accepted" }
Assert-PsqlCommandFails $productionDb "INSERT INTO match_events (match_id, type, operation_id) VALUES ('70000000-0000-4000-8000-000000000001', 'goal_home', '90000000-0000-4000-8000-000000000092')" "match_events_match_goal_operation_unique"
& $psql -X -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $AdminUser -d $productionDb -c "INSERT INTO matches (id, league_id, round_number, match_date, time_slot, field_number, home_slot_id) SELECT '70000000-0000-4000-8000-000000000002', league_id, 2, match_date + 7, time_slot, field_number, home_slot_id FROM matches WHERE id = '70000000-0000-4000-8000-000000000001'; INSERT INTO match_events (match_id, type, operation_id) VALUES ('70000000-0000-4000-8000-000000000002', 'goal_home', '90000000-0000-4000-8000-000000000092')"
if ($LASTEXITCODE -ne 0) { throw "The same operation ID must remain valid for another match" }

New-TestDatabase $holdDb
foreach ($migration in $historical) {
  Invoke-PsqlFile $holdDb (Join-Path $root "migrations\$migration")
}
Invoke-PsqlFile $holdDb (Join-Path $root "tests\fixtures\gate2-production-shape.sql")
& $psql -X -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $AdminUser -d $holdDb -c "INSERT INTO auth_users (name, email, role) VALUES ('Unresolved', 'unresolved@example.test', NULL)"
foreach ($migration in $gate2[0..1]) {
  Invoke-PsqlFile $holdDb (Join-Path $root "migrations\$migration")
}
& $psql -X -v ON_ERROR_STOP=1 -1 -h $HostName -p $Port -U $AdminUser -d $holdDb -f (Join-Path $root "migrations\0005_enforce_user_role_not_null.sql")
if ($LASTEXITCODE -eq 0) {
  throw "Role hold-point migration unexpectedly accepted a NULL role"
}

New-TestDatabase $preflightDb
foreach ($migration in $historical) {
  Invoke-PsqlFile $preflightDb (Join-Path $root "migrations\$migration")
}
Invoke-PsqlFile $preflightDb (Join-Path $root "tests\fixtures\gate2-production-shape.sql")

& $psql -X -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $AdminUser -d $preflightDb -c "INSERT INTO auth_users (name, email, role) VALUES ('Duplicate', 'CAPTAIN@example.test', 'captain')"
Assert-PsqlFileFails $preflightDb (Join-Path $root "migrations\0003_auth_identity_integrity.sql") "canonical auth_users email duplicates exist"
& $psql -X -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $AdminUser -d $preflightDb -c "DELETE FROM auth_users WHERE name = 'Duplicate'"

& $psql -X -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $AdminUser -d $preflightDb -c 'INSERT INTO auth_accounts (id, "userId", type, provider, "providerAccountId") VALUES (''duplicate-account'', ''30000000-0000-4000-8000-000000000002'', ''credentials'', ''credentials'', ''duplicate'')'
Assert-PsqlFileFails $preflightDb (Join-Path $root "migrations\0003_auth_identity_integrity.sql") "duplicate auth_accounts owner/provider rows exist"
& $psql -X -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $AdminUser -d $preflightDb -c "DELETE FROM auth_accounts WHERE id = 'duplicate-account'"
Invoke-PsqlFile $preflightDb (Join-Path $root "migrations\0003_auth_identity_integrity.sql")

& $psql -X -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $AdminUser -d $preflightDb -c "UPDATE teams SET captain_user_id = 'not-a-uuid' WHERE id = '60000000-0000-4000-8000-000000000001'"
Assert-PsqlFileFails $preflightDb (Join-Path $root "migrations\0004_application_schema_integrity.sql") "malformed teams.captain_user_id UUID text exists"
& $psql -X -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $AdminUser -d $preflightDb -c "UPDATE teams SET captain_user_id = '30000000-0000-4000-8000-000000000002' WHERE id = '60000000-0000-4000-8000-000000000001'"

& $psql -X -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $AdminUser -d $preflightDb -c "INSERT INTO standings (league_id, team_id) VALUES ('40000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001')"
Assert-PsqlFileFails $preflightDb (Join-Path $root "migrations\0004_application_schema_integrity.sql") "duplicate standings league/team rows exist"
& $psql -X -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $AdminUser -d $preflightDb -c "DELETE FROM standings WHERE id NOT IN (SELECT id FROM standings ORDER BY id LIMIT 1)"

& $psql -X -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $AdminUser -d $preflightDb -c "INSERT INTO availability_responses (match_id, team_id, token) VALUES ('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'duplicate-availability')"
Assert-PsqlFileFails $preflightDb (Join-Path $root "migrations\0004_application_schema_integrity.sql") "duplicate availability match/team rows exist"
& $psql -X -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $AdminUser -d $preflightDb -c "DELETE FROM availability_responses WHERE token = 'duplicate-availability'"

Write-Output "Gate 2/3 migration verification passed: fresh, production-shaped, historical-event preservation, strict goal operation checks, match-scoped uniqueness, NULL-role hold, and anomaly fail-closed paths."

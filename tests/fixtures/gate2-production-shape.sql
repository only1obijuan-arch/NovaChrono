-- Schema-only production-shape rehearsal derived from the accepted Gate 1/2A
-- evidence. Values are synthetic and contain no production data.

ALTER TABLE auth_users DROP CONSTRAINT auth_users_role_check;
ALTER TABLE auth_users ALTER COLUMN role DROP NOT NULL;
ALTER TABLE auth_users ADD COLUMN image TEXT;
ALTER TABLE auth_users DROP COLUMN push_token;

ALTER TABLE auth_accounts DROP CONSTRAINT "auth_accounts_userId_fkey";
ALTER TABLE auth_accounts DROP CONSTRAINT "auth_accounts_userId_provider_key";
ALTER TABLE auth_accounts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE auth_accounts ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE auth_accounts ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE auth_accounts
  ADD COLUMN access_token TEXT,
  ADD COLUMN expires_at BIGINT,
  ADD COLUMN refresh_token TEXT,
  ADD COLUMN id_token TEXT,
  ADD COLUMN scope TEXT,
  ADD COLUMN session_state TEXT,
  ADD COLUMN token_type TEXT;
ALTER TABLE auth_accounts
  ADD CONSTRAINT auth_accounts_provider_identity_existing
  UNIQUE (provider, "providerAccountId");

ALTER TABLE invite_tokens DROP CONSTRAINT invite_tokens_invited_by_fkey;
ALTER TABLE invite_tokens DROP CONSTRAINT invite_tokens_venue_id_fkey;
ALTER TABLE invite_tokens ALTER COLUMN invited_by TYPE TEXT USING invited_by::text;
ALTER TABLE invite_tokens DROP COLUMN venue_id;

ALTER TABLE teams DROP CONSTRAINT teams_captain_user_id_fkey;
ALTER TABLE teams ALTER COLUMN captain_user_id TYPE TEXT USING captain_user_id::text;
ALTER TABLE matches DROP CONSTRAINT matches_referee_id_fkey;
ALTER TABLE matches ALTER COLUMN referee_id TYPE TEXT USING referee_id::text;
ALTER TABLE matches
  ALTER COLUMN match_date TYPE TIMESTAMPTZ
  USING match_date::timestamp AT TIME ZONE 'UTC';
ALTER TABLE notifications DROP CONSTRAINT notifications_user_id_fkey;
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ALTER COLUMN user_id TYPE TEXT USING user_id::text;

ALTER TABLE password_reset_tokens DROP CONSTRAINT password_reset_tokens_user_id_fkey;
ALTER TABLE password_reset_tokens ALTER COLUMN used DROP NOT NULL;
ALTER TABLE venues ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE league_slots ALTER COLUMN slot_number DROP NOT NULL;
ALTER TABLE standings DROP CONSTRAINT standings_league_id_team_id_key;
ALTER TABLE standings
  ALTER COLUMN played DROP NOT NULL,
  ALTER COLUMN won DROP NOT NULL,
  ALTER COLUMN drawn DROP NOT NULL,
  ALTER COLUMN lost DROP NOT NULL,
  ALTER COLUMN goals_for DROP NOT NULL,
  ALTER COLUMN goals_against DROP NOT NULL,
  ALTER COLUMN goal_difference DROP NOT NULL,
  ALTER COLUMN points DROP NOT NULL;
ALTER TABLE availability_responses DROP CONSTRAINT availability_responses_match_id_team_id_key;
ALTER TABLE availability_responses ALTER COLUMN token SET NOT NULL;
ALTER TABLE availability_responses DROP COLUMN reminder_count;
ALTER TABLE availability_responses DROP COLUMN last_reminder_at;

ALTER TABLE leagues
  ADD COLUMN win_points INT NOT NULL DEFAULT 3,
  ADD COLUMN draw_points INT NOT NULL DEFAULT 1,
  ADD COLUMN forfeit_score_home INT NOT NULL DEFAULT 3,
  ADD COLUMN forfeit_score_away INT NOT NULL DEFAULT 0;

CREATE INDEX matches_league_idx ON matches (league_id);

INSERT INTO organizations (id, name)
VALUES ('10000000-0000-4000-8000-000000000001', 'Fixture Org');
INSERT INTO venues (id, organization_id, name)
VALUES (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Fixture Venue'
);
INSERT INTO auth_users (id, name, email, "emailVerified", role, venue_id, organization_id)
VALUES
  ('30000000-0000-4000-8000-000000000001', 'Platform', 'PLATFORM@EXAMPLE.TEST', NOW(), 'super_admin', NULL, NULL),
  ('30000000-0000-4000-8000-000000000002', 'Captain', ' captain@example.test ', NOW(), 'captain', NULL, NULL),
  ('30000000-0000-4000-8000-000000000003', 'Referee', 'referee@example.test', NOW(), 'referee', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');
INSERT INTO auth_accounts (id, "userId", type, provider, "providerAccountId", password, access_token)
VALUES
  ('opaque-account-id', '30000000-0000-4000-8000-000000000002', 'credentials', 'credentials', 'captain@example.test', 'fixture-hash', NULL);
INSERT INTO invite_tokens (token, email, role, organization_id, invited_by, used, expires_at)
VALUES (
  'historical-invite', 'HISTORICAL@EXAMPLE.TEST', 'org_admin',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001', TRUE, NOW() - INTERVAL '1 day'
);
INSERT INTO password_reset_tokens (user_id, token, expires_at, used)
VALUES ('30000000-0000-4000-8000-000000000002', 'reset-fixture', NOW() + INTERVAL '1 day', FALSE);
INSERT INTO leagues (
  id, venue_id, name, day_of_week, match_format, match_duration_minutes,
  fields_count, time_slots, max_teams, join_code
)
VALUES (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', 'Fixture League', 4, '2x20', 40,
  1, '["18:30"]', 2, 'FIXTUR01'
);
INSERT INTO league_slots (id, league_id, slot_number)
VALUES (
  '50000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001', 1
);
INSERT INTO teams (id, league_id, slot_id, name, captain_user_id)
VALUES (
  '60000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001', 'Fixture Team',
  '30000000-0000-4000-8000-000000000002'
);
INSERT INTO matches (
  id, league_id, round_number, match_date, time_slot, field_number,
  home_slot_id, referee_id
)
VALUES (
  '70000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001', 1, TIMESTAMPTZ '2030-01-01 00:00:00+00', '18:30', 1,
  '50000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000003'
);
INSERT INTO standings (league_id, team_id)
VALUES (
  '40000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001'
);
INSERT INTO availability_responses (match_id, team_id, token)
VALUES (
  '70000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001', 'availability-fixture'
);
INSERT INTO notifications (user_id, type, title, message)
VALUES (
  '30000000-0000-4000-8000-000000000002',
  'unconfirmed_alert', 'Fixture title', 'Fixture message'
);

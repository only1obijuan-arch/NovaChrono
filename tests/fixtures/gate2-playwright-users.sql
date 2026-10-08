-- Synthetic identities and league data for Playwright smoke tests. Apply only
-- to an isolated migrated test database; never apply to production.
INSERT INTO organizations (id, name)
VALUES ('92000000-0000-4000-8000-000000000001', 'Nova Smoke Org')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO venues (id, organization_id, name, location)
VALUES (
  '93000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  'Nova Arena',
  'Smoke Test City'
)
ON CONFLICT (id) DO UPDATE
SET organization_id = EXCLUDED.organization_id,
    name = EXCLUDED.name,
    location = EXCLUDED.location;

INSERT INTO auth_users (id, name, email, role, venue_id, organization_id, field_number)
VALUES
  ('91000000-0000-4000-8000-000000000001', 'Venue admin smoke user', 'venue_admin@example.test', 'venue_admin', '93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', NULL),
  ('91000000-0000-4000-8000-000000000002', 'Captain smoke user', 'captain@example.test', 'captain', '93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', NULL),
  ('91000000-0000-4000-8000-000000000003', 'Referee smoke user', 'referee@example.test', 'referee', '93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 1)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    venue_id = EXCLUDED.venue_id,
    organization_id = EXCLUDED.organization_id,
    field_number = EXCLUDED.field_number,
    sessions_valid_after = TIMESTAMPTZ '1970-01-01 00:00:00+00';

INSERT INTO leagues (
  id, venue_id, name, day_of_week, season_start_date, season_end_date,
  match_format, match_duration_minutes, fields_count, time_slots, max_teams,
  join_code, status, season_name
)
VALUES (
  '94000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  'Tuesday Premier League', 2, DATE '2026-10-01', DATE '2027-02-01',
  '2x20', 40, 2, '["18:30", "19:15"]', 10, 'A1B2C3D4',
  'registration', '2026'
)
ON CONFLICT (id) DO UPDATE
SET venue_id = EXCLUDED.venue_id,
    name = EXCLUDED.name,
    day_of_week = EXCLUDED.day_of_week,
    status = EXCLUDED.status;

INSERT INTO league_slots (id, league_id, slot_number)
VALUES ('95000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO teams (id, league_id, slot_id, name, captain_user_id, created_at)
VALUES (
  '96000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000001',
  'Nova United',
  '91000000-0000-4000-8000-000000000002',
  TIMESTAMPTZ '2026-10-01 00:00:00+00'
)
ON CONFLICT (id) DO UPDATE
SET captain_user_id = EXCLUDED.captain_user_id,
    name = EXCLUDED.name,
    status = 'active';

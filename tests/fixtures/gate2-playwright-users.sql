-- Synthetic users for Playwright smoke tests. Apply only to an isolated test
-- database after the Gate 2 migrations; never apply to production.
INSERT INTO auth_users (id, name, email, role)
VALUES
  (
    '91000000-0000-4000-8000-000000000001',
    'Venue admin smoke user',
    'venue_admin@example.test',
    'venue_admin'
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    'Captain smoke user',
    'captain@example.test',
    'captain'
  ),
  (
    '91000000-0000-4000-8000-000000000003',
    'Referee smoke user',
    'referee@example.test',
    'referee'
  )
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    sessions_valid_after = TIMESTAMPTZ '1970-01-01 00:00:00+00';

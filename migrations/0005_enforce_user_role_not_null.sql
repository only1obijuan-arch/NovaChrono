-- Gate 2B production hold point.
-- This migration intentionally fails closed until operators assign the two
-- currently unresolved production roles from authoritative information.
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  unresolved_count BIGINT;
BEGIN
  SELECT count(*) INTO unresolved_count FROM auth_users WHERE role IS NULL;
  IF unresolved_count <> 0 THEN
    RAISE EXCEPTION
      'PRODUCTION ROLE ASSIGNMENT REQUIRED: % USERS. Assign authoritative roles before role NOT NULL enforcement.',
      unresolved_count;
  END IF;
END
$$;

ALTER TABLE auth_users
  ALTER COLUMN role SET DEFAULT 'captain',
  ALTER COLUMN role SET NOT NULL;

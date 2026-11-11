-- Gate 6A.2 account lifecycle state. This migration is deliberately additive:
-- it does not de-identify any account or change any sporting relationship.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations
    WHERE name = '0010_gate5_availability_notifications.sql'
  ) THEN
    RAISE EXCEPTION 'Gate 6A.2 precondition failed: migration 0010 is not recorded';
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth_users
    WHERE lower(email) LIKE '%@account.invalid'
  ) THEN
    RAISE EXCEPTION 'Gate 6A.2 precondition failed: reserved lifecycle email domain is already in use';
  END IF;

  IF EXISTS (
    SELECT lower(email)
    FROM auth_users
    GROUP BY lower(email)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Gate 6A.2 precondition failed: canonical email duplicates exist';
  END IF;
END $$;

ALTER TABLE auth_users
  ADD COLUMN account_status TEXT,
  ADD COLUMN deletion_request_id UUID,
  ADD COLUMN deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN deidentified_at TIMESTAMPTZ;

UPDATE auth_users
SET account_status = 'active'
WHERE account_status IS NULL;

ALTER TABLE auth_users
  ALTER COLUMN account_status SET DEFAULT 'active',
  ALTER COLUMN account_status SET NOT NULL;

ALTER TABLE auth_users
  ADD CONSTRAINT auth_users_account_status_supported
    CHECK (account_status IN ('active', 'pending_deletion', 'deidentified'))
    NOT VALID,
  ADD CONSTRAINT auth_users_lifecycle_state_consistent
    CHECK (
      (account_status = 'active'
        AND deletion_request_id IS NULL
        AND deletion_requested_at IS NULL
        AND deidentified_at IS NULL)
      OR
      (account_status = 'pending_deletion'
        AND deletion_request_id IS NOT NULL
        AND deletion_requested_at IS NOT NULL
        AND deidentified_at IS NULL)
      OR
      (account_status = 'deidentified'
        AND deletion_request_id IS NOT NULL
        AND deletion_requested_at IS NOT NULL
        AND deidentified_at IS NOT NULL)
    ) NOT VALID,
  ADD CONSTRAINT auth_users_lifecycle_email_consistent
    CHECK (
      (account_status = 'deidentified'
        AND lower(email) =
          'deidentified+' || replace(id::text, '-', '') || '@account.invalid')
      OR
      (account_status IN ('active', 'pending_deletion')
        AND lower(email) NOT LIKE '%@account.invalid')
    ) NOT VALID;

ALTER TABLE auth_users
  VALIDATE CONSTRAINT auth_users_account_status_supported;
ALTER TABLE auth_users
  VALIDATE CONSTRAINT auth_users_lifecycle_state_consistent;
ALTER TABLE auth_users
  VALIDATE CONSTRAINT auth_users_lifecycle_email_consistent;

CREATE UNIQUE INDEX auth_users_deletion_request_unique
  ON auth_users (deletion_request_id)
  WHERE deletion_request_id IS NOT NULL;

CREATE INDEX auth_users_active_role_idx
  ON auth_users (role, id)
  WHERE account_status = 'active';

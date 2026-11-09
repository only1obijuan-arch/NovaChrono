-- Gate 5: availability-token, reminder-delivery, notification, and push hygiene.

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM notifications
    WHERE type IS NULL OR type NOT IN (
      'match_reminder',
      'availability_confirmed',
      'availability_declined',
      'unconfirmed_alert',
      'admin_message',
      'weather_warning',
      'match_postponed',
      'round_postponed'
    )
  ) THEN
    RAISE EXCEPTION 'Gate 5 preflight failed: unsupported notification type exists';
  END IF;

  IF EXISTS (
    SELECT push_token
    FROM auth_users
    WHERE push_token IS NOT NULL
    GROUP BY push_token
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Gate 5 preflight failed: duplicate push token ownership exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM availability_responses
    WHERE response IS NOT NULL AND response NOT IN ('yes', 'no')
  ) THEN
    RAISE EXCEPTION 'Gate 5 preflight failed: unsupported availability response exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM availability_responses
    WHERE (response IS NULL) <> (responded_at IS NULL)
       OR (response IS NULL AND token IS NULL)
       OR (response IS NOT NULL AND token IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Gate 5 preflight failed: inconsistent availability response state exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM availability_responses
    WHERE token IS NOT NULL
      AND token !~ '^[0-9a-fA-F]{64}$'
  ) THEN
    RAISE EXCEPTION 'Gate 5 preflight failed: malformed availability token exists';
  END IF;

  IF EXISTS (
    SELECT token
    FROM availability_responses
    WHERE token IS NOT NULL
    GROUP BY token
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Gate 5 preflight failed: duplicate availability token exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM availability_responses
    GROUP BY match_id, team_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Gate 5 preflight failed: duplicate availability match/team identity exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM availability_responses ar
    JOIN matches m ON m.id = ar.match_id
    WHERE ar.response IS NULL
      AND m.time_slot !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
  ) THEN
    RAISE EXCEPTION 'Gate 5 preflight failed: pending availability has an invalid match time slot';
  END IF;
END
$$;

ALTER TABLE availability_responses
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_claim_id UUID,
  ADD COLUMN IF NOT EXISTS delivery_claimed_at TIMESTAMPTZ;

UPDATE availability_responses ar
SET expires_at = (
  nova_planned_date(m.match_date) + m.time_slot::time
) AT TIME ZONE 'Africa/Johannesburg'
FROM matches m
WHERE m.id = ar.match_id
  AND ar.response IS NULL
  AND ar.expires_at IS NULL;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'availability_responses'::regclass
      AND c.contype = 'c'
      AND (
        pg_get_constraintdef(c.oid) ILIKE '%response%'
        OR pg_get_constraintdef(c.oid) ILIKE '%responded_at%'
        OR pg_get_constraintdef(c.oid) ILIKE '%delivery_claim%'
        OR pg_get_constraintdef(c.oid) ILIKE '%reminder_count%'
        OR pg_get_constraintdef(c.oid) ILIKE '%token%'
      )
  LOOP
    EXECUTE format('ALTER TABLE availability_responses DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'notifications'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%type%'
  LOOP
    EXECUTE format('ALTER TABLE notifications DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  ALTER TABLE availability_responses
    ADD CONSTRAINT availability_responses_response_supported
      CHECK (response IS NULL OR response IN ('yes', 'no')) NOT VALID,
    ADD CONSTRAINT availability_responses_state_consistent
      CHECK (
        (
          response IS NULL
          AND responded_at IS NULL
          AND token IS NOT NULL
          AND expires_at IS NOT NULL
        )
        OR (
          response IN ('yes', 'no')
          AND responded_at IS NOT NULL
          AND token IS NULL
        )
      ) NOT VALID,
    ADD CONSTRAINT availability_responses_token_format
      CHECK (token IS NULL OR token ~ '^[0-9a-fA-F]{64}$') NOT VALID,
    ADD CONSTRAINT availability_responses_reminder_count_nonnegative
      CHECK (reminder_count >= 0) NOT VALID,
    ADD CONSTRAINT availability_responses_claim_consistent
      CHECK (delivery_claimed_at IS NULL OR delivery_claim_id IS NOT NULL) NOT VALID;

  ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_supported
      CHECK (type IN (
        'match_reminder',
        'availability_confirmed',
        'availability_declined',
        'unconfirmed_alert',
        'admin_message',
        'weather_warning',
        'match_postponed',
        'round_postponed'
      )) NOT VALID;
END
$$;

ALTER TABLE availability_responses
  VALIDATE CONSTRAINT availability_responses_response_supported;
ALTER TABLE availability_responses
  VALIDATE CONSTRAINT availability_responses_state_consistent;
ALTER TABLE availability_responses
  VALIDATE CONSTRAINT availability_responses_token_format;
ALTER TABLE availability_responses
  VALIDATE CONSTRAINT availability_responses_reminder_count_nonnegative;
ALTER TABLE availability_responses
  VALIDATE CONSTRAINT availability_responses_claim_consistent;
ALTER TABLE notifications
  VALIDATE CONSTRAINT notifications_type_supported;

CREATE UNIQUE INDEX IF NOT EXISTS availability_responses_token_unique
  ON availability_responses (token)
  WHERE token IS NOT NULL;

CREATE INDEX IF NOT EXISTS availability_responses_live_claim_idx
  ON availability_responses (delivery_claimed_at)
  WHERE delivery_claimed_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_unique
  ON notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS auth_users_push_token_unique
  ON auth_users (push_token)
  WHERE push_token IS NOT NULL;

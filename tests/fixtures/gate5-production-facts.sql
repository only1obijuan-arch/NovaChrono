-- Synthetic Gate 5 production-shape facts from the accepted read-only preflight.
-- No production values or row data are represented here.

DELETE FROM availability_responses;
UPDATE auth_users SET push_token = NULL;

ALTER TABLE availability_responses
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'availability_responses'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE availability_responses DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = 'availability_responses'::regclass
      AND i.indisunique
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND i.indkey::text = (
        SELECT attnum::text
        FROM pg_attribute
        WHERE attrelid = 'availability_responses'::regclass AND attname = 'token'
      )
  ) THEN
    ALTER TABLE availability_responses
      ADD CONSTRAINT availability_responses_token_key UNIQUE (token);
  END IF;
END
$$;

INSERT INTO notifications (user_id, type, title, message)
SELECT id, 'unconfirmed_alert', 'Synthetic Gate 5 production fact', 'Synthetic rehearsal row'
FROM auth_users
WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE type = 'unconfirmed_alert')
ORDER BY id
LIMIT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM notifications WHERE type = 'unconfirmed_alert') THEN
    RAISE EXCEPTION 'Gate 5 production-shape fixture requires an unconfirmed_alert row';
  END IF;
  IF EXISTS (SELECT 1 FROM availability_responses) THEN
    RAISE EXCEPTION 'Gate 5 production-shape fixture requires zero availability rows';
  END IF;
  IF EXISTS (SELECT 1 FROM auth_users WHERE push_token IS NOT NULL) THEN
    RAISE EXCEPTION 'Gate 5 production-shape fixture requires zero stored push tokens';
  END IF;
END
$$;

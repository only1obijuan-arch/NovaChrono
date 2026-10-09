-- Gate 3A: retry-safe goal commands without changing historical events.
-- UUID is deliberate: both referee clients can generate RFC 4122 v4 values,
-- PostgreSQL validates the identifier at the boundary, and the fixed-width type
-- keeps the match-scoped uniqueness index compact.

SET LOCAL lock_timeout = '5s';

ALTER TABLE match_events
  ADD COLUMN IF NOT EXISTS operation_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'match_events'::regclass
      AND conname = 'match_events_goal_operation_check'
  ) THEN
    ALTER TABLE match_events
      ADD CONSTRAINT match_events_goal_operation_check
      CHECK (operation_id IS NULL OR type IN ('goal_home', 'goal_away'))
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE match_events
  VALIDATE CONSTRAINT match_events_goal_operation_check;

CREATE UNIQUE INDEX IF NOT EXISTS match_events_match_goal_operation_unique
  ON match_events (match_id, operation_id)
  WHERE operation_id IS NOT NULL;

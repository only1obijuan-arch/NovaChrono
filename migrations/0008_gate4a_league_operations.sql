-- Gate 4A: deterministic fixture-operation metadata and conflict lookup support.

SET LOCAL lock_timeout = '5s';

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS result_type TEXT NOT NULL DEFAULT 'played';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'matches'::regclass
      AND conname = 'matches_result_type_check'
  ) THEN
    ALTER TABLE matches
      ADD CONSTRAINT matches_result_type_check
      CHECK (result_type IN ('played', 'forfeit_home_win', 'forfeit_away_win'))
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE matches
  VALIDATE CONSTRAINT matches_result_type_check;

CREATE INDEX IF NOT EXISTS matches_active_schedule_lookup
  ON matches (match_date, time_slot, field_number, league_id)
  WHERE status IN ('scheduled', 'live');

CREATE INDEX IF NOT EXISTS matches_active_referee_schedule_lookup
  ON matches (referee_id, match_date, time_slot)
  WHERE referee_id IS NOT NULL AND status IN ('scheduled', 'live');


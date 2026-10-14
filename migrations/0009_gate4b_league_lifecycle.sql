-- Gate 4B: immutable match participants and one active team per league slot.

SET LOCAL lock_timeout = '5s';

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS home_team_id UUID,
  ADD COLUMN IF NOT EXISTS away_team_id UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM teams
    WHERE status = 'active' AND slot_id IS NOT NULL
    GROUP BY slot_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Gate 4B preflight failed: duplicate active team occupants exist for a league slot';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM matches
    WHERE home_slot_id IS NULL OR away_slot_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Gate 4B preflight failed: a match has a missing participant slot';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM matches m
    JOIN teams t ON t.id = m.home_team_id
    WHERE m.home_team_id IS NOT NULL
      AND (t.league_id <> m.league_id OR t.slot_id IS DISTINCT FROM m.home_slot_id)
  ) OR EXISTS (
    SELECT 1
    FROM matches m
    JOIN teams t ON t.id = m.away_team_id
    WHERE m.away_team_id IS NOT NULL
      AND (t.league_id <> m.league_id OR t.slot_id IS DISTINCT FROM m.away_slot_id)
  ) THEN
    RAISE EXCEPTION 'Gate 4B preflight failed: an existing match team identity does not match its league slot';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM matches m
    LEFT JOIN teams t ON t.id = m.home_team_id
    WHERE m.home_team_id IS NOT NULL AND t.id IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM matches m
    LEFT JOIN teams t ON t.id = m.away_team_id
    WHERE m.away_team_id IS NOT NULL AND t.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Gate 4B preflight failed: an existing match team identity is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM matches m
    WHERE m.home_team_id IS NULL
      AND (
        SELECT count(*)
        FROM teams t
        WHERE t.league_id = m.league_id AND t.slot_id = m.home_slot_id
      ) <> 1
  ) OR EXISTS (
    SELECT 1
    FROM matches m
    WHERE m.away_team_id IS NULL
      AND (
        SELECT count(*)
        FROM teams t
        WHERE t.league_id = m.league_id AND t.slot_id = m.away_slot_id
      ) <> 1
  ) THEN
    RAISE EXCEPTION 'Gate 4B preflight failed: historical match participant backfill is missing or ambiguous';
  END IF;
END
$$;

UPDATE matches m
SET home_team_id = t.id
FROM teams t
WHERE m.home_team_id IS NULL
  AND t.league_id = m.league_id
  AND t.slot_id = m.home_slot_id;

UPDATE matches m
SET away_team_id = t.id
FROM teams t
WHERE m.away_team_id IS NULL
  AND t.league_id = m.league_id
  AND t.slot_id = m.away_slot_id;

ALTER TABLE matches
  ALTER COLUMN home_team_id SET NOT NULL,
  ALTER COLUMN away_team_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'matches'::regclass
      AND conname = 'matches_home_team_id_fkey'
  ) THEN
    ALTER TABLE matches
      ADD CONSTRAINT matches_home_team_id_fkey
      FOREIGN KEY (home_team_id) REFERENCES teams(id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'matches'::regclass
      AND conname = 'matches_away_team_id_fkey'
  ) THEN
    ALTER TABLE matches
      ADD CONSTRAINT matches_away_team_id_fkey
      FOREIGN KEY (away_team_id) REFERENCES teams(id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'matches'::regclass
      AND conname = 'matches_distinct_team_ids_check'
  ) THEN
    ALTER TABLE matches
      ADD CONSTRAINT matches_distinct_team_ids_check
      CHECK (home_team_id <> away_team_id) NOT VALID;
  END IF;
END
$$;

ALTER TABLE matches VALIDATE CONSTRAINT matches_home_team_id_fkey;
ALTER TABLE matches VALIDATE CONSTRAINT matches_away_team_id_fkey;
ALTER TABLE matches VALIDATE CONSTRAINT matches_distinct_team_ids_check;

CREATE UNIQUE INDEX IF NOT EXISTS teams_one_active_per_slot
  ON teams (slot_id)
  WHERE status = 'active' AND slot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS matches_home_team_lookup ON matches (home_team_id);
CREATE INDEX IF NOT EXISTS matches_away_team_lookup ON matches (away_team_id);

CREATE OR REPLACE FUNCTION nova_validate_match_team_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM teams t
    WHERE t.id = NEW.home_team_id
      AND t.league_id = NEW.league_id
      AND t.slot_id = NEW.home_slot_id
  ) THEN
    RAISE EXCEPTION 'home team identity must belong to the match league and home slot';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM teams t
    WHERE t.id = NEW.away_team_id
      AND t.league_id = NEW.league_id
      AND t.slot_id = NEW.away_slot_id
  ) THEN
    RAISE EXCEPTION 'away team identity must belong to the match league and away slot';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS matches_team_identity_guard ON matches;
CREATE TRIGGER matches_team_identity_guard
BEFORE INSERT OR UPDATE OF league_id, home_slot_id, away_slot_id, home_team_id, away_team_id
ON matches
FOR EACH ROW
EXECUTE FUNCTION nova_validate_match_team_identity();

CREATE OR REPLACE FUNCTION nova_preserve_referenced_team_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.league_id, NEW.slot_id) IS DISTINCT FROM (OLD.league_id, OLD.slot_id)
     AND EXISTS (
       SELECT 1
       FROM matches m
       WHERE m.home_team_id = OLD.id OR m.away_team_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'a team referenced by a fixture cannot move league or slot';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS teams_historical_identity_guard ON teams;
CREATE TRIGGER teams_historical_identity_guard
BEFORE UPDATE OF league_id, slot_id
ON teams
FOR EACH ROW
EXECUTE FUNCTION nova_preserve_referenced_team_identity();

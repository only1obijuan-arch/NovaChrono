-- Gate 2B: application-schema compatibility and validated identity references.
-- Business-rule changes for matches, fixtures, standings, and communications
-- remain explicitly outside this migration.

SET LOCAL lock_timeout = '5s';

ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS venue_id UUID;

DO $$
DECLARE
  column_type TEXT;
BEGIN
  SELECT data_type INTO column_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'invite_tokens' AND column_name = 'invited_by';

  IF column_type IN ('text', 'character varying', 'character') THEN
    IF EXISTS (
      SELECT 1 FROM invite_tokens
      WHERE invited_by IS NULL
         OR invited_by !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) THEN
      RAISE EXCEPTION 'Gate 2B precondition failed: malformed invite_tokens.invited_by UUID text exists';
    END IF;
    IF EXISTS (
      SELECT 1 FROM invite_tokens i
      LEFT JOIN auth_users u ON u.id::text = i.invited_by
      WHERE u.id IS NULL
    ) THEN
      RAISE EXCEPTION 'Gate 2B precondition failed: orphan invite_tokens.invited_by exists';
    END IF;
    ALTER TABLE invite_tokens ALTER COLUMN invited_by TYPE UUID USING invited_by::uuid;
  ELSIF column_type <> 'uuid' THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: unsupported invite_tokens.invited_by type %', column_type;
  END IF;
END
$$;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM invite_tokens i
    LEFT JOIN auth_users u ON u.id = i.invited_by
    WHERE i.invited_by IS NULL OR u.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: invalid invitation owner exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM invite_tokens i
    LEFT JOIN venues v ON v.id = i.venue_id
    WHERE i.venue_id IS NOT NULL AND v.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: orphan invitation venue exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM invite_tokens
    WHERE role IS NULL OR role NOT IN ('org_admin', 'venue_admin')
  ) THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: unsupported invitation role exists';
  END IF;

  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'invite_tokens'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE invite_tokens DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  ALTER TABLE invite_tokens
    ADD CONSTRAINT invite_tokens_role_supported
    CHECK (role IN ('org_admin', 'venue_admin'));

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'invite_tokens'::regclass
      AND contype = 'f' AND confrelid = 'auth_users'::regclass
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'invite_tokens'::regclass AND attname = 'invited_by')]::smallint[]
  ) THEN
    ALTER TABLE invite_tokens
      ADD CONSTRAINT invite_tokens_invited_by_fkey
      FOREIGN KEY (invited_by) REFERENCES auth_users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'invite_tokens'::regclass
      AND contype = 'f' AND confrelid = 'venues'::regclass
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'invite_tokens'::regclass AND attname = 'venue_id')]::smallint[]
  ) THEN
    ALTER TABLE invite_tokens
      ADD CONSTRAINT invite_tokens_venue_id_fkey
      FOREIGN KEY (venue_id) REFERENCES venues(id);
  END IF;
END
$$;

ALTER TABLE invite_tokens ALTER COLUMN invited_by SET NOT NULL;

UPDATE invite_tokens
SET email = lower(btrim(email))
WHERE email IS DISTINCT FROM lower(btrim(email));

CREATE INDEX IF NOT EXISTS invite_tokens_invited_by_idx ON invite_tokens (invited_by);
CREATE INDEX IF NOT EXISTS invite_tokens_venue_id_idx ON invite_tokens (venue_id);

-- Direct conversions are proportionate: Gate 2A established that all four
-- relations are tiny and contain no malformed or orphan identities. Each
-- conversion repeats that proof in the same migration transaction.
DO $$
DECLARE column_type TEXT;
BEGIN
  SELECT data_type INTO column_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'captain_user_id';
  IF column_type IN ('text', 'character varying', 'character') THEN
    IF EXISTS (SELECT 1 FROM teams WHERE captain_user_id IS NOT NULL AND captain_user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'Gate 2B precondition failed: malformed teams.captain_user_id UUID text exists';
    END IF;
    IF EXISTS (SELECT 1 FROM teams t LEFT JOIN auth_users u ON u.id::text = t.captain_user_id WHERE t.captain_user_id IS NOT NULL AND u.id IS NULL) THEN
      RAISE EXCEPTION 'Gate 2B precondition failed: orphan teams.captain_user_id exists';
    END IF;
    ALTER TABLE teams ALTER COLUMN captain_user_id TYPE UUID USING captain_user_id::uuid;
  ELSIF column_type <> 'uuid' THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: unsupported teams.captain_user_id type %', column_type;
  END IF;
END
$$;

DO $$
DECLARE column_type TEXT;
BEGIN
  SELECT data_type INTO column_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'referee_id';
  IF column_type IN ('text', 'character varying', 'character') THEN
    IF EXISTS (SELECT 1 FROM matches WHERE referee_id IS NOT NULL AND referee_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'Gate 2B precondition failed: malformed matches.referee_id UUID text exists';
    END IF;
    IF EXISTS (SELECT 1 FROM matches m LEFT JOIN auth_users u ON u.id::text = m.referee_id WHERE m.referee_id IS NOT NULL AND u.id IS NULL) THEN
      RAISE EXCEPTION 'Gate 2B precondition failed: orphan matches.referee_id exists';
    END IF;
    ALTER TABLE matches ALTER COLUMN referee_id TYPE UUID USING referee_id::uuid;
  ELSIF column_type <> 'uuid' THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: unsupported matches.referee_id type %', column_type;
  END IF;
END
$$;

DO $$
DECLARE column_type TEXT;
BEGIN
  SELECT data_type INTO column_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'user_id';
  IF column_type IN ('text', 'character varying', 'character') THEN
    IF EXISTS (SELECT 1 FROM notifications WHERE user_id IS NULL OR user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'Gate 2B precondition failed: malformed notifications.user_id UUID text exists';
    END IF;
    IF EXISTS (SELECT 1 FROM notifications n LEFT JOIN auth_users u ON u.id::text = n.user_id WHERE u.id IS NULL) THEN
      RAISE EXCEPTION 'Gate 2B precondition failed: orphan notifications.user_id exists';
    END IF;
    ALTER TABLE notifications ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
  ELSIF column_type <> 'uuid' THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: unsupported notifications.user_id type %', column_type;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM teams t LEFT JOIN auth_users u ON u.id = t.captain_user_id WHERE t.captain_user_id IS NOT NULL AND u.id IS NULL) THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: orphan teams.captain_user_id exists after conversion';
  END IF;
  IF EXISTS (SELECT 1 FROM matches m LEFT JOIN auth_users u ON u.id = m.referee_id WHERE m.referee_id IS NOT NULL AND u.id IS NULL) THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: orphan matches.referee_id exists after conversion';
  END IF;
  IF EXISTS (SELECT 1 FROM notifications n LEFT JOIN auth_users u ON u.id = n.user_id WHERE n.user_id IS NULL OR u.id IS NULL) THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: invalid notifications.user_id exists after conversion';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'teams'::regclass AND contype = 'f' AND confrelid = 'auth_users'::regclass AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'teams'::regclass AND attname = 'captain_user_id')]::smallint[]) THEN
    ALTER TABLE teams ADD CONSTRAINT teams_captain_user_id_fkey FOREIGN KEY (captain_user_id) REFERENCES auth_users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'matches'::regclass AND contype = 'f' AND confrelid = 'auth_users'::regclass AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'matches'::regclass AND attname = 'referee_id')]::smallint[]) THEN
    ALTER TABLE matches ADD CONSTRAINT matches_referee_id_fkey FOREIGN KEY (referee_id) REFERENCES auth_users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'notifications'::regclass AND contype = 'f' AND confrelid = 'auth_users'::regclass AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'notifications'::regclass AND attname = 'user_id')]::smallint[]) THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- Production has no type CHECK and the current writers include values beyond
-- the historical fresh-schema list. Type governance is intentionally Gate 5.
DO $$
DECLARE constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'notifications'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%type%'
  LOOP
    EXECUTE format('ALTER TABLE notifications DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$$;

ALTER TABLE notifications
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN type SET NOT NULL,
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN message SET NOT NULL,
  ALTER COLUMN read SET DEFAULT FALSE,
  ALTER COLUMN read SET NOT NULL;

CREATE INDEX IF NOT EXISTS teams_captain_user_id_idx ON teams (captain_user_id);
CREATE INDEX IF NOT EXISTS matches_referee_id_idx ON matches (referee_id);
CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON notifications (user_id, read);
CREATE INDEX IF NOT EXISTS venues_organization_id_idx ON venues (organization_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM availability_responses GROUP BY match_id, team_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: duplicate availability match/team rows exist';
  END IF;
  IF EXISTS (SELECT 1 FROM standings GROUP BY league_id, team_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: duplicate standings league/team rows exist';
  END IF;
  IF EXISTS (SELECT 1 FROM league_slots WHERE slot_number IS NULL) THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: NULL league slot number exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM standings
    WHERE played IS NULL OR won IS NULL OR drawn IS NULL OR lost IS NULL
       OR goals_for IS NULL OR goals_against IS NULL OR goal_difference IS NULL OR points IS NULL
  ) THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: NULL standings counter exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM venues v
    LEFT JOIN organizations o ON o.id = v.organization_id
    WHERE v.organization_id IS NULL OR o.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: venue without a valid organization exists';
  END IF;
END
$$;

ALTER TABLE availability_responses
  ALTER COLUMN token DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS reminder_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = 'availability_responses'::regclass
      AND i.indisunique AND i.indpred IS NULL AND i.indexprs IS NULL
      AND i.indkey::text = (
        SELECT string_agg(attnum::text, ' ' ORDER BY ordinality)
        FROM unnest(ARRAY[
          (SELECT attnum FROM pg_attribute WHERE attrelid = 'availability_responses'::regclass AND attname = 'match_id'),
          (SELECT attnum FROM pg_attribute WHERE attrelid = 'availability_responses'::regclass AND attname = 'team_id')
        ]) WITH ORDINALITY AS key_columns(attnum, ordinality)
      )
  ) THEN
    ALTER TABLE availability_responses
      ADD CONSTRAINT availability_responses_match_team_key UNIQUE (match_id, team_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = 'standings'::regclass
      AND i.indisunique AND i.indpred IS NULL AND i.indexprs IS NULL
      AND i.indkey::text = (
        SELECT string_agg(attnum::text, ' ' ORDER BY ordinality)
        FROM unnest(ARRAY[
          (SELECT attnum FROM pg_attribute WHERE attrelid = 'standings'::regclass AND attname = 'league_id'),
          (SELECT attnum FROM pg_attribute WHERE attrelid = 'standings'::regclass AND attname = 'team_id')
        ]) WITH ORDINALITY AS key_columns(attnum, ordinality)
      )
  ) THEN
    ALTER TABLE standings ADD CONSTRAINT standings_league_team_key UNIQUE (league_id, team_id);
  END IF;
END
$$;

ALTER TABLE league_slots ALTER COLUMN slot_number SET NOT NULL;
ALTER TABLE venues ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE standings
  ALTER COLUMN played SET DEFAULT 0, ALTER COLUMN played SET NOT NULL,
  ALTER COLUMN won SET DEFAULT 0, ALTER COLUMN won SET NOT NULL,
  ALTER COLUMN drawn SET DEFAULT 0, ALTER COLUMN drawn SET NOT NULL,
  ALTER COLUMN lost SET DEFAULT 0, ALTER COLUMN lost SET NOT NULL,
  ALTER COLUMN goals_for SET DEFAULT 0, ALTER COLUMN goals_for SET NOT NULL,
  ALTER COLUMN goals_against SET DEFAULT 0, ALTER COLUMN goals_against SET NOT NULL,
  ALTER COLUMN goal_difference SET DEFAULT 0, ALTER COLUMN goal_difference SET NOT NULL,
  ALTER COLUMN points SET DEFAULT 0, ALTER COLUMN points SET NOT NULL;

ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS win_points INT DEFAULT 3,
  ADD COLUMN IF NOT EXISTS draw_points INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS forfeit_score_home INT DEFAULT 3,
  ADD COLUMN IF NOT EXISTS forfeit_score_away INT DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM leagues
    WHERE win_points IS NULL OR draw_points IS NULL
       OR forfeit_score_home IS NULL OR forfeit_score_away IS NULL
  ) THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: NULL canonical league scoring value exists';
  END IF;
END
$$;

ALTER TABLE leagues
  ALTER COLUMN win_points SET DEFAULT 3,
  ALTER COLUMN win_points SET NOT NULL,
  ALTER COLUMN draw_points SET DEFAULT 1,
  ALTER COLUMN draw_points SET NOT NULL,
  ALTER COLUMN forfeit_score_home SET DEFAULT 3,
  ALTER COLUMN forfeit_score_home SET NOT NULL,
  ALTER COLUMN forfeit_score_away SET DEFAULT 0,
  ALTER COLUMN forfeit_score_away SET NOT NULL;

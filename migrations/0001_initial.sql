-- Migration 0001: initial schema baseline
-- Safe to run against an existing production database — all statements use
-- IF NOT EXISTS so re-running is a no-op.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Organizations & Venues
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organizations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS venues (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id),
  name             TEXT        NOT NULL,
  location         TEXT,
  lat              NUMERIC,
  lng              NUMERIC,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Auth (NextAuth-compatible)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS auth_users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT,
  email           TEXT        NOT NULL UNIQUE,
  "emailVerified" TIMESTAMPTZ,
  role            TEXT        NOT NULL DEFAULT 'captain'
                    CHECK (role IN ('captain','referee','venue_admin','org_admin','super_admin')),
  venue_id        UUID        REFERENCES venues(id),
  organization_id UUID        REFERENCES organizations(id),
  field_number    INT,
  push_token      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_users_email_lower ON auth_users (LOWER(email));

CREATE TABLE IF NOT EXISTS auth_accounts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"             UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL,
  provider             TEXT NOT NULL,
  "providerAccountId"  TEXT NOT NULL,
  password             TEXT,
  UNIQUE ("userId", provider)
);

CREATE TABLE IF NOT EXISTS auth_verification_token (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT        NOT NULL,
  token      TEXT        NOT NULL UNIQUE,
  expires    TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN     NOT NULL DEFAULT FALSE
);

-- ---------------------------------------------------------------------------
-- Mobile Sessions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mobile_sessions (
  jti        TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invite_tokens (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token            TEXT        NOT NULL UNIQUE,
  email            TEXT        NOT NULL,
  role             TEXT        NOT NULL CHECK (role IN ('org_admin','venue_admin')),
  organization_id  UUID        REFERENCES organizations(id),
  venue_id         UUID        REFERENCES venues(id),
  invited_by       UUID        NOT NULL REFERENCES auth_users(id),
  used             BOOLEAN     NOT NULL DEFAULT FALSE,
  expires_at       TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Leagues & Slots
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS leagues (
  id                     UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id               UUID    NOT NULL REFERENCES venues(id),
  name                   TEXT    NOT NULL CHECK (char_length(name) <= 100),
  day_of_week            INT     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  season_start_date      DATE,
  season_end_date        DATE,
  match_format           TEXT    NOT NULL,
  match_duration_minutes INT     NOT NULL,
  fields_count           INT     NOT NULL,
  time_slots             JSONB   NOT NULL,
  max_teams              INT     NOT NULL,
  join_code              TEXT    NOT NULL UNIQUE,
  status                 TEXT    NOT NULL DEFAULT 'registration'
                           CHECK (status IN ('registration','active','cancelled','completed')),
  season_name            TEXT,
  parent_league_id       UUID    REFERENCES leagues(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS league_slots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id    UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  slot_number  INT  NOT NULL
);

-- ---------------------------------------------------------------------------
-- Teams & Players
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS teams (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id        UUID        NOT NULL REFERENCES leagues(id),
  slot_id          UUID        REFERENCES league_slots(id),
  name             TEXT        NOT NULL,
  captain_user_id  UUID        REFERENCES auth_users(id),
  status           TEXT        NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','inactive')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS players (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  player_number  INT
);

-- ---------------------------------------------------------------------------
-- Matches & Events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS matches (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id         UUID    NOT NULL REFERENCES leagues(id),
  round_number      INT     NOT NULL,
  match_date        DATE    NOT NULL,
  time_slot         TEXT    NOT NULL,
  field_number      INT     NOT NULL,
  home_slot_id      UUID    REFERENCES league_slots(id),
  away_slot_id      UUID    REFERENCES league_slots(id),
  home_score        INT     NOT NULL DEFAULT 0,
  away_score        INT     NOT NULL DEFAULT 0,
  status            TEXT    NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled','live','final','postponed','cancelled')),
  referee_id        UUID    REFERENCES auth_users(id),
  start_time        TIMESTAMPTZ,
  half2_start_time  TIMESTAMPTZ,
  end_time          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_matches_league_id  ON matches (league_id);
CREATE INDEX IF NOT EXISTS idx_matches_match_date ON matches (match_date);

CREATE TABLE IF NOT EXISTS match_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id         UUID        NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  type             TEXT        NOT NULL
                     CHECK (type IN ('start_first_half','goal_home','goal_away','start_second_half','end_match')),
  player_id        UUID        REFERENCES players(id),
  team_id          UUID        REFERENCES teams(id),
  event_timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Standings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS standings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id        UUID NOT NULL REFERENCES leagues(id),
  team_id          UUID NOT NULL REFERENCES teams(id),
  played           INT  NOT NULL DEFAULT 0,
  won              INT  NOT NULL DEFAULT 0,
  drawn            INT  NOT NULL DEFAULT 0,
  lost             INT  NOT NULL DEFAULT 0,
  goals_for        INT  NOT NULL DEFAULT 0,
  goals_against    INT  NOT NULL DEFAULT 0,
  goal_difference  INT  NOT NULL DEFAULT 0,
  points           INT  NOT NULL DEFAULT 0,
  UNIQUE (league_id, team_id)
);

-- ---------------------------------------------------------------------------
-- Availability & Notifications
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS availability_responses (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id         UUID        NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id          UUID        NOT NULL REFERENCES teams(id),
  token            TEXT,
  response         TEXT        CHECK (response IN ('yes','no')),
  responded_at     TIMESTAMPTZ,
  reminder_count   INT         NOT NULL DEFAULT 0,
  last_reminder_at TIMESTAMPTZ,
  UNIQUE (match_id, team_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL
               CHECK (type IN ('availability_confirmed','availability_declined',
                               'match_reminder','round_postponed','unconfirmed_alert')),
  title      TEXT        NOT NULL,
  message    TEXT        NOT NULL,
  match_id   UUID        REFERENCES matches(id),
  read       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id, read);

-- ---------------------------------------------------------------------------
-- Admin & Rate-limiting
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  action_by   UUID        NOT NULL REFERENCES auth_users(id),
  target_id   UUID        NOT NULL,
  action_type TEXT        NOT NULL,
  old_value   JSONB,
  new_value   JSONB,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  identifier   TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (identifier, window_start)
);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  identifier   TEXT        PRIMARY KEY,
  attempts     INT         NOT NULL DEFAULT 0,
  last_attempt TIMESTAMPTZ,
  locked_until TIMESTAMPTZ
);

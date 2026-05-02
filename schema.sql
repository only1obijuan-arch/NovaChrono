-- NovaChrono Database Schema
-- Reconstructed from application code. Last updated: 2026-05-01.
-- There are no migrations in this repo; treat this file as the source of truth
-- for the current production shape until a migration tool is adopted.
--
-- TABLE OF CONTENTS
--   1. Extensions
--   2. Organizations & Venues
--   3. Auth (NextAuth-compatible)
--   4. Mobile Sessions
--   5. Invitations
--   6. Leagues & Slots
--   7. Teams & Players
--   8. Matches & Events
--   9. Standings
--  10. Availability & Notifications
--  11. Admin & Rate-limiting

-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- provides gen_random_uuid()

-- ---------------------------------------------------------------------------
-- 2. Organizations & Venues
-- ---------------------------------------------------------------------------

CREATE TABLE organizations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE venues (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id),
  name             TEXT        NOT NULL,
  location         TEXT,
  lat              NUMERIC,
  lng              NUMERIC,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3. Auth (NextAuth-compatible tables)
-- ---------------------------------------------------------------------------

CREATE TABLE auth_users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT,
  email           TEXT        NOT NULL UNIQUE,
  "emailVerified" TIMESTAMPTZ,                             -- NULL = unverified captain
  role            TEXT        NOT NULL DEFAULT 'captain'
                    CHECK (role IN ('captain','referee','venue_admin','org_admin','super_admin')),
  venue_id        UUID        REFERENCES venues(id),       -- set for referees & venue_admins
  organization_id UUID        REFERENCES organizations(id),-- set for org_admins
  field_number    INT,                                     -- referees only (1-based)
  push_token      TEXT,                                    -- Expo push token for mobile notifications
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_users_email_lower ON auth_users (LOWER(email));

-- One row per user for password-based auth (NextAuth credentials provider).
-- Column names follow NextAuth conventions (camelCase with double-quotes).
CREATE TABLE auth_accounts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"             UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL,                      -- always 'credentials'
  provider             TEXT NOT NULL,                      -- always 'credentials'
  "providerAccountId"  TEXT NOT NULL,
  password             TEXT,                               -- argon2 hash
  UNIQUE ("userId", provider)
);

-- Single-use email verification tokens; expire after 24 h.
CREATE TABLE auth_verification_token (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT        NOT NULL,                         -- lowercased email address
  token      TEXT        NOT NULL UNIQUE,                  -- SHA-256 hex hash of raw token
  expires    TIMESTAMPTZ NOT NULL
);

-- Single-use password reset tokens; expire after 1 h.
CREATE TABLE password_reset_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL UNIQUE,                  -- SHA-256 hex hash of raw token
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN     NOT NULL DEFAULT FALSE
);

-- ---------------------------------------------------------------------------
-- 4. Mobile Sessions (JWT-backed, revocable)
-- ---------------------------------------------------------------------------

-- Stores active mobile JWTs so they can be explicitly revoked on sign-out
-- or token refresh.  jti matches the "jti" claim inside the JWT.
CREATE TABLE mobile_sessions (
  jti        TEXT        PRIMARY KEY,                      -- UUID string from JWT "jti" claim
  user_id    UUID        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

-- ---------------------------------------------------------------------------
-- 5. Invitations
-- ---------------------------------------------------------------------------

CREATE TABLE invite_tokens (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token            TEXT        NOT NULL UNIQUE,            -- SHA-256 hex hash of raw token
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
-- 6. Leagues & Slots
-- ---------------------------------------------------------------------------

CREATE TABLE leagues (
  id                     UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id               UUID    NOT NULL REFERENCES venues(id),
  name                   TEXT    NOT NULL CHECK (char_length(name) <= 100),
  day_of_week            INT     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun
  season_start_date      DATE,
  season_end_date        DATE,
  match_format           TEXT    NOT NULL,                 -- e.g. '5-a-side', '7-a-side'
  match_duration_minutes INT     NOT NULL,
  fields_count           INT     NOT NULL,
  time_slots             JSONB   NOT NULL,                 -- JSON array of time strings, e.g. ["18:00","19:00"]
  max_teams              INT     NOT NULL,
  join_code              TEXT    NOT NULL UNIQUE,          -- 8-char uppercase hex; used by captains to self-register
  status                 TEXT    NOT NULL DEFAULT 'registration'
                           CHECK (status IN ('registration','active','cancelled','completed')),
  season_name            TEXT,                             -- human label for this season, set on CREATE_NEW_SEASON
  parent_league_id       UUID    REFERENCES leagues(id),  -- links season chain; NULL = first season
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One persistent slot per team position in the league.
-- Slots survive team changes so fixture references never dangle.
CREATE TABLE league_slots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id    UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  slot_number  INT  NOT NULL                               -- 1-based ordinal within the league
);

-- ---------------------------------------------------------------------------
-- 7. Teams & Players
-- ---------------------------------------------------------------------------

CREATE TABLE teams (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id        UUID        NOT NULL REFERENCES leagues(id),
  slot_id          UUID        REFERENCES league_slots(id),
  name             TEXT        NOT NULL,
  captain_user_id  UUID        REFERENCES auth_users(id),
  status           TEXT        NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','inactive')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE players (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  player_number  INT                                       -- optional shirt number
);

-- ---------------------------------------------------------------------------
-- 8. Matches & Events
-- ---------------------------------------------------------------------------

CREATE TABLE matches (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id         UUID    NOT NULL REFERENCES leagues(id),
  round_number      INT     NOT NULL,
  match_date        DATE    NOT NULL,
  time_slot         TEXT    NOT NULL,                      -- e.g. '18:00'
  field_number      INT     NOT NULL,
  home_slot_id      UUID    REFERENCES league_slots(id),
  away_slot_id      UUID    REFERENCES league_slots(id),
  home_score        INT     NOT NULL DEFAULT 0,
  away_score        INT     NOT NULL DEFAULT 0,
  status            TEXT    NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled','live','final','postponed','cancelled')),
  referee_id        UUID    REFERENCES auth_users(id),     -- NULL until assigned
  start_time        TIMESTAMPTZ,                           -- set on START_MATCH
  half2_start_time  TIMESTAMPTZ,                           -- set on START_SECOND_HALF
  end_time          TIMESTAMPTZ                            -- set on END_MATCH
);

CREATE INDEX idx_matches_league_id  ON matches (league_id);
CREATE INDEX idx_matches_match_date ON matches (match_date);

-- Append-only log of in-match events (goals, half/full-time markers).
-- Deleting a goal event decrements the corresponding score counter.
CREATE TABLE match_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id         UUID        NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  type             TEXT        NOT NULL
                     CHECK (type IN ('start_first_half','goal_home','goal_away','start_second_half','end_match')),
  player_id        UUID        REFERENCES players(id),     -- goal scorer; NULL for non-goal events
  team_id          UUID        REFERENCES teams(id),       -- scoring team; NULL for non-goal events
  event_timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 9. Standings
-- ---------------------------------------------------------------------------

-- One row per team per league; seeded at 0 on GENERATE_FIXTURES and updated
-- atomically at the end of every match.
CREATE TABLE standings (
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
  points           INT  NOT NULL DEFAULT 0,               -- W=3, D=1, L=0
  UNIQUE (league_id, team_id)
);

-- ---------------------------------------------------------------------------
-- 10. Availability & Notifications
-- ---------------------------------------------------------------------------

-- One row per (match, team).  A one-click token is emailed to the captain;
-- they confirm yes/no via a tokenised link.
CREATE TABLE availability_responses (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id         UUID        NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id          UUID        NOT NULL REFERENCES teams(id),
  token            TEXT,                                   -- hex token; present until responded_at is set
  response         TEXT        CHECK (response IN ('yes','no')),
  responded_at     TIMESTAMPTZ,                            -- NULL = not yet responded
  reminder_count   INT         NOT NULL DEFAULT 0,
  last_reminder_at TIMESTAMPTZ,
  UNIQUE (match_id, team_id)
);

CREATE TABLE notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL
               CHECK (type IN ('availability_confirmed','availability_declined',
                               'match_reminder','round_postponed','unconfirmed_alert')),
  title      TEXT        NOT NULL,
  message    TEXT        NOT NULL,
  match_id   UUID        REFERENCES matches(id),           -- NULL for non-match notifications
  read       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications (user_id, read);

-- ---------------------------------------------------------------------------
-- 11. Admin & Rate-limiting
-- ---------------------------------------------------------------------------

-- Immutable append-only record of privileged admin actions (score overrides etc.)
CREATE TABLE audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  action_by   UUID        NOT NULL REFERENCES auth_users(id),
  target_id   UUID        NOT NULL,                        -- ID of the affected entity (e.g. match id)
  action_type TEXT        NOT NULL,                        -- e.g. 'ADMIN_OVERRIDE'
  old_value   JSONB,
  new_value   JSONB,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sliding-window rate limiter used by all public API routes.
-- Each (identifier, window_start) pair is one bucket; counts are incremented
-- atomically via INSERT ... ON CONFLICT DO UPDATE.
CREATE TABLE api_rate_limits (
  identifier   TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (identifier, window_start)
);

-- Per-email brute-force protection for authentication endpoints.
CREATE TABLE auth_rate_limits (
  identifier   TEXT        PRIMARY KEY,                    -- email address
  attempts     INT         NOT NULL DEFAULT 0,
  last_attempt TIMESTAMPTZ,
  locked_until TIMESTAMPTZ                                 -- NULL = not currently locked
);

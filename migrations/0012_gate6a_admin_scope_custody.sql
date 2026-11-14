-- Gate 6A S2a: administrator scope custody, recipient views and routing state.
--
-- ADDITIVE ONLY. This migration writes no data: it creates no custody row, no routing-state row and
-- changes no account, team, fixture, standing or notification row. The only existing object it touches
-- is the notification type CHECK, which gains one allowed value ('venue_unrouted').
--
-- Nothing in the application reads any of these objects yet; deploying it changes no behaviour.
-- An ABSENT admin_routing_state row means: routing mode 'legacy', custody operations disabled.
--
-- Vocabulary (see the S2 design contract): scope custody is an explicit, audited assignment of operational
-- responsibility for one venue or organisation; it is unrelated to team custody in the account lifecycle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations
    WHERE name = '0011_gate6a_account_lifecycle.sql'
  ) THEN
    RAISE EXCEPTION 'Gate 6A S2a precondition failed: migration 0011 is not recorded';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'notifications'::regclass
      AND c.conname = 'notifications_type_supported'
      AND c.convalidated
  ) THEN
    RAISE EXCEPTION 'Gate 6A S2a precondition failed: notifications_type_supported is missing or not validated';
  END IF;
END $$;

CREATE TABLE admin_scope_custody (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Restrictive on purpose: custody history is never deleted together with its scope.
  venue_id          uuid        REFERENCES venues(id),
  organization_id   uuid        REFERENCES organizations(id),
  custodian_user_id uuid        NOT NULL REFERENCES auth_users(id),
  assigned_by       uuid        NOT NULL REFERENCES auth_users(id),
  assigned_at       timestamptz NOT NULL DEFAULT now(),
  assigned_reason   text        NOT NULL,
  review_due_at     timestamptz NOT NULL,
  predecessor_id    uuid        REFERENCES admin_scope_custody(id),
  released_at       timestamptz,
  released_by       uuid        REFERENCES auth_users(id),
  release_reason    text,
  CONSTRAINT admin_scope_custody_one_scope
    CHECK (num_nonnulls(venue_id, organization_id) = 1),
  CONSTRAINT admin_scope_custody_assign_reason
    CHECK (char_length(btrim(assigned_reason)) BETWEEN 10 AND 500),
  CONSTRAINT admin_scope_custody_release_consistent
    CHECK (
      (released_at IS NULL AND released_by IS NULL AND release_reason IS NULL)
      OR
      (released_at IS NOT NULL AND released_by IS NOT NULL
        AND char_length(btrim(release_reason)) BETWEEN 10 AND 500
        AND released_at >= assigned_at)
    ),
  -- The 365-day review cap is enforced by the service: an interval comparison here would depend on the time zone.
  CONSTRAINT admin_scope_custody_review_after_assign
    CHECK (review_due_at > assigned_at)
);

CREATE UNIQUE INDEX admin_scope_custody_active_venue_unique
  ON admin_scope_custody (custodian_user_id, venue_id)
  WHERE released_at IS NULL AND venue_id IS NOT NULL;
CREATE UNIQUE INDEX admin_scope_custody_active_org_unique
  ON admin_scope_custody (custodian_user_id, organization_id)
  WHERE released_at IS NULL AND organization_id IS NOT NULL;
CREATE UNIQUE INDEX admin_scope_custody_predecessor_unique
  ON admin_scope_custody (predecessor_id)
  WHERE predecessor_id IS NOT NULL;
CREATE INDEX admin_scope_custody_venue_idx
  ON admin_scope_custody (venue_id)
  WHERE released_at IS NULL AND venue_id IS NOT NULL;
CREATE INDEX admin_scope_custody_org_idx
  ON admin_scope_custody (organization_id)
  WHERE released_at IS NULL AND organization_id IS NOT NULL;
CREATE INDEX admin_scope_custody_custodian_idx
  ON admin_scope_custody (custodian_user_id)
  WHERE released_at IS NULL;

-- STRICT predicate: who covers a venue. For coverage blockers, the release guard, diagnostics and the routing-switch
-- gate. A super administrator that merely has a venue_id is NOT a row here. Never read by event delivery.
CREATE VIEW venue_alert_recipients AS
  SELECT u.venue_id AS venue_id, u.id AS user_id, 'native'::text AS source, NULL::uuid AS custody_id
  FROM auth_users u
  WHERE u.role = 'venue_admin' AND u.venue_id IS NOT NULL AND u.account_status = 'active'
  UNION ALL
  SELECT c.venue_id, u.id, 'custody'::text, c.id
  FROM admin_scope_custody c
  JOIN auth_users u ON u.id = c.custodian_user_id
  JOIN venues v ON v.id = c.venue_id
  WHERE c.released_at IS NULL
    AND u.account_status = 'active'
    AND (u.role = 'super_admin' OR (u.role = 'org_admin' AND u.organization_id = v.organization_id));

-- Who covers an organisation. Organisation-scope custody never creates a venue route.
CREATE VIEW organization_cover AS
  SELECT u.organization_id AS organization_id, u.id AS user_id, 'native'::text AS source, NULL::uuid AS custody_id
  FROM auth_users u
  WHERE u.role = 'org_admin' AND u.organization_id IS NOT NULL AND u.account_status = 'active'
  UNION ALL
  SELECT c.organization_id, u.id, 'custody'::text, c.id
  FROM admin_scope_custody c
  JOIN auth_users u ON u.id = c.custodian_user_id
  WHERE c.released_at IS NULL
    AND c.organization_id IS NOT NULL
    AND u.account_status = 'active'
    AND u.role = 'super_admin';

-- Routing state: at most one row. An absent row means mode 'legacy' with custody operations disabled.
-- changed_by deliberately has NO foreign key: with one, the TRUNCATE ... auth_users ... CASCADE used by the existing
-- test resets would silently empty this table. The audit event written by the future switch carries the actor.
CREATE TABLE admin_routing_state (
  singleton       boolean     PRIMARY KEY DEFAULT true,
  mode            text        NOT NULL DEFAULT 'legacy',
  custody_enabled boolean     NOT NULL DEFAULT false,
  changed_at      timestamptz NOT NULL DEFAULT now(),
  changed_by      uuid,
  change_reason   text,
  CONSTRAINT admin_routing_state_singleton_only
    CHECK (singleton),
  CONSTRAINT admin_routing_state_mode_supported
    CHECK (mode IN ('legacy', 'strict')),
  CONSTRAINT admin_routing_state_strict_requires_custody
    CHECK (mode = 'legacy' OR custody_enabled)
);

-- EVENT predicate: who actually receives venue alerts. While the mode is 'legacy' (or the row is absent) it adds, once,
-- the active super administrators that the accepted rule already notifies through their own venue_id, so deploying
-- this migration removes no recipient. In 'strict' mode it equals venue_alert_recipients.
CREATE VIEW venue_alert_recipients_effective AS
  SELECT venue_id, user_id, source, custody_id
  FROM venue_alert_recipients
  UNION ALL
  SELECT u.venue_id, u.id, 'legacy'::text, NULL::uuid
  FROM auth_users u
  WHERE COALESCE((SELECT s.mode FROM admin_routing_state s LIMIT 1), 'legacy') = 'legacy'
    AND u.role = 'super_admin'
    AND u.venue_id IS NOT NULL
    AND u.account_status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM venue_alert_recipients r
      WHERE r.venue_id = u.venue_id AND r.user_id = u.id
    );

COMMENT ON VIEW venue_alert_recipients IS 'STRICT coverage: native venue administrators and active venue-scope custodians. Not for event delivery.';
COMMENT ON VIEW venue_alert_recipients_effective IS 'EVENT delivery: strict set plus, in legacy routing mode only, super administrators with a venue_id.';
COMMENT ON VIEW organization_cover IS 'Organisation cover: native organisation administrators and active organisation-scope super-administrator custodians.';

-- The future escalation notice (D8) needs one more allowed notification type. Same NOT VALID / VALIDATE pattern as 0010.
ALTER TABLE notifications DROP CONSTRAINT notifications_type_supported;
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
      'round_postponed',
      'venue_unrouted'
    )) NOT VALID;
ALTER TABLE notifications VALIDATE CONSTRAINT notifications_type_supported;

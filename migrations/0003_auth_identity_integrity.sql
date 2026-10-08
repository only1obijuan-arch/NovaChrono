-- Gate 2B: canonical auth identity and credential integrity.
-- Forward-only and safe for both production and a fresh 0001 + 0002 schema.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM auth_users
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: canonical auth_users email duplicates exist';
  END IF;

  IF EXISTS (SELECT 1 FROM auth_users WHERE email IS NULL OR btrim(email) = '') THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: blank auth_users email exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth_accounts
    GROUP BY "userId", provider
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: duplicate auth_accounts owner/provider rows exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth_accounts
    GROUP BY provider, "providerAccountId"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: duplicate auth_accounts provider identity rows exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth_accounts a
    LEFT JOIN auth_users u ON u.id = a."userId"
    WHERE u.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: orphan auth_accounts rows exist';
  END IF;
END
$$;

UPDATE auth_users
SET email = lower(btrim(email))
WHERE email IS DISTINCT FROM lower(btrim(email));

ALTER TABLE auth_users
  ADD COLUMN IF NOT EXISTS image TEXT,
  ADD COLUMN IF NOT EXISTS push_token TEXT,
  ADD COLUMN IF NOT EXISTS sessions_valid_after TIMESTAMPTZ;

UPDATE auth_users
SET sessions_valid_after = TIMESTAMPTZ '1970-01-01 00:00:00+00'
WHERE sessions_valid_after IS NULL;

ALTER TABLE auth_users
  ALTER COLUMN sessions_valid_after SET DEFAULT TIMESTAMPTZ '1970-01-01 00:00:00+00',
  ALTER COLUMN sessions_valid_after SET NOT NULL,
  ALTER COLUMN role SET DEFAULT 'captain';

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'auth_users'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE auth_users DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  ALTER TABLE auth_users
    ADD CONSTRAINT auth_users_role_supported
    CHECK (role IS NULL OR role IN ('captain', 'referee', 'venue_admin', 'org_admin', 'super_admin'));
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS auth_users_email_lower_unique
  ON auth_users (lower(email));

-- A fresh historical schema has only credential fields. Production has the
-- wider Auth.js account shape. Add the compatibility fields without changing
-- the opaque primary-key type used by production.
ALTER TABLE auth_accounts
  ADD COLUMN IF NOT EXISTS access_token TEXT,
  ADD COLUMN IF NOT EXISTS expires_at BIGINT,
  ADD COLUMN IF NOT EXISTS refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS id_token TEXT,
  ADD COLUMN IF NOT EXISTS scope TEXT,
  ADD COLUMN IF NOT EXISTS session_state TEXT,
  ADD COLUMN IF NOT EXISTS token_type TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'auth_accounts'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'auth_users'::regclass
      AND c.conkey = ARRAY[
        (SELECT attnum FROM pg_attribute
         WHERE attrelid = 'auth_accounts'::regclass AND attname = 'userId')
      ]::smallint[]
  ) THEN
    ALTER TABLE auth_accounts
      ADD CONSTRAINT auth_accounts_user_id_fkey
      FOREIGN KEY ("userId") REFERENCES auth_users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = 'auth_accounts'::regclass
      AND i.indisunique
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND i.indkey::text = (
        SELECT string_agg(attnum::text, ' ' ORDER BY ordinality)
        FROM unnest(ARRAY[
          (SELECT attnum FROM pg_attribute WHERE attrelid = 'auth_accounts'::regclass AND attname = 'userId'),
          (SELECT attnum FROM pg_attribute WHERE attrelid = 'auth_accounts'::regclass AND attname = 'provider')
        ]) WITH ORDINALITY AS key_columns(attnum, ordinality)
      )
  ) THEN
    ALTER TABLE auth_accounts
      ADD CONSTRAINT auth_accounts_user_provider_key UNIQUE ("userId", provider);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = 'auth_accounts'::regclass
      AND i.indisunique AND i.indpred IS NULL AND i.indexprs IS NULL
      AND i.indkey::text = (
        SELECT string_agg(attnum::text, ' ' ORDER BY ordinality)
        FROM unnest(ARRAY[
          (SELECT attnum FROM pg_attribute WHERE attrelid = 'auth_accounts'::regclass AND attname = 'provider'),
          (SELECT attnum FROM pg_attribute WHERE attrelid = 'auth_accounts'::regclass AND attname = 'providerAccountId')
        ]) WITH ORDINALITY AS key_columns(attnum, ordinality)
      )
  ) THEN
    ALTER TABLE auth_accounts
      ADD CONSTRAINT auth_accounts_provider_identity_key UNIQUE (provider, "providerAccountId");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS auth_accounts_user_id_idx
  ON auth_accounts ("userId");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM password_reset_tokens prt
    LEFT JOIN auth_users u ON u.id = prt.user_id
    WHERE prt.user_id IS NULL OR u.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: invalid password reset owner exists';
  END IF;

  IF EXISTS (SELECT 1 FROM password_reset_tokens WHERE used IS NULL) THEN
    RAISE EXCEPTION 'Gate 2B precondition failed: password reset token has NULL used state';
  END IF;
END
$$;

ALTER TABLE password_reset_tokens
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN used SET DEFAULT FALSE,
  ALTER COLUMN used SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'password_reset_tokens'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'auth_users'::regclass
      AND c.conkey = ARRAY[
        (SELECT attnum FROM pg_attribute
         WHERE attrelid = 'password_reset_tokens'::regclass AND attname = 'user_id')
      ]::smallint[]
  ) THEN
    ALTER TABLE password_reset_tokens
      ADD CONSTRAINT password_reset_tokens_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx
  ON password_reset_tokens (user_id);

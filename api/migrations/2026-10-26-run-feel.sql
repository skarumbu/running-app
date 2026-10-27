-- Run feel redesign (2026-10-26).
--
-- Idempotent: safe to run against any existing database, whether or not the
-- 2026-08-25 history migration (PR #17) was applied. Run it once, manually,
-- BEFORE deploying the API that ships with it:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f api/migrations/2026-10-26-run-feel.sql
--
-- The whole file runs in one transaction, so a failure leaves the database
-- untouched.

BEGIN;

-- PR #17 (weather + route summary + note). Repeated here because it is not
-- known whether that manual migration was applied everywhere.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS weather_json JSONB;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS route_summary TEXT;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS route_thumbnail JSONB;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS note TEXT;

-- How the run felt. All optional or defaulted, so runs saved before this
-- change stay valid (feel NULL, empty tag lists).
ALTER TABLE runs ADD COLUMN IF NOT EXISTS feel SMALLINT CHECK (feel BETWEEN 1 AND 5);
ALTER TABLE runs ADD COLUMN IF NOT EXISTS body_tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS weather_feel TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS music JSONB;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS mid_run_notes JSONB NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS gear (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('shoe', 'top', 'bottom', 'headphones', 'hat', 'other')),
  color TEXT NOT NULL,
  retired BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS run_gear (
  run_id UUID REFERENCES runs(id) ON DELETE CASCADE NOT NULL,
  gear_id UUID REFERENCES gear(id) ON DELETE CASCADE NOT NULL,
  comfort SMALLINT CHECK (comfort BETWEEN 1 AND 3),
  note TEXT,
  PRIMARY KEY (run_id, gear_id)
);

CREATE INDEX IF NOT EXISTS idx_gear_user_id ON gear(user_id);
CREATE INDEX IF NOT EXISTS idx_run_gear_gear_id ON run_gear(gear_id);

COMMIT;

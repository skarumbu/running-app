-- Running App schema
-- Run against the Azure PostgreSQL instance declared in azure-infrastructure/modules/runningapp.bicep

-- Migration note (2026-08-25): the columns below were added after initial
-- deployment. Existing databases need this run manually before the new
-- API code is deployed:
--
--   ALTER TABLE runs
--     ADD COLUMN weather_json JSONB,
--     ADD COLUMN route_summary TEXT,
--     ADD COLUMN route_thumbnail JSONB,
--     ADD COLUMN note TEXT;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  distance_meters FLOAT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  avg_pace_seconds_per_km FLOAT,
  name TEXT,
  waypoints JSONB NOT NULL DEFAULT '[]',
  weather_json JSONB,
  route_summary TEXT,
  route_thumbnail JSONB,
  note TEXT
);

CREATE INDEX idx_runs_user_id ON runs(user_id);
CREATE INDEX idx_runs_started_at ON runs(started_at DESC);

CREATE TABLE badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  badge_type TEXT NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT now(),
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_badges_user_type ON badges(user_id, badge_type);

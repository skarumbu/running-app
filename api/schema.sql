-- Running App schema
-- Run against the Azure PostgreSQL instance declared in azure-infrastructure/modules/runningapp.bicep

-- This file is the full current schema, for creating a fresh database.
-- Existing databases are brought up to date with the idempotent files in
-- api/migrations/, run manually before deploying the API that needs them:
--
--   api/migrations/2026-10-26-run-feel.sql  (also covers the 2026-08-25
--     weather_json / route_summary / route_thumbnail / note columns)

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
  note TEXT,
  feel SMALLINT CHECK (feel BETWEEN 1 AND 5),
  body_tags TEXT[] NOT NULL DEFAULT '{}',
  weather_feel TEXT[] NOT NULL DEFAULT '{}',
  music JSONB,
  mid_run_notes JSONB NOT NULL DEFAULT '[]'
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

CREATE TABLE gear (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('shoe', 'top', 'bottom', 'headphones', 'hat', 'other')),
  color TEXT NOT NULL,
  retired BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_gear_user_id ON gear(user_id);

CREATE TABLE run_gear (
  run_id UUID REFERENCES runs(id) ON DELETE CASCADE NOT NULL,
  gear_id UUID REFERENCES gear(id) ON DELETE CASCADE NOT NULL,
  comfort SMALLINT CHECK (comfort BETWEEN 1 AND 3),
  note TEXT,
  PRIMARY KEY (run_id, gear_id)
);

CREATE INDEX idx_run_gear_gear_id ON run_gear(gear_id);

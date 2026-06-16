-- Running App schema
-- Run against the Azure PostgreSQL instance declared in azure-infrastructure/modules/runningapp.bicep

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE run_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  name TEXT
);

CREATE INDEX idx_run_sessions_user_id ON run_sessions(user_id);
CREATE INDEX idx_run_sessions_started_at ON run_sessions(started_at DESC);

CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES run_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  distance_meters FLOAT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  avg_pace_seconds_per_km FLOAT,
  name TEXT,
  waypoints JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX idx_runs_user_id ON runs(user_id);
CREATE INDEX idx_runs_started_at ON runs(started_at DESC);
CREATE INDEX idx_runs_session_id ON runs(session_id);

CREATE TABLE badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  badge_type TEXT NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT now(),
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_badges_user_type ON badges(user_id, badge_type);

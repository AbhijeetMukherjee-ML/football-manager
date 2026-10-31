-- Stage 7: PostgreSQL Relational Schema for Football Manager
-- Idempotent migration: creates clubs, managers, players, fixtures, and match_results tables.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clubs (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  short_name VARCHAR(80) NOT NULL,
  abbreviation VARCHAR(10) NOT NULL,
  nickname VARCHAR(80) NOT NULL DEFAULT '',
  founded INTEGER NOT NULL DEFAULT 1900,
  stadium VARCHAR(120) NOT NULL,
  stadium_capacity VARCHAR(40) NOT NULL DEFAULT '40,000',
  division VARCHAR(120) NOT NULL,
  league_standing VARCHAR(80) NOT NULL,
  league_points INTEGER NOT NULL DEFAULT 0,
  balance BIGINT NOT NULL DEFAULT 0,
  transfer_budget BIGINT NOT NULL DEFAULT 0,
  wage_budget_weekly BIGINT NOT NULL DEFAULT 0,
  in_game_date VARCHAR(64) NOT NULL,
  primary_color VARCHAR(24) NOT NULL DEFAULT '#10b981',
  accent_color VARCHAR(24) NOT NULL DEFAULT '#064e3b',
  formation VARCHAR(64) NOT NULL DEFAULT '4-3-3 Gegenpress',
  recent_form JSONB NOT NULL DEFAULT '[]'::jsonb,
  tactics_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS managers (
  id VARCHAR(64) PRIMARY KEY,
  club_id VARCHAR(64) NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  title VARCHAR(80) NOT NULL,
  nationality VARCHAR(80) NOT NULL,
  age INTEGER NOT NULL,
  reputation VARCHAR(80) NOT NULL,
  preferred_formation VARCHAR(64) NOT NULL,
  played INTEGER NOT NULL DEFAULT 0,
  won INTEGER NOT NULL DEFAULT 0,
  drawn INTEGER NOT NULL DEFAULT 0,
  lost INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS players (
  id VARCHAR(64) PRIMARY KEY,
  club_id VARCHAR(64) NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  shirt_number INTEGER NOT NULL,
  name VARCHAR(120) NOT NULL,
  nationality VARCHAR(80) NOT NULL,
  position VARCHAR(16) NOT NULL,
  position_group VARCHAR(16) NOT NULL,
  age INTEGER NOT NULL,
  overall INTEGER NOT NULL,
  potential INTEGER NOT NULL,
  weekly_wage INTEGER NOT NULL,
  fitness INTEGER NOT NULL,
  morale VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  preferred_foot VARCHAR(16) NOT NULL,
  appearances INTEGER NOT NULL DEFAULT 0,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_players_club_id ON players(club_id);

CREATE TABLE IF NOT EXISTS fixtures (
  id VARCHAR(64) PRIMARY KEY,
  competition VARCHAR(120) NOT NULL,
  matchday_number INTEGER NOT NULL DEFAULT 9,
  matchday_label VARCHAR(80) NOT NULL,
  home_club_id VARCHAR(64) NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  away_club_id VARCHAR(64) NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  kickoff_time VARCHAR(80) NOT NULL,
  date_label VARCHAR(80) NOT NULL,
  venue VARCHAR(120) NOT NULL,
  weather VARCHAR(80) NOT NULL,
  referee VARCHAR(80) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  home_score INTEGER,
  away_score INTEGER,
  match_seed VARCHAR(128),
  played_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_results (
  id VARCHAR(128) PRIMARY KEY,
  submission_key VARCHAR(160) NOT NULL UNIQUE,
  fixture_id VARCHAR(64) REFERENCES fixtures(id) ON DELETE SET NULL,
  seed VARCHAR(128) NOT NULL,
  numeric_seed BIGINT NOT NULL,
  competition VARCHAR(120) NOT NULL,
  venue VARCHAR(120) NOT NULL,
  home_club_id VARCHAR(64) NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  away_club_id VARCHAR(64) NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  home_score INTEGER NOT NULL,
  away_score INTEGER NOT NULL,
  stoppage_time_json JSONB NOT NULL,
  home_team_snapshot_json JSONB NOT NULL,
  away_team_snapshot_json JSONB NOT NULL,
  stats_json JSONB NOT NULL,
  events_json JSONB NOT NULL,
  warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_results_fixture_id ON match_results(fixture_id);
CREATE INDEX IF NOT EXISTS idx_match_results_created_at ON match_results(created_at DESC);

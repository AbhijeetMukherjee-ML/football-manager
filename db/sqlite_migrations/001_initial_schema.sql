-- Stage 9: SQLite Relational Schema for Football Manager Desktop
-- Idempotent schema: creates schema_migrations, clubs, managers, players, fixtures, and match_results tables.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  founded INTEGER NOT NULL DEFAULT 1900,
  stadium TEXT NOT NULL,
  stadium_capacity TEXT NOT NULL DEFAULT '40,000',
  division TEXT NOT NULL,
  league_standing TEXT NOT NULL,
  league_points INTEGER NOT NULL DEFAULT 0,
  balance INTEGER NOT NULL DEFAULT 0,
  transfer_budget INTEGER NOT NULL DEFAULT 0,
  wage_budget_weekly INTEGER NOT NULL DEFAULT 0,
  in_game_date TEXT NOT NULL,
  primary_color TEXT NOT NULL DEFAULT '#10b981',
  accent_color TEXT NOT NULL DEFAULT '#064e3b',
  formation TEXT NOT NULL DEFAULT '4-3-3 Gegenpress',
  recent_form TEXT NOT NULL DEFAULT '[]',
  tactics_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS managers (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  nationality TEXT NOT NULL,
  age INTEGER NOT NULL,
  reputation TEXT NOT NULL,
  preferred_formation TEXT NOT NULL,
  played INTEGER NOT NULL DEFAULT 0,
  won INTEGER NOT NULL DEFAULT 0,
  drawn INTEGER NOT NULL DEFAULT 0,
  lost INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  shirt_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  nationality TEXT NOT NULL,
  position TEXT NOT NULL,
  position_group TEXT NOT NULL,
  age INTEGER NOT NULL,
  overall INTEGER NOT NULL,
  potential INTEGER NOT NULL,
  weekly_wage INTEGER NOT NULL,
  fitness INTEGER NOT NULL,
  morale TEXT NOT NULL,
  status TEXT NOT NULL,
  preferred_foot TEXT NOT NULL,
  appearances INTEGER NOT NULL DEFAULT 0,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_players_club_id ON players(club_id);

CREATE TABLE IF NOT EXISTS fixtures (
  id TEXT PRIMARY KEY,
  competition TEXT NOT NULL,
  matchday_number INTEGER NOT NULL DEFAULT 9,
  matchday_label TEXT NOT NULL,
  home_club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  away_club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  kickoff_time TEXT NOT NULL,
  date_label TEXT NOT NULL,
  venue TEXT NOT NULL,
  weather TEXT NOT NULL,
  referee TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  home_score INTEGER,
  away_score INTEGER,
  match_seed TEXT,
  played_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS match_results (
  id TEXT PRIMARY KEY,
  submission_key TEXT NOT NULL UNIQUE,
  fixture_id TEXT REFERENCES fixtures(id) ON DELETE SET NULL,
  seed TEXT NOT NULL,
  numeric_seed INTEGER NOT NULL,
  competition TEXT NOT NULL,
  venue TEXT NOT NULL,
  home_club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  away_club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  home_score INTEGER NOT NULL,
  away_score INTEGER NOT NULL,
  stoppage_time_json TEXT NOT NULL,
  home_team_snapshot_json TEXT NOT NULL,
  away_team_snapshot_json TEXT NOT NULL,
  stats_json TEXT NOT NULL,
  events_json TEXT NOT NULL,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_match_results_fixture_id ON match_results(fixture_id);
CREATE INDEX IF NOT EXISTS idx_match_results_created_at ON match_results(created_at DESC);

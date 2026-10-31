import fs from "node:fs";
import path from "node:path";
import type { Database as SqliteDatabase } from "better-sqlite3";
import {
  AWAY_SQUAD_PLAYERS,
  AWAY_TACTICS,
  CLUB_INFO,
  HOME_TACTICS,
  MANAGER_PROFILE,
  NEXT_FIXTURE,
  SQUAD_PLAYERS,
} from "../data/mockClubData";
import {
  MatchSimulationResult,
  TacticalSettings,
} from "../engine/matchEngine";
import {
  ClubInfo,
  ManagerProfile,
  NextFixture,
  Player,
  PlayerStatus,
  PositionGroup,
  SpecificPosition,
} from "../types/football";
import {
  closeSqliteDatabase,
  getSqliteDatabase,
  normalizeSqliteError,
} from "./sqlite";
import {
  ClubRepository,
  ConflictError,
  PersistedClubAndSeasonState,
  SaveMatchOutcome,
  SaveMatchSubmission,
  UpdateClubAndSquadInput,
  ValidationError,
} from "./types";
import {
  AWAY_CLUB_ID,
  HOME_CLUB_ID,
  HOME_MANAGER_ID,
  INITIAL_FIXTURE_ID,
  validateClubUpdatePayload,
  validateMatchSubmissionPayload,
} from "./repository";

interface DbClubRow {
  id: string;
  name: string;
  short_name: string;
  abbreviation: string;
  nickname: string;
  founded: number;
  stadium: string;
  stadium_capacity: string;
  division: string;
  league_standing: string;
  league_points: number;
  balance: number;
  transfer_budget: number;
  wage_budget_weekly: number;
  in_game_date: string;
  primary_color: string;
  accent_color: string;
  formation: string;
  recent_form: string;
  tactics_json: string;
}

interface DbManagerRow {
  id: string;
  club_id: string;
  name: string;
  title: string;
  nationality: string;
  age: number;
  reputation: string;
  preferred_formation: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
}

interface DbPlayerRow {
  id: string;
  club_id: string;
  shirt_number: number;
  name: string;
  nationality: string;
  position: SpecificPosition;
  position_group: Exclude<PositionGroup, "ALL">;
  age: number;
  overall: number;
  potential: number;
  weekly_wage: number;
  fitness: number;
  morale: "Superb" | "Good" | "Content";
  status: PlayerStatus;
  preferred_foot: "Left" | "Right" | "Both";
  appearances: number;
  goals: number;
  assists: number;
  saves: number;
}

interface DbFixtureRow {
  id: string;
  competition: string;
  matchday_number: number;
  matchday_label: string;
  home_club_id: string;
  away_club_id: string;
  kickoff_time: string;
  date_label: string;
  venue: string;
  weather: string;
  referee: string;
  status: string;
}

interface DbMatchResultRow {
  id: string;
  seed: string;
  numeric_seed: number | string;
  competition: string;
  venue: string;
  stoppage_time_json: string;
  home_team_snapshot_json: string;
  away_team_snapshot_json: string;
  stats_json: string;
  events_json: string;
  warnings_json: string;
}

function parseJsonColumn<T>(val: T | string): T {
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as T;
    } catch {
      return val as unknown as T;
    }
  }
  return val;
}

function mapPlayerRow(row: DbPlayerRow): Player {
  return {
    id: row.id,
    shirtNumber: Number(row.shirt_number),
    name: row.name,
    nationality: row.nationality,
    position: row.position,
    positionGroup: row.position_group,
    age: Number(row.age),
    overall: Number(row.overall),
    potential: Number(row.potential),
    weeklyWage: Number(row.weekly_wage),
    fitness: Number(row.fitness),
    morale: row.morale,
    status: row.status,
    preferredFoot: row.preferred_foot,
    appearances: Number(row.appearances ?? 0),
    goals: Number(row.goals ?? 0),
    assists: Number(row.assists ?? 0),
    saves: Number(row.saves ?? 0),
  };
}

function mapMatchResultRow(row: DbMatchResultRow): MatchSimulationResult {
  return {
    seed: row.seed,
    numericSeed: Number(row.numeric_seed),
    status: "Full Time",
    competition: row.competition,
    venue: row.venue,
    stoppageTime: parseJsonColumn<MatchSimulationResult["stoppageTime"]>(
      row.stoppage_time_json
    ),
    homeTeam: parseJsonColumn<MatchSimulationResult["homeTeam"]>(
      row.home_team_snapshot_json
    ),
    awayTeam: parseJsonColumn<MatchSimulationResult["awayTeam"]>(
      row.away_team_snapshot_json
    ),
    events: parseJsonColumn<MatchSimulationResult["events"]>(row.events_json),
    stats: parseJsonColumn<MatchSimulationResult["stats"]>(row.stats_json),
    warnings: parseJsonColumn<string[]>(row.warnings_json),
  };
}

/**
 * SQLite repository implementing `ClubRepository`.
 * Provides durable, in-process persistence for desktop Windows and standalone modes.
 */
export class SqliteClubRepository implements ClubRepository {
  public readonly driver = "sqlite" as const;
  private db: SqliteDatabase;

  constructor(dbOrPath?: SqliteDatabase | string) {
    if (typeof dbOrPath === "string" || dbOrPath === undefined) {
      this.db = getSqliteDatabase(dbOrPath as string | undefined);
    } else {
      this.db = dbOrPath;
    }
  }

  public getRawDatabase(): SqliteDatabase {
    return this.db;
  }

  public async applyMigrations(): Promise<{ version: string; applied: boolean }> {
    try {
      const version = "001_initial_schema";
      const migrationPath = path.join(
        process.cwd(),
        "db",
        "sqlite_migrations",
        "001_initial_schema.sql"
      );

      let sql = "";
      if (fs.existsSync(migrationPath)) {
        sql = fs.readFileSync(migrationPath, "utf8");
      } else {
        // Safe embedded fallback schema
        sql = `
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
        `;
      }

      const applyTx = this.db.transaction(() => {
        this.db.exec(sql);
        const row = this.db
          .prepare("SELECT version FROM schema_migrations WHERE version = ?")
          .get(version) as { version: string } | undefined;

        if (!row) {
          this.db
            .prepare("INSERT INTO schema_migrations (version) VALUES (?)")
            .run(version);
          return { version, applied: true };
        }
        return { version, applied: false };
      });

      return applyTx();
    } catch (err) {
      throw normalizeSqliteError(err);
    }
  }

  public async seedInitialData(forceReset = false): Promise<{ seeded: boolean }> {
    try {
      const seedTx = this.db.transaction(() => {
        if (forceReset) {
          this.db.prepare("DELETE FROM match_results").run();
          this.db.prepare("DELETE FROM fixtures").run();
          this.db.prepare("DELETE FROM players").run();
          this.db.prepare("DELETE FROM managers").run();
          this.db.prepare("DELETE FROM clubs").run();
        } else {
          const existing = this.db
            .prepare("SELECT id FROM clubs WHERE id = ?")
            .get(HOME_CLUB_ID) as { id: string } | undefined;
          if (existing) {
            return { seeded: false };
          }
        }

        const insertClub = this.db.prepare(
          `INSERT INTO clubs (
            id, name, short_name, abbreviation, nickname, founded, stadium,
            stadium_capacity, division, league_standing, league_points,
            balance, transfer_budget, wage_budget_weekly, in_game_date,
            primary_color, accent_color, formation, recent_form, tactics_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO NOTHING`
        );

        // Home Club
        insertClub.run(
          HOME_CLUB_ID,
          CLUB_INFO.name,
          CLUB_INFO.shortName,
          NEXT_FIXTURE.homeClub.abbreviation,
          CLUB_INFO.nickname,
          CLUB_INFO.founded,
          CLUB_INFO.stadium,
          CLUB_INFO.stadiumCapacity,
          CLUB_INFO.division,
          CLUB_INFO.leagueStanding,
          19,
          CLUB_INFO.balance,
          CLUB_INFO.transferBudget,
          CLUB_INFO.wageBudgetWeekly,
          CLUB_INFO.inGameDate,
          NEXT_FIXTURE.homeClub.primaryColor,
          NEXT_FIXTURE.homeClub.accentColor,
          MANAGER_PROFILE.preferredFormation,
          JSON.stringify(NEXT_FIXTURE.homeClub.recentForm),
          JSON.stringify(HOME_TACTICS)
        );

        // Away Club
        insertClub.run(
          AWAY_CLUB_ID,
          NEXT_FIXTURE.awayClub.name,
          NEXT_FIXTURE.awayClub.shortName,
          NEXT_FIXTURE.awayClub.abbreviation,
          "The Rovers",
          1902,
          "Castlemere Ground",
          "36,000",
          CLUB_INFO.division,
          "4th in League (16 pts)",
          16,
          31_000_000,
          12_500_000,
          540_000,
          CLUB_INFO.inGameDate,
          NEXT_FIXTURE.awayClub.primaryColor,
          NEXT_FIXTURE.awayClub.accentColor,
          "4-2-3-1 Balanced",
          JSON.stringify(NEXT_FIXTURE.awayClub.recentForm),
          JSON.stringify(AWAY_TACTICS)
        );

        // Manager Profile
        this.db
          .prepare(
            `INSERT INTO managers (
              id, club_id, name, title, nationality, age, reputation,
              preferred_formation, played, won, drawn, lost
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO NOTHING`
          )
          .run(
            HOME_MANAGER_ID,
            HOME_CLUB_ID,
            MANAGER_PROFILE.name,
            MANAGER_PROFILE.title,
            MANAGER_PROFILE.nationality,
            MANAGER_PROFILE.age,
            MANAGER_PROFILE.reputation,
            MANAGER_PROFILE.preferredFormation,
            MANAGER_PROFILE.seasonRecord.played,
            MANAGER_PROFILE.seasonRecord.won,
            MANAGER_PROFILE.seasonRecord.drawn,
            MANAGER_PROFILE.seasonRecord.lost
          );

        // Squad Players
        const insertPlayer = this.db.prepare(
          `INSERT INTO players (
            id, club_id, shirt_number, name, nationality, position,
            position_group, age, overall, potential, weekly_wage,
            fitness, morale, status, preferred_foot,
            appearances, goals, assists, saves
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO NOTHING`
        );

        for (const p of SQUAD_PLAYERS) {
          insertPlayer.run(
            p.id,
            HOME_CLUB_ID,
            p.shirtNumber,
            p.name,
            p.nationality,
            p.position,
            p.positionGroup,
            p.age,
            p.overall,
            p.potential,
            p.weeklyWage,
            p.fitness,
            p.morale,
            p.status,
            p.preferredFoot,
            p.appearances ?? 0,
            p.goals ?? 0,
            p.assists ?? 0,
            p.saves ?? 0
          );
        }

        for (const p of AWAY_SQUAD_PLAYERS) {
          insertPlayer.run(
            p.id,
            AWAY_CLUB_ID,
            p.shirtNumber,
            p.name,
            p.nationality,
            p.position,
            p.positionGroup,
            p.age,
            p.overall,
            p.potential,
            p.weeklyWage,
            p.fitness,
            p.morale,
            p.status,
            p.preferredFoot,
            p.appearances ?? 0,
            p.goals ?? 0,
            p.assists ?? 0,
            p.saves ?? 0
          );
        }

        // Matchday 9 Initial Fixture
        this.db
          .prepare(
            `INSERT INTO fixtures (
              id, competition, matchday_number, matchday_label,
              home_club_id, away_club_id, kickoff_time, date_label,
              venue, weather, referee, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
            ON CONFLICT (id) DO NOTHING`
          )
          .run(
            NEXT_FIXTURE.id,
            NEXT_FIXTURE.competition,
            9,
            NEXT_FIXTURE.matchdayLabel,
            HOME_CLUB_ID,
            AWAY_CLUB_ID,
            NEXT_FIXTURE.kickoffTime,
            NEXT_FIXTURE.dateLabel,
            NEXT_FIXTURE.venue,
            NEXT_FIXTURE.weather,
            NEXT_FIXTURE.referee
          );

        return { seeded: true };
      });

      return seedTx();
    } catch (err) {
      throw normalizeSqliteError(err);
    }
  }

  private readStateSync(): PersistedClubAndSeasonState {
    const clubsRows = this.db
      .prepare("SELECT * FROM clubs WHERE id IN (?, ?)")
      .all(HOME_CLUB_ID, AWAY_CLUB_ID) as DbClubRow[];

    if (clubsRows.length === 0) {
      this.seedInitialData(false);
      return this.readStateSync();
    }

    const homeClubRow =
      clubsRows.find((c) => c.id === HOME_CLUB_ID) ?? clubsRows[0];
    const awayClubRow =
      clubsRows.find((c) => c.id === AWAY_CLUB_ID) ?? clubsRows[0];

    const mgrRow = this.db
      .prepare("SELECT * FROM managers WHERE club_id = ? LIMIT 1")
      .get(HOME_CLUB_ID) as DbManagerRow | undefined;

    const playersRows = this.db
      .prepare("SELECT * FROM players WHERE club_id IN (?, ?) ORDER BY shirt_number ASC, id ASC")
      .all(HOME_CLUB_ID, AWAY_CLUB_ID) as DbPlayerRow[];

    const homePlayers = playersRows
      .filter((p) => p.club_id === HOME_CLUB_ID)
      .map(mapPlayerRow);
    const awayPlayers = playersRows
      .filter((p) => p.club_id === AWAY_CLUB_ID)
      .map(mapPlayerRow);

    let fixtureRow = this.db
      .prepare("SELECT * FROM fixtures WHERE status = 'scheduled' ORDER BY matchday_number ASC LIMIT 1")
      .get() as DbFixtureRow | undefined;

    if (!fixtureRow) {
      fixtureRow = this.db
        .prepare("SELECT * FROM fixtures ORDER BY matchday_number DESC LIMIT 1")
        .get() as DbFixtureRow | undefined;
    }

    const matchesRows = this.db
      .prepare("SELECT * FROM match_results ORDER BY created_at DESC LIMIT 15")
      .all() as DbMatchResultRow[];
    const recentMatches = matchesRows.map(mapMatchResultRow);

    const countRow = this.db
      .prepare("SELECT COUNT(*) AS total FROM match_results")
      .get() as { total: number } | undefined;
    const simulationCount = Number(countRow?.total ?? 0);

    const homeForm = parseJsonColumn<("W" | "D" | "L")[]>(
      homeClubRow.recent_form
    );
    const awayForm = parseJsonColumn<("W" | "D" | "L")[]>(
      awayClubRow.recent_form
    );

    const club: ClubInfo = {
      name: homeClubRow.name,
      shortName: homeClubRow.short_name,
      nickname: homeClubRow.nickname,
      founded: Number(homeClubRow.founded),
      stadium: homeClubRow.stadium,
      stadiumCapacity: homeClubRow.stadium_capacity,
      division: homeClubRow.division,
      leagueStanding: homeClubRow.league_standing,
      balance: Number(homeClubRow.balance),
      transferBudget: Number(homeClubRow.transfer_budget),
      wageBudgetWeekly: Number(homeClubRow.wage_budget_weekly),
      inGameDate: homeClubRow.in_game_date,
    };

    const manager: ManagerProfile = mgrRow
      ? {
          name: mgrRow.name,
          title: mgrRow.title,
          nationality: mgrRow.nationality,
          age: Number(mgrRow.age),
          reputation: mgrRow.reputation,
          preferredFormation: mgrRow.preferred_formation,
          seasonRecord: {
            played: Number(mgrRow.played),
            won: Number(mgrRow.won),
            drawn: Number(mgrRow.drawn),
            lost: Number(mgrRow.lost),
          },
        }
      : MANAGER_PROFILE;

    const nextFixture: NextFixture = fixtureRow
      ? {
          id: fixtureRow.id,
          competition: fixtureRow.competition,
          matchdayLabel: fixtureRow.matchday_label,
          homeClub: {
            name: homeClubRow.name,
            shortName: homeClubRow.short_name,
            abbreviation: homeClubRow.abbreviation,
            leaguePosition:
              homeClubRow.league_standing.split(" ")[0] || "2nd",
            recentForm: homeForm.slice(-5),
            primaryColor: homeClubRow.primary_color,
            accentColor: homeClubRow.accent_color,
          },
          awayClub: {
            name: awayClubRow.name,
            shortName: awayClubRow.short_name,
            abbreviation: awayClubRow.abbreviation,
            leaguePosition:
              awayClubRow.league_standing.split(" ")[0] || "4th",
            recentForm: awayForm.slice(-5),
            primaryColor: awayClubRow.primary_color,
            accentColor: awayClubRow.accent_color,
          },
          kickoffTime: fixtureRow.kickoff_time,
          dateLabel: fixtureRow.date_label,
          venue: fixtureRow.venue,
          weather: fixtureRow.weather,
          referee: fixtureRow.referee,
        }
      : NEXT_FIXTURE;

    return {
      club,
      manager,
      players: homePlayers,
      awayPlayers,
      homeTactics: parseJsonColumn<TacticalSettings>(homeClubRow.tactics_json),
      awayTactics: parseJsonColumn<TacticalSettings>(awayClubRow.tactics_json),
      nextFixture,
      recentMatches,
      simulationCount,
    };
  }

  public async loadClubState(): Promise<PersistedClubAndSeasonState> {
    try {
      return this.readStateSync();
    } catch (err) {
      throw normalizeSqliteError(err);
    }
  }

  public async updateClubTacticsAndSquad(
    rawInput: UpdateClubAndSquadInput
  ): Promise<PersistedClubAndSeasonState> {
    const input = validateClubUpdatePayload(rawInput);

    try {
      const updateTx = this.db.transaction(() => {
        const current = this.readStateSync();

        if (input.homeTactics) {
          const mergedTactics: TacticalSettings = {
            ...current.homeTactics,
            ...input.homeTactics,
          };
          this.db
            .prepare(
              "UPDATE clubs SET tactics_json = ?, updated_at = datetime('now') WHERE id = ?"
            )
            .run(JSON.stringify(mergedTactics), HOME_CLUB_ID);
        }

        if (input.preferredFormation) {
          this.db
            .prepare(
              "UPDATE clubs SET formation = ?, updated_at = datetime('now') WHERE id = ?"
            )
            .run(input.preferredFormation, HOME_CLUB_ID);
          this.db
            .prepare(
              "UPDATE managers SET preferred_formation = ?, updated_at = datetime('now') WHERE club_id = ?"
            )
            .run(input.preferredFormation, HOME_CLUB_ID);
        }

        if (input.playerStatuses && input.playerStatuses.length > 0) {
          const stmt = this.db.prepare(
            "UPDATE players SET status = ?, updated_at = datetime('now') WHERE id = ? AND club_id = ?"
          );
          for (const item of input.playerStatuses) {
            stmt.run(item.status, item.playerId, HOME_CLUB_ID);
          }
        }

        if (input.playerUpdates && input.playerUpdates.length > 0) {
          for (const item of input.playerUpdates) {
            if (item.status !== undefined) {
              this.db
                .prepare(
                  "UPDATE players SET status = ?, updated_at = datetime('now') WHERE id = ? AND club_id = ?"
                )
                .run(item.status, item.playerId, HOME_CLUB_ID);
            }
            if (item.fitness !== undefined) {
              this.db
                .prepare(
                  "UPDATE players SET fitness = ?, updated_at = datetime('now') WHERE id = ? AND club_id = ?"
                )
                .run(item.fitness, item.playerId, HOME_CLUB_ID);
            }
            if (item.morale !== undefined) {
              this.db
                .prepare(
                  "UPDATE players SET morale = ?, updated_at = datetime('now') WHERE id = ? AND club_id = ?"
                )
                .run(item.morale, item.playerId, HOME_CLUB_ID);
            }
          }
        }

        if (input.recoverSquadFitness) {
          this.db
            .prepare(
              "UPDATE players SET fitness = MIN(100, fitness + 12), updated_at = datetime('now') WHERE club_id IN (?, ?)"
            )
            .run(HOME_CLUB_ID, AWAY_CLUB_ID);
        }

        return this.readStateSync();
      });

      return updateTx();
    } catch (err) {
      throw normalizeSqliteError(err);
    }
  }

  public async saveMatchResult(
    rawSubmission: SaveMatchSubmission
  ): Promise<SaveMatchOutcome> {
    const submission = validateMatchSubmissionPayload(rawSubmission);
    const { result } = submission;
    const fixtureId = submission.fixtureId ?? INITIAL_FIXTURE_ID;
    const submissionKey =
      submission.submissionKey ?? `${fixtureId}:${result.seed}`;
    const matchId = `match-${fixtureId}-${result.numericSeed}`;

    try {
      const saveTx = this.db.transaction(() => {
        // Ensure initial baseline exists
        this.readStateSync();

        // 1. Verify fixture exists
        const fxRow = this.db
          .prepare("SELECT * FROM fixtures WHERE id = ? LIMIT 1")
          .get(fixtureId) as DbFixtureRow | undefined;

        if (!fxRow) {
          throw new ValidationError(`Unknown fixtureId: "${fixtureId}".`);
        }

        // 2. Check idempotency key to prevent duplicate writes
        const existingMatch = this.db
          .prepare("SELECT id FROM match_results WHERE submission_key = ? LIMIT 1")
          .get(submissionKey) as { id: string } | undefined;

        if (existingMatch) {
          const state = this.readStateSync();
          return {
            duplicate: true,
            matchId: existingMatch.id,
            submissionKey,
            state,
          };
        }

        // 3. Reject second results for already completed fixtures
        if (fxRow.status === "completed") {
          throw new ConflictError(
            `Fixture "${fixtureId}" already has a completed result; a second result cannot be recorded.`
          );
        }

        // 4. Insert completed match result
        this.db
          .prepare(
            `INSERT INTO match_results (
              id, submission_key, fixture_id, seed, numeric_seed,
              competition, venue, home_club_id, away_club_id,
              home_score, away_score, stoppage_time_json,
              home_team_snapshot_json, away_team_snapshot_json,
              stats_json, events_json, warnings_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            matchId,
            submissionKey,
            fixtureId,
            result.seed,
            result.numericSeed,
            result.competition,
            result.venue,
            HOME_CLUB_ID,
            AWAY_CLUB_ID,
            result.homeTeam.score,
            result.awayTeam.score,
            JSON.stringify(result.stoppageTime),
            JSON.stringify(result.homeTeam),
            JSON.stringify(result.awayTeam),
            JSON.stringify(result.stats),
            JSON.stringify(result.events),
            JSON.stringify(result.warnings)
          );

        // 5. Update active fixture and generate next fixture
        const currentMd = Number(fxRow.matchday_number ?? 9);
        this.db
          .prepare(
            `UPDATE fixtures
             SET status = 'completed',
                 home_score = ?,
                 away_score = ?,
                 match_seed = ?,
                 played_at = datetime('now'),
                 updated_at = datetime('now')
             WHERE id = ?`
          )
          .run(
            result.homeTeam.score,
            result.awayTeam.score,
            result.seed,
            fixtureId
          );

        const nextMd = Math.min(38, currentMd + 1);
        const nextFixtureId = `fix-md-${String(nextMd).padStart(2, "0")}`;

        this.db
          .prepare(
            `INSERT INTO fixtures (
              id, competition, matchday_number, matchday_label,
              home_club_id, away_club_id, kickoff_time, date_label,
              venue, weather, referee, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
            ON CONFLICT (id) DO NOTHING`
          )
          .run(
            nextFixtureId,
            result.competition,
            nextMd,
            `Matchday ${nextMd} of 38`,
            HOME_CLUB_ID,
            AWAY_CLUB_ID,
            NEXT_FIXTURE.kickoffTime,
            `Matchday ${nextMd} Fixture`,
            result.venue,
            NEXT_FIXTURE.weather,
            NEXT_FIXTURE.referee
          );

        // 6. Update Manager Profile
        const homeWon = result.homeTeam.score > result.awayTeam.score ? 1 : 0;
        const isDraw = result.homeTeam.score === result.awayTeam.score ? 1 : 0;
        const homeLost = result.homeTeam.score < result.awayTeam.score ? 1 : 0;
        const homePointsDelta = homeWon ? 3 : isDraw ? 1 : 0;
        const awayPointsDelta = homeLost ? 3 : isDraw ? 1 : 0;
        const homeFormChar: "W" | "D" | "L" = homeWon
          ? "W"
          : isDraw
            ? "D"
            : "L";
        const awayFormChar: "W" | "D" | "L" = homeLost
          ? "W"
          : isDraw
            ? "D"
            : "L";

        this.db
          .prepare(
            `UPDATE managers
             SET played = played + 1,
                 won = won + ?,
                 drawn = drawn + ?,
                 lost = lost + ?,
                 updated_at = datetime('now')
             WHERE club_id = ?`
          )
          .run(homeWon, isDraw, homeLost, HOME_CLUB_ID);

        // 7. Update Club points and form
        const clubsRows = this.db
          .prepare("SELECT id, league_points, recent_form FROM clubs WHERE id IN (?, ?)")
          .all(HOME_CLUB_ID, AWAY_CLUB_ID) as DbClubRow[];

        const updateClubStmt = this.db.prepare(
          `UPDATE clubs
           SET league_points = ?,
               league_standing = ?,
               recent_form = ?,
               updated_at = datetime('now')
           WHERE id = ?`
        );

        for (const cRow of clubsRows) {
          const isHome = cRow.id === HOME_CLUB_ID;
          const newPoints =
            Number(cRow.league_points) +
            (isHome ? homePointsDelta : awayPointsDelta);
          const prevForm = parseJsonColumn<("W" | "D" | "L")[]>(
            cRow.recent_form
          );
          const updatedForm = [
            ...prevForm,
            isHome ? homeFormChar : awayFormChar,
          ].slice(-5);
          const rankLabel = isHome
            ? newPoints >= 22
              ? "1st"
              : "2nd"
            : newPoints >= 19
              ? "3rd"
              : "4th";
          const standingLabel = `${rankLabel} in League (${newPoints} pts)`;

          updateClubStmt.run(
            newPoints,
            standingLabel,
            JSON.stringify(updatedForm),
            cRow.id
          );
        }

        // 8. Update Player Statistics and Fitness
        const allPlayerSummaries = [
          ...result.homeTeam.players,
          ...result.awayTeam.players,
        ];

        const updatePlayerStmt = this.db.prepare(
          `UPDATE players
           SET fitness = ?,
               appearances = appearances + 1,
               goals = goals + ?,
               assists = assists + ?,
               saves = saves + ?,
               updated_at = datetime('now')
           WHERE id = ?`
        );

        for (const ps of allPlayerSummaries) {
          updatePlayerStmt.run(
            ps.endFitness,
            ps.goals,
            ps.assists,
            ps.saves,
            ps.id
          );
        }

        const state = this.readStateSync();
        return {
          duplicate: false,
          matchId,
          submissionKey,
          state,
        };
      });

      return saveTx();
    } catch (err) {
      throw normalizeSqliteError(err);
    }
  }

  public close(): void {
    closeSqliteDatabase(this.db);
  }
}

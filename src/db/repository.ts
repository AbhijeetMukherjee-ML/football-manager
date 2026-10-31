import fs from "node:fs";
import path from "node:path";
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
  getPostgresPool,
  normalizeDatabaseError,
  SqlPoolAdapter,
  SqlQueryClient,
  withTransaction,
} from "./postgres";
import type { ClubRepository } from "./types";

export const HOME_CLUB_ID = "club-nba";
export const AWAY_CLUB_ID = "club-cmr";
export const HOME_MANAGER_ID = "mgr-vance";
export const INITIAL_FIXTURE_ID = "fix-md-09";

export interface PersistedClubAndSeasonState {
  club: ClubInfo;
  manager: ManagerProfile;
  players: Player[];
  awayPlayers: Player[];
  homeTactics: TacticalSettings;
  awayTactics: TacticalSettings;
  nextFixture: NextFixture;
  recentMatches: MatchSimulationResult[];
  simulationCount: number;
}

export interface SaveMatchSubmission {
  result: MatchSimulationResult;
  fixtureId?: string;
  submissionKey?: string;
}

export interface SaveMatchOutcome {
  duplicate: boolean;
  matchId: string;
  submissionKey: string;
  state: PersistedClubAndSeasonState;
}

export interface PlayerPatchItem {
  playerId: string;
  status?: PlayerStatus;
  fitness?: number;
  morale?: "Superb" | "Good" | "Content";
}

export interface UpdateClubAndSquadInput {
  homeTactics?: Partial<TacticalSettings>;
  preferredFormation?: string;
  playerStatuses?: { playerId: string; status: PlayerStatus }[];
  playerUpdates?: PlayerPatchItem[];
  recoverSquadFitness?: boolean;
}

export class ValidationError extends Error {
  public readonly code = "VALIDATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ConflictError extends Error {
  public readonly code = "CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;
const VALID_MENTALITIES = new Set([
  "Defensive",
  "Balanced",
  "Positive",
  "Attacking",
]);
const VALID_PRESSING = new Set(["Low", "Standard", "High", "Gegenpress"]);
const VALID_TEMPOS = new Set(["Slow", "Standard", "Fast"]);
const VALID_PASSING = new Set(["Short", "Mixed", "Direct"]);
const VALID_STATUSES = new Set<PlayerStatus>([
  "Starting XI",
  "Bench",
  "Reserve",
]);
const VALID_MORALES = new Set(["Superb", "Good", "Content"]);
const ALLOWED_CLUB_PATCH_KEYS = new Set([
  "action",
  "homeTactics",
  "preferredFormation",
  "playerStatuses",
  "playerUpdates",
  "recoverSquadFitness",
]);

export function validateClubUpdatePayload(
  raw: unknown
): UpdateClubAndSquadInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError("Request payload must be a JSON object.");
  }

  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_CLUB_PATCH_KEYS.has(key)) {
      throw new ValidationError(`Unsupported club update field: "${key}".`);
    }
  }

  const hasUpdateField =
    obj.homeTactics !== undefined ||
    obj.preferredFormation !== undefined ||
    obj.playerStatuses !== undefined ||
    obj.playerUpdates !== undefined ||
    obj.recoverSquadFitness !== undefined;

  if (!hasUpdateField) {
    throw new ValidationError(
      "At least one supported update field (homeTactics, preferredFormation, playerStatuses, playerUpdates, recoverSquadFitness) is required."
    );
  }

  if (obj.homeTactics !== undefined) {
    if (
      !obj.homeTactics ||
      typeof obj.homeTactics !== "object" ||
      Array.isArray(obj.homeTactics)
    ) {
      throw new ValidationError("homeTactics must be an object.");
    }
    const t = obj.homeTactics as Record<string, unknown>;
    const allowedTacticKeys = new Set([
      "mentality",
      "pressingIntensity",
      "tempo",
      "passingStyle",
    ]);
    for (const tk of Object.keys(t)) {
      if (!allowedTacticKeys.has(tk)) {
        throw new ValidationError(`Unsupported tactical field: "${tk}".`);
      }
    }
    if (
      t.mentality !== undefined &&
      !VALID_MENTALITIES.has(String(t.mentality))
    ) {
      throw new ValidationError(
        `Invalid mentality value: "${String(t.mentality)}".`
      );
    }
    if (
      t.pressingIntensity !== undefined &&
      !VALID_PRESSING.has(String(t.pressingIntensity))
    ) {
      throw new ValidationError(
        `Invalid pressingIntensity value: "${String(t.pressingIntensity)}".`
      );
    }
    if (t.tempo !== undefined && !VALID_TEMPOS.has(String(t.tempo))) {
      throw new ValidationError(`Invalid tempo value: "${String(t.tempo)}".`);
    }
    if (
      t.passingStyle !== undefined &&
      !VALID_PASSING.has(String(t.passingStyle))
    ) {
      throw new ValidationError(
        `Invalid passingStyle value: "${String(t.passingStyle)}".`
      );
    }
  }

  if (obj.preferredFormation !== undefined) {
    if (
      typeof obj.preferredFormation !== "string" ||
      obj.preferredFormation.trim().length < 3 ||
      obj.preferredFormation.trim().length > 64
    ) {
      throw new ValidationError(
        "preferredFormation must be a non-empty string between 3 and 64 characters."
      );
    }
  }

  if (obj.playerStatuses !== undefined) {
    if (!Array.isArray(obj.playerStatuses)) {
      throw new ValidationError("playerStatuses must be an array.");
    }
    for (const item of obj.playerStatuses) {
      if (!item || typeof item !== "object") {
        throw new ValidationError("Each playerStatuses entry must be an object.");
      }
      const { playerId, status } = item as {
        playerId?: unknown;
        status?: unknown;
      };
      if (
        typeof playerId !== "string" ||
        !VALID_ID_REGEX.test(playerId)
      ) {
        throw new ValidationError(
          `Malformed playerId: "${String(playerId)}".`
        );
      }
      if (
        typeof status !== "string" ||
        !VALID_STATUSES.has(status as PlayerStatus)
      ) {
        throw new ValidationError(`Invalid player status: "${String(status)}".`);
      }
    }
  }

  if (obj.playerUpdates !== undefined) {
    if (!Array.isArray(obj.playerUpdates)) {
      throw new ValidationError("playerUpdates must be an array.");
    }
    for (const item of obj.playerUpdates) {
      if (!item || typeof item !== "object") {
        throw new ValidationError("Each playerUpdates entry must be an object.");
      }
      const u = item as Record<string, unknown>;
      if (
        typeof u.playerId !== "string" ||
        !VALID_ID_REGEX.test(u.playerId)
      ) {
        throw new ValidationError(
          `Malformed playerId: "${String(u.playerId)}".`
        );
      }
      if (
        u.status !== undefined &&
        (typeof u.status !== "string" ||
          !VALID_STATUSES.has(u.status as PlayerStatus))
      ) {
        throw new ValidationError(
          `Invalid player status: "${String(u.status)}".`
        );
      }
      if (
        u.fitness !== undefined &&
        (typeof u.fitness !== "number" ||
          !Number.isInteger(u.fitness) ||
          u.fitness < 0 ||
          u.fitness > 100)
      ) {
        throw new ValidationError(
          `Invalid player fitness: "${String(u.fitness)}" (must be an integer between 0 and 100).`
        );
      }
      if (
        u.morale !== undefined &&
        (typeof u.morale !== "string" || !VALID_MORALES.has(u.morale))
      ) {
        throw new ValidationError(
          `Invalid player morale: "${String(u.morale)}".`
        );
      }
    }
  }

  if (
    obj.recoverSquadFitness !== undefined &&
    typeof obj.recoverSquadFitness !== "boolean"
  ) {
    throw new ValidationError("recoverSquadFitness must be a boolean.");
  }

  return obj as UpdateClubAndSquadInput;
}

export function validateMatchSubmissionPayload(
  raw: unknown
): SaveMatchSubmission {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError("Match submission payload must be a JSON object.");
  }

  const sub = raw as Partial<SaveMatchSubmission>;
  if (
    sub.fixtureId !== undefined &&
    (typeof sub.fixtureId !== "string" || !VALID_ID_REGEX.test(sub.fixtureId))
  ) {
    throw new ValidationError(
      `Malformed fixtureId: "${String(sub.fixtureId)}".`
    );
  }

  if (
    sub.submissionKey !== undefined &&
    (typeof sub.submissionKey !== "string" ||
      sub.submissionKey.trim().length === 0 ||
      sub.submissionKey.length > 160)
  ) {
    throw new ValidationError(
      "submissionKey must be a non-empty string of at most 160 characters."
    );
  }

  const res = sub.result;
  if (!res || typeof res !== "object") {
    throw new ValidationError("Missing match result object.");
  }

  if (
    typeof res.seed !== "string" ||
    res.seed.trim().length === 0 ||
    res.seed.length > 128
  ) {
    throw new ValidationError("Invalid or empty match seed.");
  }

  if (
    typeof res.numericSeed !== "number" ||
    !Number.isFinite(res.numericSeed)
  ) {
    throw new ValidationError("Invalid numericSeed in match result.");
  }

  if (!res.homeTeam || !res.awayTeam) {
    throw new ValidationError(
      "Match result must include both homeTeam and awayTeam objects."
    );
  }

  const homeScore = res.homeTeam.score;
  const awayScore = res.awayTeam.score;
  if (
    typeof homeScore !== "number" ||
    !Number.isInteger(homeScore) ||
    homeScore < 0 ||
    homeScore > 99 ||
    typeof awayScore !== "number" ||
    !Number.isInteger(awayScore) ||
    awayScore < 0 ||
    awayScore > 99
  ) {
    throw new ValidationError(
      `Invalid match score (${String(homeScore)}-${String(awayScore)}): scores must be non-negative integers between 0 and 99.`
    );
  }

  if (!Array.isArray(res.events)) {
    throw new ValidationError("Match result events must be an array.");
  }

  const homeGoalEvents = res.events.filter(
    (e) => e && e.type === "goal" && e.team === "home"
  ).length;
  const awayGoalEvents = res.events.filter(
    (e) => e && e.type === "goal" && e.team === "away"
  ).length;

  if (homeGoalEvents !== homeScore || awayGoalEvents !== awayScore) {
    throw new ValidationError(
      `Match score (${homeScore}-${awayScore}) does not match recorded goal events (${homeGoalEvents}-${awayGoalEvents}).`
    );
  }

  const allPlayers = [
    ...(Array.isArray(res.homeTeam.players) ? res.homeTeam.players : []),
    ...(Array.isArray(res.awayTeam.players) ? res.awayTeam.players : []),
  ];
  if (allPlayers.length === 0) {
    throw new ValidationError(
      "Match result must contain player summary records."
    );
  }

  for (const p of allPlayers) {
    if (!p || typeof p.id !== "string" || !VALID_ID_REGEX.test(p.id)) {
      throw new ValidationError(
        `Malformed player ID in match summary: "${String(p?.id)}".`
      );
    }
    if (
      typeof p.endFitness !== "number" ||
      p.endFitness < 0 ||
      p.endFitness > 100 ||
      typeof p.goals !== "number" ||
      p.goals < 0 ||
      typeof p.assists !== "number" ||
      p.assists < 0 ||
      typeof p.saves !== "number" ||
      p.saves < 0
    ) {
      throw new ValidationError(
        `Invalid player summary stats for player "${p.id}".`
      );
    }
  }

  return {
    result: res,
    fixtureId: sub.fixtureId,
    submissionKey: sub.submissionKey,
  };
}

/**
 * Reads `db/migrations/001_initial_schema.sql` from disk and applies it idempotently.
 */
export async function applyDatabaseMigrations(
  poolOverride?: SqlPoolAdapter
): Promise<{ version: string; applied: boolean }> {
  const migrationPath = path.join(
    process.cwd(),
    "db",
    "migrations",
    "001_initial_schema.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf8");
  const version = "001_initial_schema";

  return withTransaction(async (client) => {
    await client.query(sql);
    const existing = await client.query<{ version: string }>(
      "SELECT version FROM schema_migrations WHERE version = $1",
      [version]
    );
    if ((existing.rowCount ?? 0) === 0) {
      await client.query(
        "INSERT INTO schema_migrations (version) VALUES ($1)",
        [version]
      );
      return { version, applied: true };
    }
    return { version, applied: false };
  }, poolOverride);
}

async function seedUsingClient(
  client: SqlQueryClient,
  forceReset: boolean
): Promise<{ seeded: boolean }> {
  if (forceReset) {
    await client.query("DELETE FROM match_results");
    await client.query("DELETE FROM fixtures");
    await client.query("DELETE FROM players");
    await client.query("DELETE FROM managers");
    await client.query("DELETE FROM clubs");
  } else {
    const existingClubs = await client.query<{ id: string }>(
      "SELECT id FROM clubs WHERE id = $1",
      [HOME_CLUB_ID]
    );
    if ((existingClubs.rowCount ?? 0) > 0) {
      return { seeded: false };
    }
  }

  // 1. Seed Home & Away Clubs
  await client.query(
    `INSERT INTO clubs (
      id, name, short_name, abbreviation, nickname, founded, stadium,
      stadium_capacity, division, league_standing, league_points,
      balance, transfer_budget, wage_budget_weekly, in_game_date,
      primary_color, accent_color, formation, recent_form, tactics_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    ON CONFLICT (id) DO NOTHING`,
    [
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
      JSON.stringify(HOME_TACTICS),
    ]
  );

  await client.query(
    `INSERT INTO clubs (
      id, name, short_name, abbreviation, nickname, founded, stadium,
      stadium_capacity, division, league_standing, league_points,
      balance, transfer_budget, wage_budget_weekly, in_game_date,
      primary_color, accent_color, formation, recent_form, tactics_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    ON CONFLICT (id) DO NOTHING`,
    [
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
      JSON.stringify(AWAY_TACTICS),
    ]
  );

  // 2. Seed Manager Profile
  await client.query(
    `INSERT INTO managers (
      id, club_id, name, title, nationality, age, reputation,
      preferred_formation, played, won, drawn, lost
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (id) DO NOTHING`,
    [
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
      MANAGER_PROFILE.seasonRecord.lost,
    ]
  );

  // 3. Seed Home Squad Players (18) and Away Squad Players (14)
  const insertPlayer = async (p: Player, clubId: string) => {
    await client.query(
      `INSERT INTO players (
        id, club_id, shirt_number, name, nationality, position,
        position_group, age, overall, potential, weekly_wage,
        fitness, morale, status, preferred_foot,
        appearances, goals, assists, saves
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT (id) DO NOTHING`,
      [
        p.id,
        clubId,
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
        p.saves ?? 0,
      ]
    );
  };

  for (const p of SQUAD_PLAYERS) {
    await insertPlayer(p, HOME_CLUB_ID);
  }
  for (const p of AWAY_SQUAD_PLAYERS) {
    await insertPlayer(p, AWAY_CLUB_ID);
  }

  // 4. Seed Initial Matchday 9 Fixture
  await client.query(
    `INSERT INTO fixtures (
      id, competition, matchday_number, matchday_label,
      home_club_id, away_club_id, kickoff_time, date_label,
      venue, weather, referee, status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'scheduled')
    ON CONFLICT (id) DO NOTHING`,
    [
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
      NEXT_FIXTURE.referee,
    ]
  );

  return { seeded: true };
}

/**
 * Idempotently seeds the initial club, manager, squad, and Matchday 9 fixture data
 * from `src/data/mockClubData.ts`. When `forceReset = true`, resets the career back
 * to the Matchday 9 baseline.
 */
export async function seedInitialClubAndSeasonData(
  poolOverride?: SqlPoolAdapter,
  forceReset = false
): Promise<{ seeded: boolean }> {
  return withTransaction(
    (client) => seedUsingClient(client, forceReset),
    poolOverride
  );
}

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
  balance: string | number;
  transfer_budget: string | number;
  wage_budget_weekly: string | number;
  in_game_date: string;
  primary_color: string;
  accent_color: string;
  formation: string;
  recent_form: ("W" | "D" | "L")[] | string;
  tactics_json: TacticalSettings | string;
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
  numeric_seed: string | number;
  competition: string;
  venue: string;
  stoppage_time_json: MatchSimulationResult["stoppageTime"] | string;
  home_team_snapshot_json: MatchSimulationResult["homeTeam"] | string;
  away_team_snapshot_json: MatchSimulationResult["awayTeam"] | string;
  stats_json: MatchSimulationResult["stats"] | string;
  events_json: MatchSimulationResult["events"] | string;
  warnings_json: string[] | string;
}

function parseJsonColumn<T>(val: T | string): T {
  if (typeof val === "string") {
    return JSON.parse(val) as T;
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
    stoppageTime: parseJsonColumn(row.stoppage_time_json),
    homeTeam: parseJsonColumn(row.home_team_snapshot_json),
    awayTeam: parseJsonColumn(row.away_team_snapshot_json),
    events: parseJsonColumn(row.events_json),
    stats: parseJsonColumn(row.stats_json),
    warnings: parseJsonColumn(row.warnings_json),
  };
}

async function readStateFromClient(
  client: SqlQueryClient
): Promise<PersistedClubAndSeasonState> {
  const clubsRes = await client.query<DbClubRow>(
    "SELECT * FROM clubs WHERE id IN ($1, $2)",
    [HOME_CLUB_ID, AWAY_CLUB_ID]
  );

  if ((clubsRes.rowCount ?? 0) === 0) {
    await seedUsingClient(client, false);
    return readStateFromClient(client);
  }

  const homeClubRow =
    clubsRes.rows.find((c) => c.id === HOME_CLUB_ID) ?? clubsRes.rows[0];
  const awayClubRow =
    clubsRes.rows.find((c) => c.id === AWAY_CLUB_ID) ?? clubsRes.rows[0];

  const mgrRes = await client.query<DbManagerRow>(
    "SELECT * FROM managers WHERE club_id = $1 LIMIT 1",
    [HOME_CLUB_ID]
  );
  const mgrRow = mgrRes.rows[0];

  const playersRes = await client.query<DbPlayerRow>(
    "SELECT * FROM players WHERE club_id IN ($1, $2) ORDER BY shirt_number ASC, id ASC",
    [HOME_CLUB_ID, AWAY_CLUB_ID]
  );

  const homePlayers = playersRes.rows
    .filter((p) => p.club_id === HOME_CLUB_ID)
    .map(mapPlayerRow);
  const awayPlayers = playersRes.rows
    .filter((p) => p.club_id === AWAY_CLUB_ID)
    .map(mapPlayerRow);

  let fixtureRes = await client.query<DbFixtureRow>(
    "SELECT * FROM fixtures WHERE status = 'scheduled' ORDER BY matchday_number ASC LIMIT 1"
  );
  if ((fixtureRes.rowCount ?? 0) === 0) {
    fixtureRes = await client.query<DbFixtureRow>(
      "SELECT * FROM fixtures ORDER BY matchday_number DESC LIMIT 1"
    );
  }
  const fixtureRow = fixtureRes.rows[0];

  const matchesRes = await client.query<DbMatchResultRow>(
    "SELECT * FROM match_results ORDER BY created_at DESC LIMIT 15"
  );
  const recentMatches = matchesRes.rows.map(mapMatchResultRow);

  const countRes = await client.query<{ total: string | number }>(
    "SELECT COUNT(*) AS total FROM match_results"
  );
  const simulationCount = Number(countRes.rows[0]?.total ?? 0);

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

/**
 * Loads the persisted club, manager, squad, tactics, fixture, and recent match results
 * from PostgreSQL. Throws `DatabaseUnavailableError` if PostgreSQL is not configured or reachable.
 */
export async function loadPersistedClubState(
  poolOverride?: SqlPoolAdapter
): Promise<PersistedClubAndSeasonState> {
  const pool = poolOverride ?? getPostgresPool();
  try {
    return await withTransaction(async (client) => {
      return readStateFromClient(client);
    }, pool);
  } catch (err) {
    throw normalizeDatabaseError(err);
  }
}

/**
 * Updates persisted club tactics, preferred formation, player squad statuses,
 * player fitness/morale, or squad fitness recovery inside a PostgreSQL transaction.
 */
export async function updateClubTacticsAndSquad(
  rawInput: UpdateClubAndSquadInput,
  poolOverride?: SqlPoolAdapter
): Promise<PersistedClubAndSeasonState> {
  const input = validateClubUpdatePayload(rawInput);

  return withTransaction(async (client) => {
    const current = await readStateFromClient(client);

    if (input.homeTactics) {
      const mergedTactics: TacticalSettings = {
        ...current.homeTactics,
        ...input.homeTactics,
      };
      await client.query(
        "UPDATE clubs SET tactics_json = $1, updated_at = NOW() WHERE id = $2",
        [JSON.stringify(mergedTactics), HOME_CLUB_ID]
      );
    }

    if (input.preferredFormation) {
      await client.query(
        "UPDATE clubs SET formation = $1, updated_at = NOW() WHERE id = $2",
        [input.preferredFormation, HOME_CLUB_ID]
      );
      await client.query(
        "UPDATE managers SET preferred_formation = $1, updated_at = NOW() WHERE club_id = $2",
        [input.preferredFormation, HOME_CLUB_ID]
      );
    }

    if (input.playerStatuses && input.playerStatuses.length > 0) {
      for (const item of input.playerStatuses) {
        await client.query(
          "UPDATE players SET status = $1, updated_at = NOW() WHERE id = $2 AND club_id = $3",
          [item.status, item.playerId, HOME_CLUB_ID]
        );
      }
    }

    if (input.playerUpdates && input.playerUpdates.length > 0) {
      for (const item of input.playerUpdates) {
        if (item.status !== undefined) {
          await client.query(
            "UPDATE players SET status = $1, updated_at = NOW() WHERE id = $2 AND club_id = $3",
            [item.status, item.playerId, HOME_CLUB_ID]
          );
        }
        if (item.fitness !== undefined) {
          await client.query(
            "UPDATE players SET fitness = $1, updated_at = NOW() WHERE id = $2 AND club_id = $3",
            [item.fitness, item.playerId, HOME_CLUB_ID]
          );
        }
        if (item.morale !== undefined) {
          await client.query(
            "UPDATE players SET morale = $1, updated_at = NOW() WHERE id = $2 AND club_id = $3",
            [item.morale, item.playerId, HOME_CLUB_ID]
          );
        }
      }
    }

    if (input.recoverSquadFitness) {
      await client.query(
        "UPDATE players SET fitness = LEAST(100, fitness + 12), updated_at = NOW() WHERE club_id IN ($1, $2)",
        [HOME_CLUB_ID, AWAY_CLUB_ID]
      );
    }

    return readStateFromClient(client);
  }, poolOverride);
}

/**
 * Transactionally persists a completed `MatchSimulationResult`, updates fixture status,
 * increments manager & club season records (`played`, `won`, `drawn`, `lost`, points, form),
 * and updates player post-match fitness and cumulative season stats (`appearances`, `goals`, `assists`, `saves`).
 *
 * Guarantees idempotency: submitting the same `submissionKey` (or `seed`) more than once
 * returns `duplicate: true` without double-counting any statistics.
 */
export async function saveMatchResultTransactionally(
  rawSubmission: SaveMatchSubmission,
  poolOverride?: SqlPoolAdapter
): Promise<SaveMatchOutcome> {
  const submission = validateMatchSubmissionPayload(rawSubmission);
  const { result } = submission;
  const fixtureId = submission.fixtureId ?? INITIAL_FIXTURE_ID;
  const submissionKey =
    submission.submissionKey ?? `${fixtureId}:${result.seed}`;
  // A fixture can only ever hold one result, so the fixture ID keeps match IDs unique
  // even when the same seed is replayed on a later matchday.
  const matchId = `match-${fixtureId}-${result.numericSeed}`;

  return withTransaction(async (client) => {
    // Ensure baseline club/squad rows exist before applying match updates
    await readStateFromClient(client);

    // 0. Lock the fixture row so concurrent submissions for the same fixture are
    //    serialized (the second waits, then sees the committed result below).
    const lockedFixture = await client.query<DbFixtureRow>(
      "SELECT * FROM fixtures WHERE id = $1 LIMIT 1 FOR UPDATE",
      [fixtureId]
    );
    if ((lockedFixture.rowCount ?? 0) === 0) {
      throw new ValidationError(`Unknown fixtureId: "${fixtureId}".`);
    }

    // 1. Check idempotency key to prevent duplicate counting
    const existingMatch = await client.query<{ id: string }>(
      "SELECT id FROM match_results WHERE submission_key = $1 LIMIT 1",
      [submissionKey]
    );
    if ((existingMatch.rowCount ?? 0) > 0) {
      const state = await readStateFromClient(client);
      return {
        duplicate: true,
        matchId: existingMatch.rows[0].id,
        submissionKey,
        state,
      };
    }

    // 1b. A different result for an already-completed fixture would double-count
    //     season records, so it is rejected rather than applied.
    if (lockedFixture.rows[0].status === "completed") {
      throw new ConflictError(
        `Fixture "${fixtureId}" already has a completed result; a second result cannot be recorded.`
      );
    }

    // 2. Insert completed match result
    await client.query(
      `INSERT INTO match_results (
        id, submission_key, fixture_id, seed, numeric_seed,
        competition, venue, home_club_id, away_club_id,
        home_score, away_score, stoppage_time_json,
        home_team_snapshot_json, away_team_snapshot_json,
        stats_json, events_json, warnings_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
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
        JSON.stringify(result.warnings),
      ]
    );

    // 3. Update active fixture & create the next matchday fixture
    const fxRes = await client.query<DbFixtureRow>(
      "SELECT * FROM fixtures WHERE id = $1 LIMIT 1",
      [fixtureId]
    );
    const currentMd = Number(fxRes.rows[0]?.matchday_number ?? 9);

    await client.query(
      `UPDATE fixtures
       SET status = 'completed',
           home_score = $1,
           away_score = $2,
           match_seed = $3,
           played_at = NOW(),
           updated_at = NOW()
       WHERE id = $4`,
      [result.homeTeam.score, result.awayTeam.score, result.seed, fixtureId]
    );

    const nextMd = Math.min(38, currentMd + 1);
    const nextFixtureId = `fix-md-${String(nextMd).padStart(2, "0")}`;
    await client.query(
      `INSERT INTO fixtures (
        id, competition, matchday_number, matchday_label,
        home_club_id, away_club_id, kickoff_time, date_label,
        venue, weather, referee, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'scheduled')
      ON CONFLICT (id) DO NOTHING`,
      [
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
        NEXT_FIXTURE.referee,
      ]
    );

    // 4. Update Manager Season Record & Club Points / Form
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

    await client.query(
      `UPDATE managers
       SET played = played + 1,
           won = won + $1,
           drawn = drawn + $2,
           lost = lost + $3,
           updated_at = NOW()
       WHERE club_id = $4`,
      [homeWon, isDraw, homeLost, HOME_CLUB_ID]
    );

    const clubsNow = await client.query<DbClubRow>(
      "SELECT id, league_points, recent_form FROM clubs WHERE id IN ($1, $2)",
      [HOME_CLUB_ID, AWAY_CLUB_ID]
    );

    for (const cRow of clubsNow.rows) {
      const isHome = cRow.id === HOME_CLUB_ID;
      const newPoints =
        Number(cRow.league_points) +
        (isHome ? homePointsDelta : awayPointsDelta);
      const prevForm = parseJsonColumn<("W" | "D" | "L")[]>(cRow.recent_form);
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

      await client.query(
        `UPDATE clubs
         SET league_points = $1,
             league_standing = $2,
             recent_form = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [newPoints, standingLabel, JSON.stringify(updatedForm), cRow.id]
      );
    }

    // 5. Update cumulative player statistics and post-match fitness
    const allPlayerSummaries = [
      ...result.homeTeam.players,
      ...result.awayTeam.players,
    ];

    for (const ps of allPlayerSummaries) {
      await client.query(
        `UPDATE players
         SET fitness = $1,
             appearances = appearances + 1,
             goals = goals + $2,
             assists = assists + $3,
             saves = saves + $4,
             updated_at = NOW()
         WHERE id = $5`,
        [ps.endFitness, ps.goals, ps.assists, ps.saves, ps.id]
      );
    }

    const updatedState = await readStateFromClient(client);
    return {
      duplicate: false,
      matchId,
      submissionKey,
      state: updatedState,
    };
  }, poolOverride);
}

/**
 * PostgreSQL implementation of `ClubRepository`.
 * Reference persistence implementation for local development and PostgreSQL servers.
 */
export class PostgresClubRepository implements ClubRepository {
  public readonly driver = "postgres" as const;

  constructor(private poolOverride?: SqlPoolAdapter) {}

  public async applyMigrations(): Promise<{ version: string; applied: boolean }> {
    return applyDatabaseMigrations(this.poolOverride);
  }

  public async seedInitialData(forceReset = false): Promise<{ seeded: boolean }> {
    return seedInitialClubAndSeasonData(this.poolOverride, forceReset);
  }

  public async loadClubState(): Promise<PersistedClubAndSeasonState> {
    return loadPersistedClubState(this.poolOverride);
  }

  public async updateClubTacticsAndSquad(
    input: UpdateClubAndSquadInput
  ): Promise<PersistedClubAndSeasonState> {
    return updateClubTacticsAndSquad(input, this.poolOverride);
  }

  public async saveMatchResult(
    submission: SaveMatchSubmission
  ): Promise<SaveMatchOutcome> {
    return saveMatchResultTransactionally(submission, this.poolOverride);
  }

  public async close(): Promise<void> {
    if (this.poolOverride?.end) {
      await this.poolOverride.end();
    }
  }
}


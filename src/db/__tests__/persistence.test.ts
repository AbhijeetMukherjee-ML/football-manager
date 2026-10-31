import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryResult, QueryResultRow } from "pg";
import { createDefaultMatchInput } from "../../components/match-viewer/matchVisualizer";
import { simulateMatch } from "../../engine/matchEngine";
import {
  DatabaseUnavailableError,
  getDatabaseUrl,
  normalizeDatabaseError,
  SqlPoolAdapter,
  SqlQueryClient,
  withTransaction,
} from "../postgres";
import {
  applyDatabaseMigrations,
  AWAY_CLUB_ID,
  HOME_CLUB_ID,
  HOME_MANAGER_ID,
  INITIAL_FIXTURE_ID,
  loadPersistedClubState,
  saveMatchResultTransactionally,
  seedInitialClubAndSeasonData,
  updateClubTacticsAndSquad,
  validateClubUpdatePayload,
  validateMatchSubmissionPayload,
  ValidationError,
  ConflictError,
} from "../repository";
import { getPostgresPool } from "../postgres";

/**
 * Stateful transactional PostgreSQL test double that executes the exact parameterized
 * SQL statements used by `src/db/repository.ts` and verifies `BEGIN` / `COMMIT` / `ROLLBACK`.
 */
function createMockPostgresPool(): SqlPoolAdapter & {
  txLog: string[];
  failOnNextQuery?: Error;
} {
  let migrationsVersion: Set<string> = new Set();
  let clubs = new Map<string, Record<string, unknown>>();
  let managers = new Map<string, Record<string, unknown>>();
  let players = new Map<string, Record<string, unknown>>();
  let fixtures = new Map<string, Record<string, unknown>>();
  let matchResults = new Map<string, Record<string, unknown>>();

  let snapshot: {
    migrationsVersion: Set<string>;
    clubs: Map<string, Record<string, unknown>>;
    managers: Map<string, Record<string, unknown>>;
    players: Map<string, Record<string, unknown>>;
    fixtures: Map<string, Record<string, unknown>>;
    matchResults: Map<string, Record<string, unknown>>;
  } | null = null;

  const cloneMap = (m: Map<string, Record<string, unknown>>) =>
    new Map(
      Array.from(m.entries()).map(([k, v]) => [
        k,
        JSON.parse(JSON.stringify(v)) as Record<string, unknown>,
      ])
    );

  const txLog: string[] = [];
  const poolState: { failOnNextQuery?: Error } = {};

  const makeResult = <R extends QueryResultRow>(
    rows: R[]
  ): QueryResult<R> => ({
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  });

  const executeQuery = async <R extends QueryResultRow = QueryResultRow>(
    rawSql: string,
    values: unknown[] = []
  ): Promise<QueryResult<R>> => {
    if (poolState.failOnNextQuery) {
      const err = poolState.failOnNextQuery;
      poolState.failOnNextQuery = undefined;
      throw err;
    }

    const sql = rawSql.replace(/\s+/g, " ").trim();

    if (sql === "BEGIN") {
      txLog.push("BEGIN");
      snapshot = {
        migrationsVersion: new Set(migrationsVersion),
        clubs: cloneMap(clubs),
        managers: cloneMap(managers),
        players: cloneMap(players),
        fixtures: cloneMap(fixtures),
        matchResults: cloneMap(matchResults),
      };
      return makeResult([]);
    }

    if (sql === "COMMIT") {
      txLog.push("COMMIT");
      snapshot = null;
      return makeResult([]);
    }

    if (sql === "ROLLBACK") {
      txLog.push("ROLLBACK");
      if (snapshot) {
        migrationsVersion = snapshot.migrationsVersion;
        clubs = snapshot.clubs;
        managers = snapshot.managers;
        players = snapshot.players;
        fixtures = snapshot.fixtures;
        matchResults = snapshot.matchResults;
        snapshot = null;
      }
      return makeResult([]);
    }

    // Schema DDL migration file execution
    if (sql.includes("CREATE TABLE IF NOT EXISTS schema_migrations")) {
      return makeResult([]);
    }

    if (
      sql.startsWith("SELECT version FROM schema_migrations WHERE version = $1")
    ) {
      const ver = String(values[0]);
      return makeResult(
        migrationsVersion.has(ver) ? ([{ version: ver }] as unknown as R[]) : []
      );
    }

    if (sql.startsWith("INSERT INTO schema_migrations")) {
      migrationsVersion.add(String(values[0]));
      return makeResult([]);
    }

    // DELETE statements for forceReset
    if (sql === "DELETE FROM match_results") {
      matchResults.clear();
      return makeResult([]);
    }
    if (sql === "DELETE FROM fixtures") {
      fixtures.clear();
      return makeResult([]);
    }
    if (sql === "DELETE FROM players") {
      players.clear();
      return makeResult([]);
    }
    if (sql === "DELETE FROM managers") {
      managers.clear();
      return makeResult([]);
    }
    if (sql === "DELETE FROM clubs") {
      clubs.clear();
      return makeResult([]);
    }

    // Clubs queries
    if (sql === "SELECT id FROM clubs WHERE id = $1") {
      const id = String(values[0]);
      const found = clubs.get(id);
      return makeResult(found ? ([{ id }] as unknown as R[]) : []);
    }

    if (sql.startsWith("INSERT INTO clubs")) {
      const id = String(values[0]);
      if (!clubs.has(id)) {
        clubs.set(id, {
          id,
          name: values[1],
          short_name: values[2],
          abbreviation: values[3],
          nickname: values[4],
          founded: values[5],
          stadium: values[6],
          stadium_capacity: values[7],
          division: values[8],
          league_standing: values[9],
          league_points: values[10],
          balance: values[11],
          transfer_budget: values[12],
          wage_budget_weekly: values[13],
          in_game_date: values[14],
          primary_color: values[15],
          accent_color: values[16],
          formation: values[17],
          recent_form: values[18],
          tactics_json: values[19],
        });
      }
      return makeResult([]);
    }

    if (sql === "SELECT * FROM clubs WHERE id IN ($1, $2)") {
      const ids = [String(values[0]), String(values[1])];
      const rows = ids
        .map((id) => clubs.get(id))
        .filter((r): r is Record<string, unknown> => Boolean(r));
      return makeResult(rows as unknown as R[]);
    }

    if (
      sql ===
      "SELECT id, league_points, recent_form FROM clubs WHERE id IN ($1, $2)"
    ) {
      const ids = [String(values[0]), String(values[1])];
      const rows = ids
        .map((id) => clubs.get(id))
        .filter((r): r is Record<string, unknown> => Boolean(r));
      return makeResult(rows as unknown as R[]);
    }

    if (
      sql === "UPDATE clubs SET tactics_json = $1, updated_at = NOW() WHERE id = $2"
    ) {
      const row = clubs.get(String(values[1]));
      if (row) row.tactics_json = values[0];
      return makeResult([]);
    }

    if (
      sql === "UPDATE clubs SET formation = $1, updated_at = NOW() WHERE id = $2"
    ) {
      const row = clubs.get(String(values[1]));
      if (row) row.formation = values[0];
      return makeResult([]);
    }

    if (sql.startsWith("UPDATE clubs SET league_points = $1")) {
      const row = clubs.get(String(values[3]));
      if (row) {
        row.league_points = values[0];
        row.league_standing = values[1];
        row.recent_form = values[2];
      }
      return makeResult([]);
    }

    // Managers queries
    if (sql.startsWith("INSERT INTO managers")) {
      const id = String(values[0]);
      if (!managers.has(id)) {
        managers.set(id, {
          id,
          club_id: values[1],
          name: values[2],
          title: values[3],
          nationality: values[4],
          age: values[5],
          reputation: values[6],
          preferred_formation: values[7],
          played: values[8],
          won: values[9],
          drawn: values[10],
          lost: values[11],
        });
      }
      return makeResult([]);
    }

    if (sql === "SELECT * FROM managers WHERE club_id = $1 LIMIT 1") {
      const clubId = String(values[0]);
      const found = Array.from(managers.values()).find(
        (m) => m.club_id === clubId
      );
      return makeResult(found ? ([found] as unknown as R[]) : []);
    }

    if (
      sql ===
      "UPDATE managers SET preferred_formation = $1, updated_at = NOW() WHERE club_id = $2"
    ) {
      for (const m of managers.values()) {
        if (m.club_id === values[1]) {
          m.preferred_formation = values[0];
        }
      }
      return makeResult([]);
    }

    if (sql.startsWith("UPDATE managers SET played = played + 1")) {
      for (const m of managers.values()) {
        if (m.club_id === values[3]) {
          m.played = Number(m.played) + 1;
          m.won = Number(m.won) + Number(values[0]);
          m.drawn = Number(m.drawn) + Number(values[1]);
          m.lost = Number(m.lost) + Number(values[2]);
        }
      }
      return makeResult([]);
    }

    // Players queries
    if (sql.startsWith("INSERT INTO players")) {
      const id = String(values[0]);
      if (!players.has(id)) {
        players.set(id, {
          id,
          club_id: values[1],
          shirt_number: values[2],
          name: values[3],
          nationality: values[4],
          position: values[5],
          position_group: values[6],
          age: values[7],
          overall: values[8],
          potential: values[9],
          weekly_wage: values[10],
          fitness: values[11],
          morale: values[12],
          status: values[13],
          preferred_foot: values[14],
          appearances: values[15],
          goals: values[16],
          assists: values[17],
          saves: values[18],
        });
      }
      return makeResult([]);
    }

    if (
      sql ===
      "SELECT * FROM players WHERE club_id IN ($1, $2) ORDER BY shirt_number ASC, id ASC"
    ) {
      const ids = new Set([String(values[0]), String(values[1])]);
      const rows = Array.from(players.values())
        .filter((p) => ids.has(String(p.club_id)))
        .sort(
          (a, b) => Number(a.shirt_number) - Number(b.shirt_number)
        );
      return makeResult(rows as unknown as R[]);
    }

    if (
      sql ===
      "UPDATE players SET status = $1, updated_at = NOW() WHERE id = $2 AND club_id = $3"
    ) {
      const p = players.get(String(values[1]));
      if (p && p.club_id === values[2]) {
        p.status = values[0];
      }
      return makeResult([]);
    }

    if (
      sql ===
      "UPDATE players SET fitness = $1, updated_at = NOW() WHERE id = $2 AND club_id = $3"
    ) {
      const p = players.get(String(values[1]));
      if (p && p.club_id === values[2]) {
        p.fitness = Number(values[0]);
      }
      return makeResult([]);
    }

    if (
      sql ===
      "UPDATE players SET morale = $1, updated_at = NOW() WHERE id = $2 AND club_id = $3"
    ) {
      const p = players.get(String(values[1]));
      if (p && p.club_id === values[2]) {
        p.morale = values[0];
      }
      return makeResult([]);
    }

    if (sql.startsWith("UPDATE players SET fitness = LEAST(100, fitness + 12)")) {
      for (const p of players.values()) {
        p.fitness = Math.min(100, Number(p.fitness) + 12);
      }
      return makeResult([]);
    }

    if (sql.startsWith("UPDATE players SET fitness = $1")) {
      const p = players.get(String(values[4]));
      if (p) {
        p.fitness = Number(values[0]);
        p.appearances = Number(p.appearances) + 1;
        p.goals = Number(p.goals) + Number(values[1]);
        p.assists = Number(p.assists) + Number(values[2]);
        p.saves = Number(p.saves) + Number(values[3]);
      }
      return makeResult([]);
    }

    // Fixtures queries
    if (sql.startsWith("INSERT INTO fixtures")) {
      const id = String(values[0]);
      if (!fixtures.has(id)) {
        fixtures.set(id, {
          id,
          competition: values[1],
          matchday_number: values[2],
          matchday_label: values[3],
          home_club_id: values[4],
          away_club_id: values[5],
          kickoff_time: values[6],
          date_label: values[7],
          venue: values[8],
          weather: values[9],
          referee: values[10],
          status: "scheduled",
        });
      }
      return makeResult([]);
    }

    if (
      sql.startsWith(
        "SELECT * FROM fixtures WHERE status = 'scheduled' ORDER BY matchday_number ASC"
      )
    ) {
      const scheduled = Array.from(fixtures.values())
        .filter((f) => f.status === "scheduled")
        .sort((a, b) => Number(a.matchday_number) - Number(b.matchday_number));
      return makeResult(scheduled.slice(0, 1) as unknown as R[]);
    }

    if (
      sql.startsWith(
        "SELECT * FROM fixtures ORDER BY matchday_number DESC LIMIT 1"
      )
    ) {
      const sorted = Array.from(fixtures.values()).sort(
        (a, b) => Number(b.matchday_number) - Number(a.matchday_number)
      );
      return makeResult(sorted.slice(0, 1) as unknown as R[]);
    }

    if (
      sql.startsWith(
        "SELECT * FROM fixtures ORDER BY CASE WHEN status = 'scheduled'"
      )
    ) {
      const sorted = Array.from(fixtures.values()).sort((a, b) => {
        const aSched = a.status === "scheduled" ? 0 : 1;
        const bSched = b.status === "scheduled" ? 0 : 1;
        if (aSched !== bSched) return aSched - bSched;
        return Number(b.matchday_number) - Number(a.matchday_number);
      });
      return makeResult(sorted.slice(0, 1) as unknown as R[]);
    }

    if (sql === "SELECT * FROM fixtures WHERE id = $1 LIMIT 1 FOR UPDATE") {
      const fx = fixtures.get(String(values[0]));
      return makeResult(fx ? ([fx] as unknown as R[]) : []);
    }

    if (sql === "SELECT * FROM fixtures WHERE id = $1 LIMIT 1") {
      const fx = fixtures.get(String(values[0]));
      return makeResult(fx ? ([fx] as unknown as R[]) : []);
    }

    if (sql.startsWith("UPDATE fixtures SET status = 'completed'")) {
      const fx = fixtures.get(String(values[3]));
      if (fx) {
        fx.status = "completed";
        fx.home_score = values[0];
        fx.away_score = values[1];
        fx.match_seed = values[2];
      }
      return makeResult([]);
    }

    // Match results queries
    if (
      sql ===
      "SELECT id FROM match_results WHERE submission_key = $1 LIMIT 1"
    ) {
      const subKey = String(values[0]);
      const found = Array.from(matchResults.values()).find(
        (m) => m.submission_key === subKey
      );
      return makeResult(
        found ? ([{ id: found.id }] as unknown as R[]) : []
      );
    }

    if (sql.startsWith("INSERT INTO match_results")) {
      const id = String(values[0]);
      matchResults.set(id, {
        id,
        submission_key: values[1],
        fixture_id: values[2],
        seed: values[3],
        numeric_seed: values[4],
        competition: values[5],
        venue: values[6],
        home_club_id: values[7],
        away_club_id: values[8],
        home_score: values[9],
        away_score: values[10],
        stoppage_time_json: values[11],
        home_team_snapshot_json: values[12],
        away_team_snapshot_json: values[13],
        stats_json: values[14],
        events_json: values[15],
        warnings_json: values[16],
        created_at: Date.now(),
      });
      return makeResult([]);
    }

    if (
      sql === "SELECT * FROM match_results ORDER BY created_at DESC LIMIT 15"
    ) {
      const rows = Array.from(matchResults.values())
        .sort((a, b) => Number(b.created_at) - Number(a.created_at))
        .slice(0, 15);
      return makeResult(rows as unknown as R[]);
    }

    if (sql === "SELECT COUNT(*) AS total FROM match_results") {
      return makeResult([{ total: matchResults.size }] as unknown as R[]);
    }

    throw new Error(`Unhandled SQL in test double: ${sql}`);
  };

  return {
    txLog,
    set failOnNextQuery(err: Error | undefined) {
      poolState.failOnNextQuery = err;
    },
    query: executeQuery,
    async connect(): Promise<SqlQueryClient & { release: () => void }> {
      return {
        query: executeQuery,
        release: () => {},
      };
    },
  };
}

describe("Stage 7: PostgreSQL Persistence Layer", () => {
  it("1. returns clear, actionable DatabaseUnavailableError when PostgreSQL is unconfigured or unreachable (never falls back to in-memory)", () => {
    const prevUrl = process.env.DATABASE_URL;
    try {
      delete process.env.DATABASE_URL;

      // Missing DATABASE_URL
      assert.throws(
        () => getDatabaseUrl(""),
        (err: unknown) => {
          assert.ok(err instanceof DatabaseUnavailableError);
          assert.equal(err.code, "DATABASE_URL_MISSING");
          assert.ok(err.remediation.length >= 3);
          return true;
        }
      );

      // Placeholder DATABASE_URL from .env.example
      assert.throws(
        () =>
          getDatabaseUrl(
            "postgresql://YOUR_DB_USER:YOUR_DB_PASSWORD@localhost:5432/football_manager"
          ),
        (err: unknown) => {
          assert.ok(err instanceof DatabaseUnavailableError);
          assert.equal(err.code, "DATABASE_URL_PLACEHOLDER");
          return true;
        }
      );

      // Invalid protocol
      assert.throws(
        () => getDatabaseUrl("http://localhost:5432/football_manager"),
        (err: unknown) => {
          assert.ok(err instanceof DatabaseUnavailableError);
          assert.equal(err.code, "DATABASE_URL_INVALID");
          return true;
        }
      );

      // Missing database name in URL
      assert.throws(
        () => getDatabaseUrl("postgresql://user:secretpass@localhost:5432/"),
        (err: unknown) => {
          assert.ok(err instanceof DatabaseUnavailableError);
          assert.equal(err.code, "DATABASE_URL_INVALID");
          assert.ok(!err.message.includes("secretpass"));
          return true;
        }
      );

      // Invalid port in URL
      assert.throws(
        () =>
          getDatabaseUrl(
            "postgresql://user:secretpass@localhost:99999/football_manager"
          ),
        (err: unknown) => {
          assert.ok(err instanceof DatabaseUnavailableError);
          assert.equal(err.code, "DATABASE_URL_INVALID");
          assert.ok(!err.message.includes("secretpass"));
          return true;
        }
      );

      // Connection refused normalization & credential redaction
      const connRefused = normalizeDatabaseError({
        code: "ECONNREFUSED",
        message:
          "connect ECONNREFUSED postgresql://secretuser:supersecret@127.0.0.1:5432/fm",
      });
      assert.ok(connRefused instanceof DatabaseUnavailableError);
      assert.equal(connRefused.code, "POSTGRES_CONNECTION_FAILED");
      assert.ok(!connRefused.message.includes("supersecret"));
    } finally {
      if (prevUrl !== undefined) {
        process.env.DATABASE_URL = prevUrl;
      }
    }
  });

  it("2. applies schema migrations and idempotently seeds club, manager, 28 squad players, and Matchday 9 fixture", async () => {
    const pool = createMockPostgresPool();

    const mig1 = await applyDatabaseMigrations(pool);
    assert.equal(mig1.version, "001_initial_schema");
    assert.equal(mig1.applied, true);

    const mig2 = await applyDatabaseMigrations(pool);
    assert.equal(mig2.applied, false);

    // First seed populates the tables
    const seed1 = await seedInitialClubAndSeasonData(pool, false);
    assert.equal(seed1.seeded, true);

    // Second seed is an idempotent no-op
    const seed2 = await seedInitialClubAndSeasonData(pool, false);
    assert.equal(seed2.seeded, false);

    const state = await loadPersistedClubState(pool);
    assert.equal(state.club.name, "Northbridge Athletic FC");
    assert.equal(state.manager.name, "Marcus Vance");
    assert.equal(state.manager.seasonRecord.played, 8);
    assert.equal(state.players.length, 14);
    assert.equal(state.awayPlayers.length, 14);
    assert.equal(state.nextFixture.id, INITIAL_FIXTURE_ID);
    assert.equal(state.simulationCount, 0);
    assert.ok(state.players.some((p) => p.id === HOME_MANAGER_ID) === false);
    assert.ok(state.players.some((p) => p.id === "p-01"));
    assert.ok(state.awayPlayers.some((p) => p.id === "cmr-01"));
  });

  it("3. updates persisted tactics, formation, player squad statuses, fitness, and morale transactionally", async () => {
    const pool = createMockPostgresPool();
    await applyDatabaseMigrations(pool);
    await seedInitialClubAndSeasonData(pool, false);

    const updated = await updateClubTacticsAndSquad(
      {
        homeTactics: {
          mentality: "Attacking",
          pressingIntensity: "High",
          passingStyle: "Direct",
        },
        preferredFormation: "4-2-3-1 Attacking",
        playerStatuses: [
          { playerId: "p-12", status: "Starting XI" },
          { playerId: "p-10", status: "Bench" },
        ],
        playerUpdates: [
          { playerId: "p-11", fitness: 77, morale: "Content" },
          { playerId: "p-01", fitness: 99, morale: "Superb" },
        ],
      },
      pool
    );

    assert.equal(updated.homeTactics.mentality, "Attacking");
    assert.equal(updated.homeTactics.passingStyle, "Direct");
    assert.equal(updated.manager.preferredFormation, "4-2-3-1 Attacking");
    assert.equal(
      updated.players.find((p) => p.id === "p-12")?.status,
      "Starting XI"
    );
    assert.equal(
      updated.players.find((p) => p.id === "p-10")?.status,
      "Bench"
    );
    assert.equal(updated.players.find((p) => p.id === "p-11")?.fitness, 77);
    assert.equal(
      updated.players.find((p) => p.id === "p-11")?.morale,
      "Content"
    );
    assert.equal(updated.players.find((p) => p.id === "p-01")?.fitness, 99);
    assert.equal(
      updated.players.find((p) => p.id === "p-01")?.morale,
      "Superb"
    );

    // Reload from persisted pool and verify all 14 home + 14 away IDs remain intact
    const reloaded = await loadPersistedClubState(pool);
    assert.equal(reloaded.players.length, 14);
    assert.equal(reloaded.awayPlayers.length, 14);
    for (let i = 1; i <= 14; i++) {
      const homeId = `p-${String(i).padStart(2, "0")}`;
      const awayId = `cmr-${String(i).padStart(2, "0")}`;
      assert.ok(
        reloaded.players.some((p) => p.id === homeId),
        `Missing home player ${homeId}`
      );
      assert.ok(
        reloaded.awayPlayers.some((p) => p.id === awayId),
        `Missing away player ${awayId}`
      );
    }
  });

  it("4. saves completed match results transactionally, updates cumulative stats, prevents duplicate counting, and rolls back on failure", async () => {
    const pool = createMockPostgresPool();
    await applyDatabaseMigrations(pool);
    await seedInitialClubAndSeasonData(pool, false);

    const matchResult = simulateMatch(
      createDefaultMatchInput("stage7-persistence-seed-101")
    );

    const save1 = await saveMatchResultTransactionally(
      {
        result: matchResult,
        fixtureId: INITIAL_FIXTURE_ID,
      },
      pool
    );

    assert.equal(save1.duplicate, false);
    assert.equal(save1.state.simulationCount, 1);
    assert.equal(save1.state.recentMatches.length, 1);
    assert.equal(save1.state.recentMatches[0].seed, "stage7-persistence-seed-101");
    assert.equal(save1.state.manager.seasonRecord.played, 9);
    assert.equal(save1.state.nextFixture.id, "fix-md-10");

    // Verify player cumulative goals & appearances match the simulated result
    const kovacSummary = matchResult.homeTeam.players.find(
      (p) => p.id === "p-11"
    )!;
    const persistedKovac = save1.state.players.find((p) => p.id === "p-11")!;
    assert.equal(persistedKovac.appearances, 1);
    assert.equal(persistedKovac.goals, kovacSummary.goals);
    assert.equal(persistedKovac.fitness, kovacSummary.endFitness);

    // Submitting the exact same match result a second time must be idempotent (no double-counting!)
    const save2 = await saveMatchResultTransactionally(
      {
        result: matchResult,
        fixtureId: INITIAL_FIXTURE_ID,
      },
      pool
    );

    assert.equal(save2.duplicate, true);
    assert.equal(save2.state.simulationCount, 1);
    assert.equal(save2.state.manager.seasonRecord.played, 9);
    const persistedKovacAfterDup = save2.state.players.find(
      (p) => p.id === "p-11"
    )!;
    assert.equal(persistedKovacAfterDup.appearances, 1);
    assert.equal(persistedKovacAfterDup.goals, kovacSummary.goals);

    // A different result submitted for the already-completed fixture must be rejected
    const otherResult = simulateMatch(
      createDefaultMatchInput("stage7-persistence-seed-202")
    );
    await assert.rejects(
      () =>
        saveMatchResultTransactionally(
          { result: otherResult, fixtureId: INITIAL_FIXTURE_ID },
          pool
        ),
      (err: unknown) => err instanceof ConflictError
    );
    const afterConflict = await loadPersistedClubState(pool);
    assert.equal(afterConflict.manager.seasonRecord.played, 9);
    assert.equal(afterConflict.simulationCount, 1);

    // Unknown fixture IDs are rejected as validation errors
    await assert.rejects(
      () =>
        saveMatchResultTransactionally(
          { result: otherResult, fixtureId: "fix-md-99" },
          pool
        ),
      (err: unknown) => err instanceof ValidationError
    );

    // Verify transaction rollback if an error occurs mid-transaction
    await assert.rejects(
      async () => {
        await withTransaction(async (client) => {
          await client.query(
            "UPDATE managers SET played = played + 1, won = won + 1, drawn = drawn + 0, lost = lost + 0, updated_at = NOW() WHERE club_id = $4",
            [1, 0, 0, HOME_CLUB_ID]
          );
          throw new Error("Simulated mid-transaction failure");
        }, pool);
      },
      (err: unknown) => err instanceof DatabaseUnavailableError
    );

    const stateAfterRollback = await loadPersistedClubState(pool);
    assert.equal(stateAfterRollback.manager.seasonRecord.played, 9);
    assert.ok(pool.txLog.includes("ROLLBACK"));
    assert.ok(HOME_CLUB_ID && AWAY_CLUB_ID);
  });

  it("5. validates request payloads and rejects malformed IDs, invalid scores, score-vs-events mismatch, and unsupported updates", () => {
    // Reject unsupported top-level update field
    assert.throws(
      () =>
        validateClubUpdatePayload({
          homeTactics: { mentality: "Balanced" },
          unsupportedField: true,
        }),
      (err: unknown) => err instanceof ValidationError
    );

    // Reject invalid tactical enum value
    assert.throws(
      () =>
        validateClubUpdatePayload({
          homeTactics: { mentality: "UltraHyperAttacking" },
        }),
      (err: unknown) => err instanceof ValidationError
    );

    // Reject malformed player ID
    assert.throws(
      () =>
        validateClubUpdatePayload({
          playerStatuses: [
            { playerId: "p-01; DROP TABLE players;--", status: "Starting XI" },
          ],
        }),
      (err: unknown) => err instanceof ValidationError
    );

    // Reject out-of-range player fitness
    assert.throws(
      () =>
        validateClubUpdatePayload({
          playerUpdates: [{ playerId: "p-01", fitness: 145 }],
        }),
      (err: unknown) => err instanceof ValidationError
    );

    const validMatch = simulateMatch(
      createDefaultMatchInput("validation-test-seed")
    );

    // Reject negative score
    assert.throws(
      () =>
        validateMatchSubmissionPayload({
          result: {
            ...validMatch,
            homeTeam: { ...validMatch.homeTeam, score: -1 },
          },
        }),
      (err: unknown) => err instanceof ValidationError
    );

    // Reject score that disagrees with goal events in the event log
    assert.throws(
      () =>
        validateMatchSubmissionPayload({
          result: {
            ...validMatch,
            homeTeam: {
              ...validMatch.homeTeam,
              score: validMatch.homeTeam.score + 5,
            },
          },
        }),
      (err: unknown) => err instanceof ValidationError
    );

    // Reject malformed fixtureId
    assert.throws(
      () =>
        validateMatchSubmissionPayload({
          result: validMatch,
          fixtureId: "fix/../../invalid",
        }),
      (err: unknown) => err instanceof ValidationError
    );
  });

  it("6. executes end-to-end verification against a live PostgreSQL server when TEST_POSTGRES_URL is provided", async (t) => {
    const liveUrl = process.env.TEST_POSTGRES_URL;
    if (!liveUrl) {
      t.skip("TEST_POSTGRES_URL not set — live PostgreSQL verification not executed");
      return;
    }

    const pool = getPostgresPool(liveUrl);
    try {
      // 1. Migrations (first run + idempotent rerun)
      const m1 = await applyDatabaseMigrations(pool);
      assert.equal(m1.version, "001_initial_schema");
      const m2 = await applyDatabaseMigrations(pool);
      assert.equal(m2.applied, false);

      // 2. Clean seed + idempotent second seed
      const s1 = await seedInitialClubAndSeasonData(pool, true);
      assert.equal(s1.seeded, true);
      const s2 = await seedInitialClubAndSeasonData(pool, false);
      assert.equal(s2.seeded, false);

      // 3. Load initial state & verify counts
      const initial = await loadPersistedClubState(pool);
      assert.equal(initial.club.name, "Northbridge Athletic FC");
      assert.equal(initial.players.length, 14);
      assert.equal(initial.awayPlayers.length, 14);
      assert.equal(initial.manager.seasonRecord.played, 8);

      // 4. Update player fitness, morale, status, and tactics against real PostgreSQL
      const afterClubPatch = await updateClubTacticsAndSquad(
        {
          homeTactics: {
            mentality: "Attacking",
            pressingIntensity: "Gegenpress",
            tempo: "Fast",
            passingStyle: "Direct",
          },
          preferredFormation: "4-3-3 Attacking",
          playerUpdates: [
            {
              playerId: "p-09",
              fitness: 82,
              morale: "Superb",
              status: "Starting XI",
            },
          ],
        },
        pool
      );
      assert.equal(afterClubPatch.homeTactics.mentality, "Attacking");
      assert.equal(afterClubPatch.homeTactics.pressingIntensity, "Gegenpress");
      const p09 = afterClubPatch.players.find((p) => p.id === "p-09")!;
      assert.equal(p09.fitness, 82);
      assert.equal(p09.morale, "Superb");

      // 5. Simulate and persist a match result transactionally
      const simResult = simulateMatch(
        createDefaultMatchInput("live-pg-verification-seed-1")
      );
      const outcome1 = await saveMatchResultTransactionally(
        {
          result: simResult,
          fixtureId: INITIAL_FIXTURE_ID,
        },
        pool
      );
      assert.equal(outcome1.duplicate, false);
      assert.equal(outcome1.state.simulationCount, 1);
      assert.equal(outcome1.state.manager.seasonRecord.played, 9);
      assert.equal(outcome1.state.nextFixture.id, "fix-md-10");

      // 6. Duplicate submission check against real PostgreSQL UNIQUE constraint / submission_key
      const outcome2 = await saveMatchResultTransactionally(
        {
          result: simResult,
          fixtureId: INITIAL_FIXTURE_ID,
        },
        pool
      );
      assert.equal(outcome2.duplicate, true);
      assert.equal(outcome2.state.simulationCount, 1);
      assert.equal(outcome2.state.manager.seasonRecord.played, 9);

      // 7. Real PostgreSQL transaction rollback check
      await assert.rejects(async () => {
        await withTransaction(async (client) => {
          await client.query(
            "UPDATE managers SET played = 999 WHERE club_id = $1",
            [HOME_CLUB_ID]
          );
          throw new Error("Force live PostgreSQL rollback");
        }, pool);
      });

      const afterRollback = await loadPersistedClubState(pool);
      assert.equal(afterRollback.manager.seasonRecord.played, 9);

      // 8. A different result for the already-completed fixture is rejected (no double counting)
      const otherResult = simulateMatch(
        createDefaultMatchInput("live-pg-verification-seed-2")
      );
      await assert.rejects(
        () =>
          saveMatchResultTransactionally(
            { result: otherResult, fixtureId: INITIAL_FIXTURE_ID },
            pool
          ),
        (err: unknown) => err instanceof ConflictError
      );

      // 9. Replaying the SAME seed on the next fixture must not collide on match_results.id,
      //    and concurrent duplicate submissions must resolve to exactly one write.
      const settled = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          saveMatchResultTransactionally(
            { result: simResult, fixtureId: "fix-md-10" },
            pool
          )
        )
      );
      assert.ok(
        settled.every((s) => s.status === "fulfilled"),
        `Concurrent submissions should all resolve: ${JSON.stringify(
          settled.map((s) =>
            s.status === "rejected" ? String((s.reason as Error).message) : "ok"
          )
        )}`
      );
      const fresh = settled.filter(
        (s) => s.status === "fulfilled" && !s.value.duplicate
      );
      assert.equal(fresh.length, 1);
      const afterConcurrent = await loadPersistedClubState(pool);
      assert.equal(afterConcurrent.simulationCount, 2);
      assert.equal(afterConcurrent.manager.seasonRecord.played, 10);

      // 10. A fresh pool (simulated app restart) still sees all persisted data
      const restartedPool = getPostgresPool(liveUrl);
      try {
        const afterRestart = await loadPersistedClubState(restartedPool);
        assert.equal(afterRestart.simulationCount, 2);
        assert.equal(afterRestart.homeTactics.pressingIntensity, "Gegenpress");
        assert.equal(afterRestart.players.find((p) => p.id === "p-09")?.morale, "Superb");
      } finally {
        await restartedPool.end?.();
      }
    } finally {
      if (pool.end) {
        await pool.end();
      }
    }
  });

  it("7. verifies refresh and career reloading does not simulate new matches, preserves seeds and scores, and advances fixtures correctly", async () => {
    const pool = createMockPostgresPool();
    await applyDatabaseMigrations(pool);
    await seedInitialClubAndSeasonData(pool, false);

    // Initial state check: Matchday 9 scheduled, 0 simulation count
    const initial = await loadPersistedClubState(pool);
    assert.equal(initial.simulationCount, 0);
    assert.equal(initial.recentMatches.length, 0);
    assert.equal(initial.nextFixture.id, INITIAL_FIXTURE_ID);
    assert.equal(initial.manager.seasonRecord.played, 8);

    // Multiple reloads (simulating repeated browser refreshes before any match is played)
    const reloadBeforePlay1 = await loadPersistedClubState(pool);
    const reloadBeforePlay2 = await loadPersistedClubState(pool);
    assert.equal(reloadBeforePlay1.simulationCount, 0);
    assert.equal(reloadBeforePlay2.simulationCount, 0);
    assert.equal(reloadBeforePlay1.nextFixture.id, INITIAL_FIXTURE_ID);

    // Simulate Matchday 9 explicitly
    const md9Seed = "md9-run-1-testseed99";
    const md9Match = simulateMatch(createDefaultMatchInput(md9Seed));
    const saveMd9 = await saveMatchResultTransactionally(
      { result: md9Match, fixtureId: INITIAL_FIXTURE_ID },
      pool
    );
    assert.equal(saveMd9.duplicate, false);
    assert.equal(saveMd9.state.simulationCount, 1);
    assert.equal(saveMd9.state.recentMatches[0].seed, md9Seed);
    assert.equal(saveMd9.state.nextFixture.id, "fix-md-10");

    // Multiple reloads (simulating browser refreshes after Matchday 9 is completed)
    // Must NOT simulate a new match, must NOT change seed, must NOT alter scores
    for (let i = 0; i < 3; i++) {
      const refreshedState = await loadPersistedClubState(pool);
      assert.equal(refreshedState.simulationCount, 1);
      assert.equal(refreshedState.recentMatches.length, 1);
      assert.equal(refreshedState.recentMatches[0].seed, md9Seed);
      assert.equal(
        refreshedState.recentMatches[0].homeTeam.score,
        md9Match.homeTeam.score
      );
      assert.equal(
        refreshedState.recentMatches[0].awayTeam.score,
        md9Match.awayTeam.score
      );
      assert.equal(refreshedState.nextFixture.id, "fix-md-10");
      assert.equal(refreshedState.manager.seasonRecord.played, 9);
    }

    // Attempting to re-save completed fixture with a new seed is rejected (no double counting)
    const duplicateResim = simulateMatch(
      createDefaultMatchInput("different-new-seed-xyz")
    );
    await assert.rejects(
      () =>
        saveMatchResultTransactionally(
          { result: duplicateResim, fixtureId: INITIAL_FIXTURE_ID },
          pool
        ),
      (err: unknown) => err instanceof ConflictError
    );

    // Simulating next fixture (Matchday 10) works cleanly and uses Matchday 10 ID
    const md10Seed = "md10-run-2-testseed100";
    const md10Match = simulateMatch(createDefaultMatchInput(md10Seed));
    const saveMd10 = await saveMatchResultTransactionally(
      { result: md10Match, fixtureId: "fix-md-10" },
      pool
    );
    assert.equal(saveMd10.duplicate, false);
    assert.equal(saveMd10.state.simulationCount, 2);
    assert.equal(saveMd10.state.recentMatches.length, 2);
    assert.equal(saveMd10.state.recentMatches[0].seed, md10Seed);
    assert.equal(saveMd10.state.recentMatches[1].seed, md9Seed);
    assert.equal(saveMd10.state.nextFixture.id, "fix-md-11");
  });
});

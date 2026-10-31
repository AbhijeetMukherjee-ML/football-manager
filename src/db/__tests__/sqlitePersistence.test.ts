import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createDefaultMatchInput } from "../../components/match-viewer/matchVisualizer";
import { simulateMatch } from "../../engine/matchEngine";
import { getClubRepository, getDatabaseDriver } from "../factory";
import { DatabaseUnavailableError } from "../postgres";
import { getSqliteDatabasePath } from "../sqlite";
import { SqliteClubRepository } from "../sqliteRepository";
import { ConflictError, ValidationError } from "../types";

describe("Stage 9B: SQLite Persistence Layer", () => {
  let tempDir: string;
  let testDbPath: string;
  let repo: SqliteClubRepository;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-sqlite-test-"));
    testDbPath = path.join(tempDir, "career_test.db");
    repo = new SqliteClubRepository(testDbPath);
  });

  after(() => {
    repo.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("1. initializes fresh SQLite database and applies migrations", async () => {
    const res = await repo.applyMigrations();
    assert.equal(res.version, "001_initial_schema");
    assert.equal(res.applied, true);

    const rawDb = repo.getRawDatabase();
    const tables = rawDb
      .prepare<unknown[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC"
      )
      .all()
      .map((r) => r.name);

    assert.ok(tables.includes("schema_migrations"), "schema_migrations table exists");
    assert.ok(tables.includes("clubs"), "clubs table exists");
    assert.ok(tables.includes("managers"), "managers table exists");
    assert.ok(tables.includes("players"), "players table exists");
    assert.ok(tables.includes("fixtures"), "fixtures table exists");
    assert.ok(tables.includes("match_results"), "match_results table exists");
  });

  it("2. executes migrations idempotently without errors", async () => {
    const res = await repo.applyMigrations();
    assert.equal(res.version, "001_initial_schema");
    assert.equal(res.applied, false);
  });

  it("3. idempotently seeds initial club, manager, players, and Matchday 9 fixture", async () => {
    const res1 = await repo.seedInitialData(false);
    assert.equal(res1.seeded, true);

    const res2 = await repo.seedInitialData(false);
    assert.equal(res2.seeded, false, "Second seed call should be idempotent no-op");
  });

  it("4. loads persisted club, manager, 32 players, and active fixture accurately", async () => {
    const state = await repo.loadClubState();

    assert.equal(state.club.name, "Northbridge Athletic FC");
    assert.equal(state.club.division, "Premier Crown Division");
    assert.equal(state.manager.name, "Marcus Vance");
    assert.equal(state.manager.seasonRecord.played, 8);
    assert.equal(state.players.length, 14, "Home squad players count");
    assert.equal(state.awayPlayers.length, 14, "Away squad players count");
    assert.equal(state.nextFixture.id, "fix-md-09");
    assert.equal(state.nextFixture.competition, "Premier Crown Division");
    assert.equal(state.simulationCount, 0);
    assert.equal(state.recentMatches.length, 0);
  });

  it("5. updates tactics, formation, player status, fitness, and morale transactionally", async () => {
    const updated = await repo.updateClubTacticsAndSquad({
      homeTactics: {
        pressingIntensity: "Gegenpress",
        tempo: "Fast",
      },
      preferredFormation: "4-2-3-1 Gegenpress",
      playerStatuses: [
        { playerId: "p-09", status: "Bench" },
      ],
      playerUpdates: [
        { playerId: "p-09", fitness: 78, morale: "Superb" },
      ],
      recoverSquadFitness: true,
    });

    assert.equal(updated.homeTactics.pressingIntensity, "Gegenpress");
    assert.equal(updated.homeTactics.tempo, "Fast");
    assert.equal(updated.manager.preferredFormation, "4-2-3-1 Gegenpress");

    const p9 = updated.players.find((p) => p.id === "p-09");
    assert.ok(p9);
    assert.equal(p9.status, "Bench");
    assert.equal(p9.morale, "Superb");
    assert.equal(p9.fitness, 90, "Fitness 78 recovered by 12 = 90");
  });

  it("6. saves match result transactionally and updates manager/club/player stats", async () => {
    const simResult = simulateMatch(
      createDefaultMatchInput("sqlite-verification-seed-1")
    );

    const outcome = await repo.saveMatchResult({
      result: simResult,
      fixtureId: "fix-md-09",
    });

    assert.equal(outcome.duplicate, false);
    assert.ok(outcome.matchId.startsWith("match-fix-md-09-"));

    const state = outcome.state;
    assert.equal(state.simulationCount, 1);
    assert.equal(state.manager.seasonRecord.played, 9);
    assert.equal(state.recentMatches.length, 1);
    assert.equal(state.recentMatches[0].seed, "sqlite-verification-seed-1");

    // Home player appearances incremented
    const appearancesSum = state.players.reduce(
      (acc, p) => acc + (p.appearances ?? 0),
      0
    );
    assert.ok(appearancesSum > 0, "Player appearances recorded");
  });

  it("7. prevents duplicate submissions and prevents double-counting statistics", async () => {
    const simResult = simulateMatch(
      createDefaultMatchInput("sqlite-verification-seed-1")
    );

    const dupOutcome = await repo.saveMatchResult({
      result: simResult,
      fixtureId: "fix-md-09",
    });

    assert.equal(dupOutcome.duplicate, true);
    assert.equal(dupOutcome.state.simulationCount, 1, "Simulation count must remain 1");
    assert.equal(dupOutcome.state.manager.seasonRecord.played, 9, "Played count must remain 9");
  });

  it("8. completes active fixture and creates scheduled fixture for the next matchday", async () => {
    const state = await repo.loadClubState();
    assert.equal(state.nextFixture.id, "fix-md-10");
    assert.equal(state.nextFixture.matchdayLabel, "Matchday 10 of 38");

    // Attempting to submit a different result for completed fix-md-09 must be rejected
    const otherSimResult = simulateMatch(
      createDefaultMatchInput("sqlite-different-seed")
    );

    await assert.rejects(
      () =>
        repo.saveMatchResult({
          result: otherSimResult,
          fixtureId: "fix-md-09",
        }),
      (err: unknown) => err instanceof ConflictError
    );

    // Attempting to submit a result for a non-existent fixture must be rejected with ValidationError
    await assert.rejects(
      () =>
        repo.saveMatchResult({
          result: otherSimResult,
          fixtureId: "fix-nonexistent-fixture",
        }),
      (err: unknown) => err instanceof ValidationError
    );
  });

  it("9. rolls back atomic transaction completely when an error is thrown", async () => {
    const rawDb = repo.getRawDatabase();
    const beforePlayed = rawDb
      .prepare<unknown[], { played: number }>(
        "SELECT played FROM managers WHERE id = 'mgr-vance'"
      )
      .get()?.played;

    assert.throws(() => {
      const failingTx = rawDb.transaction(() => {
        rawDb
          .prepare("UPDATE managers SET played = 999 WHERE id = 'mgr-vance'")
          .run();
        throw new Error("Simulated unexpected mid-transaction crash");
      });
      failingTx();
    });

    const afterPlayed = rawDb
      .prepare<unknown[], { played: number }>(
        "SELECT played FROM managers WHERE id = 'mgr-vance'"
      )
      .get()?.played;

    assert.equal(afterPlayed, beforePlayed, "Manager record must be rolled back to before-transaction state");
  });

  it("10. preserves full career state across database close and reopen", async () => {
    repo.close();

    const reopenedRepo = new SqliteClubRepository(testDbPath);
    try {
      const state = await reopenedRepo.loadClubState();
      assert.equal(state.simulationCount, 1);
      assert.equal(state.manager.seasonRecord.played, 9);
      assert.equal(state.nextFixture.id, "fix-md-10");
      assert.equal(state.recentMatches.length, 1);
      assert.equal(state.recentMatches[0].seed, "sqlite-verification-seed-1");
    } finally {
      reopenedRepo.close();
    }
  });

  it("11. strictly enforces foreign key constraints", async () => {
    const isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-fk-test-"));
    const fkDbPath = path.join(isolatedDir, "fk_test.db");
    const fkRepo = new SqliteClubRepository(fkDbPath);

    try {
      await fkRepo.applyMigrations();
      const rawDb = fkRepo.getRawDatabase();

      // Attempt inserting player with non-existent club_id
      assert.throws(() => {
        rawDb
          .prepare(
            `INSERT INTO players (
              id, club_id, shirt_number, name, nationality, position,
              position_group, age, overall, potential, weekly_wage,
              fitness, morale, status, preferred_foot
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            "p-orphan",
            "club-does-not-exist",
            99,
            "Ghost Player",
            "English",
            "ST",
            "ATT",
            21,
            70,
            75,
            5000,
            90,
            "Good",
            "Reserve",
            "Right"
          );
      }, /FOREIGN KEY constraint failed/);
    } finally {
      fkRepo.close();
      if (fs.existsSync(isolatedDir)) {
        fs.rmSync(isolatedDir, { recursive: true, force: true });
      }
    }
  });

  it("12. maintains completely independent state between two career databases", async () => {
    const careerDirA = fs.mkdtempSync(path.join(os.tmpdir(), "fm-career-a-"));
    const careerDirB = fs.mkdtempSync(path.join(os.tmpdir(), "fm-career-b-"));
    const pathA = path.join(careerDirA, "career_a.db");
    const pathB = path.join(careerDirB, "career_b.db");

    const repoA = new SqliteClubRepository(pathA);
    const repoB = new SqliteClubRepository(pathB);

    try {
      await repoA.applyMigrations();
      await repoA.seedInitialData(false);
      await repoB.applyMigrations();
      await repoB.seedInitialData(false);

      // Play 1 match in Career A
      const matchA = simulateMatch(
        createDefaultMatchInput("career-a-match-seed")
      );
      await repoA.saveMatchResult({ result: matchA, fixtureId: "fix-md-09" });

      const stateA = await repoA.loadClubState();
      const stateB = await repoB.loadClubState();

      assert.equal(stateA.simulationCount, 1);
      assert.equal(stateA.nextFixture.id, "fix-md-10");
      assert.equal(stateA.manager.seasonRecord.played, 9);

      assert.equal(stateB.simulationCount, 0, "Career B must have 0 simulations");
      assert.equal(stateB.nextFixture.id, "fix-md-09", "Career B must still be on MD9");
      assert.equal(stateB.manager.seasonRecord.played, 8, "Career B manager record must remain 8");
    } finally {
      repoA.close();
      repoB.close();
      fs.rmSync(careerDirA, { recursive: true, force: true });
      fs.rmSync(careerDirB, { recursive: true, force: true });
    }
  });

  it("13. factory correctly respects DATABASE_DRIVER configuration without cross-fallback", () => {
    const prevDriver = process.env.DATABASE_DRIVER;
    try {
      process.env.DATABASE_DRIVER = "sqlite";
      const sqliteRepo = getClubRepository({ sqliteDbPath: testDbPath });
      assert.equal(sqliteRepo.driver, "sqlite");

      process.env.DATABASE_DRIVER = "postgres";
      const pgRepo = getClubRepository();
      assert.equal(pgRepo.driver, "postgres");
    } finally {
      if (prevDriver !== undefined) {
        process.env.DATABASE_DRIVER = prevDriver;
      } else {
        delete process.env.DATABASE_DRIVER;
      }
    }
  });

  it("14. handles database file paths with spaces and nested directory structures", async () => {
    const spacesDir = path.join(tempDir, "Career Saves Folder With Spaces", "Sub Dir");
    const spacesDbPath = path.join(spacesDir, "my custom save 01.db");

    const spacesRepo = new SqliteClubRepository(spacesDbPath);
    try {
      assert.ok(fs.existsSync(spacesDir), "Parent directory with spaces was automatically created");
      const migrationRes = await spacesRepo.applyMigrations();
      assert.equal(migrationRes.applied, true);

      const seedRes = await spacesRepo.seedInitialData(false);
      assert.equal(seedRes.seeded, true);

      const state = await spacesRepo.loadClubState();
      assert.equal(state.club.name, "Northbridge Athletic FC");
      assert.equal(state.nextFixture.id, "fix-md-09");
    } finally {
      spacesRepo.close();
    }
  });

  it("15. returns actionable SQLITE_CORRUPT error when database file is invalid or corrupted", () => {
    const corruptDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-corrupt-test-"));
    const corruptDbPath = path.join(corruptDir, "corrupted_career.db");
    fs.writeFileSync(corruptDbPath, "THIS_IS_DEFINITELY_NOT_A_VALID_SQLITE_DATABASE_HEADER", "utf8");

    try {
      assert.throws(
        () => new SqliteClubRepository(corruptDbPath),
        (err: unknown) => {
          assert.ok(err instanceof DatabaseUnavailableError);
          assert.equal(err.code, "SQLITE_CORRUPT");
          assert.ok(err.message.includes("corrupted") || err.message.includes("not a valid SQLite database"));
          assert.ok(err.remediation.length > 0);
          return true;
        }
      );
    } finally {
      if (fs.existsSync(corruptDir)) {
        fs.rmSync(corruptDir, { recursive: true, force: true });
      }
    }
  });

  it("16. throws actionable INVALID_DATABASE_DRIVER when DATABASE_DRIVER is unknown", () => {
    const prevDriver = process.env.DATABASE_DRIVER;
    try {
      process.env.DATABASE_DRIVER = "unsupported_mongodb";
      assert.throws(
        () => getDatabaseDriver(),
        (err: unknown) => {
          assert.ok(err instanceof DatabaseUnavailableError);
          assert.equal(err.code, "INVALID_DATABASE_DRIVER");
          assert.ok(err.remediation.length > 0);
          return true;
        }
      );
    } finally {
      if (prevDriver !== undefined) {
        process.env.DATABASE_DRIVER = prevDriver;
      } else {
        delete process.env.DATABASE_DRIVER;
      }
    }
  });

  it("17. resolves custom SQLITE_DB_PATH environment variable correctly", () => {
    const prevPath = process.env.SQLITE_DB_PATH;
    try {
      const customPath = path.join(tempDir, "env_career.db");
      process.env.SQLITE_DB_PATH = customPath;
      const resolved = getSqliteDatabasePath();
      assert.equal(resolved, path.resolve(customPath));
    } finally {
      if (prevPath !== undefined) {
        process.env.SQLITE_DB_PATH = prevPath;
      } else {
        delete process.env.SQLITE_DB_PATH;
      }
    }
  });
});

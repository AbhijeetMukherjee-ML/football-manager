import {
  DatabaseUnavailableError,
  loadEnvLocalIfPresent,
} from "./postgres";
import { getClubRepository, getDatabaseDriver } from "./factory";

async function runSeedCli(): Promise<void> {
  loadEnvLocalIfPresent();
  const driver = getDatabaseDriver();
  const forceReset = process.argv.includes("--reset");
  const repo = getClubRepository();

  try {
    await repo.applyMigrations();
    const res = await repo.seedInitialData(forceReset);
    console.log(
      `[db:seed (${driver})] ${
        res.seeded
          ? forceReset
            ? "Database reset and re-seeded with initial club, squad, and Matchday 9 data."
            : `Initial club, squad, and Matchday 9 data seeded into ${driver}.`
          : `Database already contains club and squad data (idempotent no-op). Pass --reset to force reset.`
      }`
    );
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) {
      console.error(`\n[db:seed (${driver})] ERROR (${err.code}): ${err.message}`);
      console.error("Actionable steps:");
      for (const step of err.remediation) {
        console.error(`  ${step}`);
      }
    } else {
      console.error(`[db:seed (${driver})] Unexpected error:`, err);
    }
    process.exitCode = 1;
  } finally {
    if (repo.close) {
      await repo.close();
    }
  }
}

if (require.main === module) {
  void runSeedCli();
}

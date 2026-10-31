import {
  DatabaseUnavailableError,
  loadEnvLocalIfPresent,
} from "./postgres";
import { getClubRepository, getDatabaseDriver } from "./factory";

async function runMigrationsCli(): Promise<void> {
  loadEnvLocalIfPresent();
  const driver = getDatabaseDriver();
  const repo = getClubRepository();

  try {
    const res = await repo.applyMigrations();
    console.log(
      `[db:migrate (${driver})] Schema migration '${res.version}' ${
        res.applied ? "applied successfully" : "already up to date"
      }.`
    );
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) {
      console.error(`\n[db:migrate (${driver})] ERROR (${err.code}): ${err.message}`);
      console.error("Actionable steps:");
      for (const step of err.remediation) {
        console.error(`  ${step}`);
      }
    } else {
      console.error(`[db:migrate (${driver})] Unexpected error:`, err);
    }
    process.exitCode = 1;
  } finally {
    if (repo.close) {
      await repo.close();
    }
  }
}

if (require.main === module) {
  void runMigrationsCli();
}

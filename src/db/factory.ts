import {
  DatabaseUnavailableError,
  loadEnvLocalIfPresent,
  SqlPoolAdapter,
} from "./postgres";
import { PostgresClubRepository } from "./repository";
import { SqliteClubRepository } from "./sqliteRepository";
import { ClubRepository, DatabaseDriver } from "./types";

export interface RepositoryOptions {
  driver?: DatabaseDriver;
  postgresPoolOverride?: SqlPoolAdapter;
  sqliteDbPath?: string;
}

/**
 * Resolves the configured database driver.
 * Defaults to "postgres" for existing development workflows.
 * Explicitly returns "sqlite" only when DATABASE_DRIVER=sqlite.
 */
export function getDatabaseDriver(): DatabaseDriver {
  loadEnvLocalIfPresent();
  const raw = (process.env.DATABASE_DRIVER ?? "postgres").trim().toLowerCase();

  if (raw === "postgres" || raw === "postgresql") {
    return "postgres";
  }

  if (raw === "sqlite" || raw === "sqlite3") {
    return "sqlite";
  }

  throw new DatabaseUnavailableError(
    `Unsupported DATABASE_DRIVER "${process.env.DATABASE_DRIVER}". Supported drivers are "postgres" and "sqlite".`,
    "INVALID_DATABASE_DRIVER",
    [
      "1. Set DATABASE_DRIVER=postgres in .env.local to use PostgreSQL (default).",
      "2. Set DATABASE_DRIVER=sqlite in .env.local to use SQLite for desktop/standalone mode.",
      "3. Leave DATABASE_DRIVER unset to use PostgreSQL default.",
    ]
  );
}

/**
 * Returns a `ClubRepository` instance for the active database driver.
 * Never silently falls back between PostgreSQL and SQLite.
 */
export function getClubRepository(options?: RepositoryOptions): ClubRepository {
  const driver = options?.driver ?? getDatabaseDriver();

  if (driver === "sqlite") {
    return new SqliteClubRepository(options?.sqliteDbPath);
  }

  return new PostgresClubRepository(options?.postgresPoolOverride);
}

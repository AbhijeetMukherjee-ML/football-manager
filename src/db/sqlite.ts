import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Database as SqliteDatabase } from "better-sqlite3";
import { DatabaseUnavailableError } from "./postgres";

declare global {
  var __fmSqliteDb: SqliteDatabase | undefined;
}

/**
 * Resolves the absolute path for the SQLite database file.
 * Prioritizes custom argument, then `SQLITE_DB_PATH` env variable,
 * then platform standard user data directories.
 */
export function getSqliteDatabasePath(customPath?: string): string {
  if (customPath && customPath.trim().length > 0) {
    return path.resolve(customPath.trim());
  }

  const envPath = process.env.SQLITE_DB_PATH?.trim();
  if (envPath) {
    return path.resolve(envPath);
  }

  // Windows standard: %APPDATA%\FootballManager\saves\career.db
  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "FootballManager", "saves", "career.db");
  }

  // macOS / Linux standard: ~/.football-manager/saves/career.db
  return path.join(os.homedir(), ".football-manager", "saves", "career.db");
}

/**
 * Ensures the parent directory of the database file exists with safe permissions.
 */
export function ensureParentDirectoryExists(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  }
}

/**
 * Normalizes low-level SQLite / filesystem errors into an actionable
 * `DatabaseUnavailableError` matching the project's error reporting standards.
 */
export function normalizeSqliteError(err: unknown, dbPath?: string): Error {
  if (err instanceof DatabaseUnavailableError) {
    return err;
  }

  if (
    err instanceof Error &&
    (err.name === "ValidationError" || err.name === "ConflictError")
  ) {
    return err;
  }

  const message = err instanceof Error ? err.message : String(err);
  const targetPath = dbPath ?? "configured SQLite path";

  if (message.includes("readonly") || message.includes("EACCES") || message.includes("permission denied")) {
    return new DatabaseUnavailableError(
      `Permission denied opening SQLite database at "${targetPath}". Ensure the process has read/write permissions.`,
      "SQLITE_PERMISSION_DENIED",
      [
        `1. Check file permissions for "${targetPath}" and its parent directory.`,
        "2. Ensure the directory is writable by the current user.",
      ]
    );
  }

  if (message.includes("busy") || message.includes("locked")) {
    return new DatabaseUnavailableError(
      `SQLite database at "${targetPath}" is locked by another process.`,
      "SQLITE_BUSY",
      [
        "1. Ensure no other instance of Football Manager is running.",
        "2. Wait a few moments for background locks to clear.",
      ]
    );
  }

  if (message.includes("no such table")) {
    return new DatabaseUnavailableError(
      `SQLite schema is missing tables (${message}). Run schema migrations to initialize the database.`,
      "SQLITE_SCHEMA_MISSING",
      [
        "1. Run `DATABASE_DRIVER=sqlite npm run db:setup` to apply schema migrations and seed initial data.",
      ]
    );
  }

  if (
    message.includes("file is not a database") ||
    message.includes("malformed") ||
    message.includes("corrupt")
  ) {
    return new DatabaseUnavailableError(
      `The SQLite file at "${targetPath}" is corrupted or is not a valid SQLite database (${message}).`,
      "SQLITE_CORRUPT",
      [
        `1. Restore "${targetPath}" from a backup or remove the corrupted file.`,
        "2. Re-run `DATABASE_DRIVER=sqlite npm run db:setup` to initialize a fresh database.",
      ]
    );
  }

  return new DatabaseUnavailableError(
    `SQLite operation failed: ${message}`,
    "SQLITE_ERROR",
    [
      `1. Verify that the SQLite file at "${targetPath}" is not corrupted.`,
      "2. Check SQLITE_DB_PATH in your environment or configuration.",
    ]
  );
}

/**
 * Creates and configures a new SQLite connection with foreign keys and WAL mode.
 */
export function createSqliteConnection(dbPath?: string): SqliteDatabase {
  const resolvedPath = getSqliteDatabasePath(dbPath);

  try {
    ensureParentDirectoryExists(resolvedPath);
    const db = new Database(resolvedPath, {
      timeout: 5000,
    });

    // Essential PRAGMAs for durability, performance, and relational integrity
    db.pragma("foreign_keys = ON");
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("busy_timeout = 5000");

    return db;
  } catch (err) {
    throw normalizeSqliteError(err, resolvedPath);
  }
}

/**
 * Returns a singleton SQLite connection for the current process, or creates an isolated connection
 * when an explicit `customPath` is specified.
 */
export function getSqliteDatabase(customPath?: string): SqliteDatabase {
  if (customPath) {
    return createSqliteConnection(customPath);
  }

  if (!globalThis.__fmSqliteDb || !globalThis.__fmSqliteDb.open) {
    globalThis.__fmSqliteDb = createSqliteConnection();
  }

  return globalThis.__fmSqliteDb;
}

/**
 * Closes a SQLite connection safely.
 */
export function closeSqliteDatabase(db?: SqliteDatabase): void {
  const target = db ?? globalThis.__fmSqliteDb;
  if (target && target.open) {
    try {
      target.close();
    } catch {
      // Ignore errors on close
    }
    if (target === globalThis.__fmSqliteDb) {
      globalThis.__fmSqliteDb = undefined;
    }
  }
}

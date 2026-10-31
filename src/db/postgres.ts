import fs from "node:fs";
import path from "node:path";
import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

export interface SqlQueryClient {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<R>>;
}

export interface SqlPoolAdapter extends SqlQueryClient {
  connect(): Promise<
    SqlQueryClient & {
      release: () => void;
    }
  >;
  end?: () => Promise<void>;
}

export class DatabaseUnavailableError extends Error {
  public readonly code: string;
  public readonly remediation: string[];

  constructor(
    message: string,
    code = "DATABASE_UNAVAILABLE",
    remediation?: string[]
  ) {
    super(message);
    this.name = "DatabaseUnavailableError";
    this.code = code;
    this.remediation = remediation ?? [
      "1. Copy .env.example to .env.local and set a valid PostgreSQL DATABASE_URL.",
      "2. Ensure your PostgreSQL server is running (e.g., `pg_isready` or `brew services start postgresql`).",
      "3. Run `npm run db:setup` to apply migrations and seed the initial club and season data.",
    ];
  }
}

/**
 * Loads `.env.local` into `process.env` when running standalone CLI scripts
 * (`npm run db:migrate`, `npm run db:seed`) outside the Next.js runtime.
 */
export function loadEnvLocalIfPresent(
  workspaceRoot = process.cwd()
): void {
  if (process.env.DATABASE_URL) return;
  const envLocalPath = path.join(workspaceRoot, ".env.local");
  if (!fs.existsSync(envLocalPath)) return;

  const content = fs.readFileSync(envLocalPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

/**
 * Validates and returns the configured PostgreSQL connection string from `DATABASE_URL`.
 * Throws `DatabaseUnavailableError` if missing or still set to the `.env.example` placeholder.
 */
export function getDatabaseUrl(explicitUrl?: string): string {
  loadEnvLocalIfPresent();
  const url = (explicitUrl ?? process.env.DATABASE_URL ?? "").trim();

  if (!url) {
    throw new DatabaseUnavailableError(
      "PostgreSQL persistence is not configured: DATABASE_URL is not set in .env.local.",
      "DATABASE_URL_MISSING"
    );
  }

  if (
    url.includes("YOUR_DB_USER") ||
    url.includes("YOUR_DB_PASSWORD")
  ) {
    throw new DatabaseUnavailableError(
      "PostgreSQL persistence is not configured: DATABASE_URL in .env.local still contains the placeholder credentials from .env.example.",
      "DATABASE_URL_PLACEHOLDER"
    );
  }

  if (
    !url.startsWith("postgres://") &&
    !url.startsWith("postgresql://")
  ) {
    throw new DatabaseUnavailableError(
      "Invalid DATABASE_URL protocol: expected a `postgresql://` or `postgres://` connection string.",
      "DATABASE_URL_INVALID"
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DatabaseUnavailableError(
      "Malformed DATABASE_URL syntax: verify the PostgreSQL connection string format in .env.local.",
      "DATABASE_URL_INVALID"
    );
  }

  const socketHost = parsed.searchParams.get("host");
  const dbName = parsed.pathname.replace(/^\/+/, "").trim();
  if ((!parsed.hostname && !socketHost) || !dbName) {
    throw new DatabaseUnavailableError(
      "Incomplete DATABASE_URL: both a database host and database name are required (e.g., postgresql://localhost:5432/football_manager).",
      "DATABASE_URL_INVALID"
    );
  }

  if (parsed.port) {
    const portNum = Number(parsed.port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      throw new DatabaseUnavailableError(
        "Invalid port in DATABASE_URL: port must be an integer between 1 and 65535.",
        "DATABASE_URL_INVALID"
      );
    }
  }

  return url;
}

declare global {
  var __fmPgPool: Pool | undefined;
}

/**
 * Returns a singleton `pg.Pool` for the Next.js server process.
 * Never exposes credentials to the client and never falls back to silent in-memory storage.
 */
export function getPostgresPool(explicitUrl?: string): SqlPoolAdapter {
  const connectionString = getDatabaseUrl(explicitUrl);

  if (explicitUrl) {
    return new Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 4000,
      idleTimeoutMillis: 10000,
    });
  }

  if (!globalThis.__fmPgPool) {
    globalThis.__fmPgPool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 4000,
      idleTimeoutMillis: 30000,
    });
  }

  return globalThis.__fmPgPool;
}

/**
 * Converts low-level `pg` socket/authentication/schema errors into an actionable
 * `DatabaseUnavailableError` without leaking any credentials.
 */
export function normalizeDatabaseError(err: unknown): Error {
  if (err instanceof DatabaseUnavailableError) {
    return err;
  }

  // Application-level validation/conflict errors (thrown inside transactions)
  // are not database failures and must reach the API layer unchanged.
  if (
    err instanceof Error &&
    (err.name === "ValidationError" || err.name === "ConflictError")
  ) {
    return err;
  }

  const pgErr = err as { code?: string; message?: string };
  const code = pgErr?.code ?? "";
  const rawMessage = pgErr?.message ?? String(err);

  // Redact any accidental connection URI fragments from error messages
  const safeMessage = rawMessage.replace(
    /postgres(?:ql)?:\/\/[^\s@]+@/gi,
    "postgresql://[REDACTED]@"
  );

  if (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    code === "57P01" ||
    code === "57P03" ||
    safeMessage.includes("ECONNREFUSED") ||
    safeMessage.includes("connect ETIMEDOUT") ||
    safeMessage.includes("Connection terminated")
  ) {
    return new DatabaseUnavailableError(
      `Cannot connect to PostgreSQL server (${code || "CONNECTION_ERROR"}). Verify that PostgreSQL is running and reachable at your configured DATABASE_URL.`,
      "POSTGRES_CONNECTION_FAILED"
    );
  }

  if (code === "28P01" || code === "28000") {
    return new DatabaseUnavailableError(
      "PostgreSQL authentication failed. Check the username and password in your .env.local DATABASE_URL.",
      "POSTGRES_AUTH_FAILED"
    );
  }

  if (code === "3D000") {
    return new DatabaseUnavailableError(
      "The target PostgreSQL database does not exist yet. Create the database (e.g., `createdb football_manager`) and run `npm run db:setup`.",
      "POSTGRES_DB_NOT_FOUND"
    );
  }

  if (code === "42P01") {
    return new DatabaseUnavailableError(
      `PostgreSQL schema tables are missing (${safeMessage}). Run \`npm run db:setup\` or \`npm run db:migrate\` to initialize the database schema.`,
      "POSTGRES_SCHEMA_MISSING"
    );
  }

  return new DatabaseUnavailableError(
    `PostgreSQL query failed: ${safeMessage}`,
    code || "POSTGRES_QUERY_ERROR"
  );
}

/**
 * Executes a callback inside a `BEGIN ... COMMIT` PostgreSQL transaction.
 * Automatically executes `ROLLBACK` if any statement fails.
 */
export async function withTransaction<T>(
  work: (client: SqlQueryClient) => Promise<T>,
  poolOverride?: SqlPoolAdapter
): Promise<T> {
  const pool = poolOverride ?? getPostgresPool();
  let client: (SqlQueryClient & { release: () => void }) | PoolClient;

  try {
    client = await pool.connect();
  } catch (err) {
    throw normalizeDatabaseError(err);
  }

  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback secondary errors
    }
    throw normalizeDatabaseError(err);
  } finally {
    client.release();
  }
}

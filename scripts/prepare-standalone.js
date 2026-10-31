#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const standaloneDir = path.join(projectRoot, ".next", "standalone");

if (!fs.existsSync(standaloneDir)) {
  console.error(
    "[prepare-standalone] ERROR: .next/standalone does not exist. Run \"next build\" first."
  );
  process.exit(1);
}

// 1. Copy public/ -> .next/standalone/public/
const publicSrc = path.join(projectRoot, "public");
const publicDest = path.join(standaloneDir, "public");
if (fs.existsSync(publicSrc)) {
  fs.cpSync(publicSrc, publicDest, { recursive: true });
  console.log("[prepare-standalone] Copied public/ -> .next/standalone/public/");
}

// 2. Copy .next/static/ -> .next/standalone/.next/static/
const staticSrc = path.join(projectRoot, ".next", "static");
const staticDest = path.join(standaloneDir, ".next", "static");
if (fs.existsSync(staticSrc)) {
  fs.cpSync(staticSrc, staticDest, { recursive: true });
  console.log("[prepare-standalone] Copied .next/static/ -> .next/standalone/.next/static/");
}

// 3. Ensure db/sqlite_migrations/ -> .next/standalone/db/sqlite_migrations/
const sqliteMigrationsSrc = path.join(projectRoot, "db", "sqlite_migrations");
const sqliteMigrationsDest = path.join(standaloneDir, "db", "sqlite_migrations");
if (fs.existsSync(sqliteMigrationsSrc)) {
  fs.cpSync(sqliteMigrationsSrc, sqliteMigrationsDest, { recursive: true });
  console.log(
    "[prepare-standalone] Copied db/sqlite_migrations/ -> .next/standalone/db/sqlite_migrations/"
  );
}

// 4. Clean sensitive and dev-only files from standalone bundle
const sensitiveFiles = [
  path.join(standaloneDir, ".env"),
  path.join(standaloneDir, ".env.local"),
  path.join(standaloneDir, ".env.development"),
  path.join(standaloneDir, ".env.development.local"),
  path.join(standaloneDir, ".env.test"),
  path.join(standaloneDir, ".env.test.local"),
  path.join(standaloneDir, ".env.production.local"),
];

for (const file of sensitiveFiles) {
  if (fs.existsSync(file)) {
    fs.rmSync(file, { force: true });
    console.log(
      `[prepare-standalone] Removed sensitive file from standalone bundle: ${path.basename(file)}`
    );
  }
}

// 5. Remove any sqlite database files that might have been picked up
function purgeDatabases(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      purgeDatabases(fullPath);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".db") ||
        entry.name.endsWith(".sqlite") ||
        entry.name.endsWith(".db-wal") ||
        entry.name.endsWith(".db-shm"))
    ) {
      fs.rmSync(fullPath, { force: true });
      console.log(`[prepare-standalone] Purged database file from standalone: ${entry.name}`);
    }
  }
}
purgeDatabases(standaloneDir);

console.log("[prepare-standalone] Standalone bundle prepared successfully.");

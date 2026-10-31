import assert from "node:assert/strict";
import { ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createDefaultMatchInput } from "../../src/components/match-viewer/matchVisualizer";
import { simulateMatch } from "../../src/engine/matchEngine";
import {
  getDesktopSavePath,
  getFreePort,
  getProjectRoot,
  isProductionDesktop,
  killProcessTree,
  startNextDevServer,
  startNextStandaloneServer,
  waitForServerHealthy,
} from "../main";

function httpGetJson<T>(url: string): Promise<{ status: number; body: T }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const body = JSON.parse(data) as T;
          resolve({ status: res.statusCode ?? 0, body });
        } catch {
          reject(new Error(`Failed to parse JSON response: ${data}`));
        }
      });
    });
    req.on("error", reject);
  });
}

function httpPostJson<T>(
  url: string,
  payload: unknown
): Promise<{ status: number; body: T }> {
  return new Promise((resolve, reject) => {
    const dataString = JSON.stringify(payload);
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(dataString),
        },
      },
      (res) => {
        let bodyStr = "";
        res.on("data", (chunk) => {
          bodyStr += chunk;
        });
        res.on("end", () => {
          try {
            const body = JSON.parse(bodyStr) as T;
            resolve({ status: res.statusCode ?? 0, body });
          } catch {
            reject(new Error(`Failed to parse POST response: ${bodyStr}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(dataString);
    req.end();
  });
}

function httpPatchJson<T>(
  url: string,
  payload: unknown
): Promise<{ status: number; body: T }> {
  return new Promise((resolve, reject) => {
    const dataString = JSON.stringify(payload);
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(dataString),
        },
      },
      (res) => {
        let bodyStr = "";
        res.on("data", (chunk) => {
          bodyStr += chunk;
        });
        res.on("end", () => {
          try {
            const body = JSON.parse(bodyStr) as T;
            resolve({ status: res.statusCode ?? 0, body });
          } catch {
            reject(new Error(`Failed to parse PATCH response: ${bodyStr}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(dataString);
    req.end();
  });
}

describe("Stage 10B: Electron Development Shell & Server Supervisor", () => {
  let tempDir: string;
  let testSavePath: string;
  let allocatedPort: number;
  let serverProcess: ChildProcess | null = null;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-electron-test-"));
    testSavePath = path.join(tempDir, "saves", "career.db");
  });

  after(() => {
    if (serverProcess) {
      killProcessTree(serverProcess);
      serverProcess = null;
    }
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore rm errors on exit
      }
    }
  });

  it("1. allocates an available ephemeral loopback port dynamically", async () => {
    allocatedPort = await getFreePort();
    assert.ok(allocatedPort > 1024, `Port ${allocatedPort} must be a valid non-privileged port`);
    assert.ok(allocatedPort < 65536, `Port ${allocatedPort} must be within 16-bit range`);
  });

  it("2. resolves the project root directory accurately", () => {
    const root = getProjectRoot();
    assert.ok(fs.existsSync(path.join(root, "package.json")), "Project root must contain package.json");
    assert.ok(fs.existsSync(path.join(root, "desktop", "main.ts")), "Project root must contain desktop/main.ts");
  });

  it("3. resolves desktop save path in persistent user data storage", () => {
    const savePath = getDesktopSavePath();
    assert.ok(savePath.endsWith("career.db"), "Desktop save file must end with career.db");
    assert.ok(
      !savePath.startsWith(getProjectRoot()),
      "Desktop save path must be outside project workspace"
    );
  });

  it("4. handles killProcessTree safely for null or inactive processes", () => {
    assert.doesNotThrow(() => killProcessTree(null));
    assert.doesNotThrow(() => killProcessTree({ killed: true } as unknown as ChildProcess));
  });

  it("5. spawns Next.js dev server with SQLite driver and passes health check", async () => {
    const root = getProjectRoot();
    serverProcess = await startNextDevServer(root, allocatedPort, testSavePath);
    assert.ok(serverProcess.pid, "Child server process must have a valid PID");

    await waitForServerHealthy(allocatedPort, 45000);

    const healthCheck = await httpGetJson<{
      ok: boolean;
      data: {
        club: { name: string };
        nextFixture: { id: string };
        manager: { name: string };
      };
    }>(`http://127.0.0.1:${allocatedPort}/api/club`);

    assert.equal(healthCheck.status, 200);
    assert.equal(healthCheck.body.ok, true);
    assert.equal(healthCheck.body.data.club.name, "Northbridge Athletic FC");
    assert.equal(healthCheck.body.data.nextFixture.id, "fix-md-09");
    assert.equal(healthCheck.body.data.manager.name, "Marcus Vance");

    // Verify SQLite file was automatically created in testSavePath
    assert.ok(fs.existsSync(testSavePath), "SQLite database file must be created at testSavePath");
  });

  it("6. serves dashboard HTML page over loopback port", async () => {
    const htmlRes = await new Promise<{ status: number; text: string }>((resolve, reject) => {
      http.get(`http://127.0.0.1:${allocatedPort}/`, (res) => {
        let text = "";
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      }).on("error", reject);
    });

    assert.equal(htmlRes.status, 200);
    assert.ok(htmlRes.text.includes("<!DOCTYPE html>") || htmlRes.text.includes("<html"));
  });

  it("7. executes match simulation and records results into the desktop SQLite database", async () => {
    const simResult = simulateMatch(
      createDefaultMatchInput("desktop-electron-match-seed-1")
    );

    const postRes = await httpPostJson<{
      ok: boolean;
      duplicate: boolean;
      matchId: string;
      data: {
        simulationCount: number;
        nextFixture: { id: string; matchdayLabel: string };
        manager: { seasonRecord: { played: number } };
      };
    }>(`http://127.0.0.1:${allocatedPort}/api/matches`, {
      result: simResult,
      fixtureId: "fix-md-09",
    });

    assert.equal(postRes.status, 201);
    assert.equal(postRes.body.ok, true);
    assert.equal(postRes.body.duplicate, false);
    assert.equal(postRes.body.data.simulationCount, 1);
    assert.equal(postRes.body.data.nextFixture.id, "fix-md-10");
    assert.equal(postRes.body.data.manager.seasonRecord.played, 9);
  });

  it("8. updates club tactics and formation via desktop server API", async () => {
    const patchRes = await httpPatchJson<{
      ok: boolean;
      data: {
        homeTactics: { pressingIntensity: string };
        manager: { preferredFormation: string };
      };
    }>(`http://127.0.0.1:${allocatedPort}/api/club`, {
      homeTactics: { pressingIntensity: "Gegenpress" },
      preferredFormation: "4-2-3-1 Gegenpress",
    });

    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.ok, true);
    assert.equal(patchRes.body.data.homeTactics.pressingIntensity, "Gegenpress");
    assert.equal(patchRes.body.data.manager.preferredFormation, "4-2-3-1 Gegenpress");
  });

  it("9. shuts down the child server cleanly and leaves no orphaned processes", async () => {
    assert.ok(serverProcess);
    killProcessTree(serverProcess);
    serverProcess = null;

    // Allow process to close
    await new Promise((r) => setTimeout(r, 1000));

    // Verify port is closed
    await assert.rejects(async () => {
      await httpGetJson(`http://127.0.0.1:${allocatedPort}/api/club`);
    });
  });

  it("10. verifies persistent SQLite database retained match progress after server shutdown", () => {
    assert.ok(fs.existsSync(testSavePath), "SQLite database must persist on disk after server shutdown");
    const stat = fs.statSync(testSavePath);
    assert.ok(stat.size > 0, "SQLite database must have non-zero size");
  });
});

describe("Stage 10C: Next.js Standalone Production Server & Electron Integration", () => {
  let prodTempDir: string;
  let prodSavePath: string;
  let prodPort: number;
  let prodServerProcess: ChildProcess | null = null;

  before(async () => {
    prodTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-standalone-test-"));
    prodSavePath = path.join(prodTempDir, "saves", "career.db");
  });

  after(() => {
    if (prodServerProcess) {
      killProcessTree(prodServerProcess);
      prodServerProcess = null;
    }
    if (fs.existsSync(prodTempDir)) {
      try {
        fs.rmSync(prodTempDir, { recursive: true, force: true });
      } catch {
        // Ignore rm errors on exit
      }
    }
  });

  it("1. isProductionDesktop correctly detects production mode via environment flags", () => {
    const origMode = process.env.DESKTOP_MODE;
    const envRecord = process.env as Record<string, string | undefined>;
    const origNodeEnv = envRecord.NODE_ENV;

    try {
      process.env.DESKTOP_MODE = "production";
      assert.equal(isProductionDesktop(), true);

      process.env.DESKTOP_MODE = "development";
      assert.equal(isProductionDesktop(), false);

      delete process.env.DESKTOP_MODE;
      envRecord.NODE_ENV = "production";
      assert.equal(isProductionDesktop(), true);

      envRecord.NODE_ENV = "development";
      assert.equal(isProductionDesktop(), false);
    } finally {
      if (origMode !== undefined) process.env.DESKTOP_MODE = origMode;
      else delete process.env.DESKTOP_MODE;

      if (origNodeEnv !== undefined) envRecord.NODE_ENV = origNodeEnv;
      else delete envRecord.NODE_ENV;
    }
  });

  it("2. startNextStandaloneServer throws an actionable error if standalone build is missing", async () => {
    const fakeDir = path.join(prodTempDir, "non-existent-project");
    fs.mkdirSync(fakeDir, { recursive: true });

    await assert.rejects(
      async () => {
        await startNextStandaloneServer(fakeDir, 41000, prodSavePath);
      },
      (err: Error) => {
        assert.ok(err.message.includes("Cannot find Next.js standalone server"));
        assert.ok(err.message.includes("npm run build"));
        return true;
      }
    );
  });

  it("3. spawns Next.js standalone production server with SQLite and passes health check", async () => {
    prodPort = await getFreePort();
    const root = getProjectRoot();

    prodServerProcess = await startNextStandaloneServer(root, prodPort, prodSavePath);
    assert.ok(prodServerProcess.pid, "Standalone server process must have a valid PID");

    await waitForServerHealthy(prodPort, 45000);

    const clubRes = await httpGetJson<{
      ok: boolean;
      data: {
        club: { name: string; division: string };
        nextFixture: { id: string };
        manager: { name: string; seasonRecord: { played: number } };
        players: Array<{ id: string }>;
      };
    }>(`http://127.0.0.1:${prodPort}/api/club`);

    assert.equal(clubRes.status, 200);
    assert.equal(clubRes.body.ok, true);
    assert.equal(clubRes.body.data.club.name, "Northbridge Athletic FC");
    assert.equal(clubRes.body.data.club.division, "Premier Crown Division");
    assert.equal(clubRes.body.data.nextFixture.id, "fix-md-09");
    assert.equal(clubRes.body.data.manager.name, "Marcus Vance");
    assert.equal(clubRes.body.data.manager.seasonRecord.played, 8);
    assert.ok(clubRes.body.data.players.length >= 14, "Must load squad players");

    assert.ok(fs.existsSync(prodSavePath), "SQLite database must be created at prodSavePath");
  });

  it("4. serves production dashboard HTML with 200 OK", async () => {
    const htmlRes = await new Promise<{ status: number; text: string }>((resolve, reject) => {
      http.get(`http://127.0.0.1:${prodPort}/`, (res) => {
        let text = "";
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      }).on("error", reject);
    });

    assert.equal(htmlRes.status, 200);
    assert.ok(htmlRes.text.includes("<!DOCTYPE html>"), "Response must be HTML document");
  });

  it("5. serves static CSS and chunk assets from .next/standalone/.next/static", async () => {
    const htmlRes = await new Promise<{ text: string }>((resolve, reject) => {
      http.get(`http://127.0.0.1:${prodPort}/`, (res) => {
        let text = "";
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => resolve({ text }));
      }).on("error", reject);
    });

    const cssMatch = htmlRes.text.match(/(\/_next\/static\/[^"]+\.css)/);
    assert.ok(cssMatch, "HTML must reference a static CSS stylesheet");

    const cssUrl = `http://127.0.0.1:${prodPort}${cssMatch[1]}`;
    const cssRes = await new Promise<{ status: number; length: number }>((resolve, reject) => {
      http.get(cssUrl, (res) => {
        let length = 0;
        res.on("data", (chunk) => (length += chunk.length));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, length }));
      }).on("error", reject);
    });

    assert.equal(cssRes.status, 200);
    assert.ok(cssRes.length > 1000, "Static CSS stylesheet must be non-empty");
  });

  it("6. serves public assets from .next/standalone/public", async () => {
    const publicAssetUrl = `http://127.0.0.1:${prodPort}/file.svg`;
    const res = await new Promise<{ status: number; length: number }>((resolve, reject) => {
      http.get(publicAssetUrl, (res) => {
        let length = 0;
        res.on("data", (chunk) => (length += chunk.length));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, length }));
      }).on("error", reject);
    });

    assert.equal(res.status, 200);
    assert.ok(res.length > 0, "Public asset must be served successfully");
  });

  it("7. executes match simulation and saves result to SQLite in standalone mode", async () => {
    const simResult = simulateMatch(
      createDefaultMatchInput("standalone-prod-match-seed-1")
    );

    const postRes = await httpPostJson<{
      ok: boolean;
      duplicate: boolean;
      matchId: string;
      data: {
        simulationCount: number;
        nextFixture: { id: string; matchdayLabel: string };
        manager: { seasonRecord: { played: number } };
      };
    }>(`http://127.0.0.1:${prodPort}/api/matches`, {
      result: simResult,
      fixtureId: "fix-md-09",
    });

    assert.equal(postRes.status, 201);
    assert.equal(postRes.body.ok, true);
    assert.equal(postRes.body.duplicate, false);
    assert.equal(postRes.body.data.simulationCount, 1);
    assert.equal(postRes.body.data.nextFixture.id, "fix-md-10");
    assert.equal(postRes.body.data.manager.seasonRecord.played, 9);
  });

  it("8. updates tactics and manager formation in standalone mode", async () => {
    const patchRes = await httpPatchJson<{
      ok: boolean;
      data: {
        homeTactics: { pressingIntensity: string; mentality: string };
        manager: { preferredFormation: string };
      };
    }>(`http://127.0.0.1:${prodPort}/api/club`, {
      homeTactics: {
        pressingIntensity: "Gegenpress",
        mentality: "Attacking",
      },
      preferredFormation: "4-2-3-1 Gegenpress",
    });

    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.ok, true);
    assert.equal(patchRes.body.data.homeTactics.pressingIntensity, "Gegenpress");
    assert.equal(patchRes.body.data.homeTactics.mentality, "Attacking");
    assert.equal(patchRes.body.data.manager.preferredFormation, "4-2-3-1 Gegenpress");
  });

  it("9. cleanly shuts down standalone production server with zero orphaned processes", async () => {
    assert.ok(prodServerProcess);
    killProcessTree(prodServerProcess);
    prodServerProcess = null;

    await new Promise((r) => setTimeout(r, 1000));

    await assert.rejects(async () => {
      await httpGetJson(`http://127.0.0.1:${prodPort}/api/club`);
    });
  });

  it("10. restarts standalone server against existing database and verifies full career persistence", async () => {
    const newPort = await getFreePort();
    const root = getProjectRoot();

    // Relaunch standalone server using the SAME prodSavePath
    const restartedServer = await startNextStandaloneServer(root, newPort, prodSavePath);
    try {
      await waitForServerHealthy(newPort, 45000);

      const reloadRes = await httpGetJson<{
        ok: boolean;
        data: {
          nextFixture: { id: string };
          manager: {
            preferredFormation: string;
            seasonRecord: { played: number };
          };
          homeTactics: { pressingIntensity: string; mentality: string };
          simulationCount: number;
        };
      }>(`http://127.0.0.1:${newPort}/api/club`);

      assert.equal(reloadRes.status, 200);
      assert.equal(reloadRes.body.ok, true);
      assert.equal(reloadRes.body.data.nextFixture.id, "fix-md-10");
      assert.equal(reloadRes.body.data.manager.seasonRecord.played, 9);
      assert.equal(reloadRes.body.data.manager.preferredFormation, "4-2-3-1 Gegenpress");
      assert.equal(reloadRes.body.data.homeTactics.pressingIntensity, "Gegenpress");
      assert.equal(reloadRes.body.data.homeTactics.mentality, "Attacking");
      assert.equal(reloadRes.body.data.simulationCount, 1);
    } finally {
      killProcessTree(restartedServer);
      await new Promise((r) => setTimeout(r, 1000));
    }
  });
});

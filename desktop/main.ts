import * as electron from "electron";
import { ChildProcess, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export const isElectronRuntime =
  typeof electron !== "string" &&
  typeof (electron as unknown as { app?: unknown }).app !== "undefined";

const app = isElectronRuntime ? electron.app : ({} as typeof electron.app);
const BrowserWindow = isElectronRuntime
  ? electron.BrowserWindow
  : ({} as typeof electron.BrowserWindow);
const dialog = isElectronRuntime ? electron.dialog : ({} as typeof electron.dialog);
const ipcMain = isElectronRuntime
  ? electron.ipcMain
  : ({
      handle: () => {},
      on: () => {},
    } as unknown as typeof electron.ipcMain);
const shell = isElectronRuntime ? electron.shell : ({} as typeof electron.shell);

let mainWindow: electron.BrowserWindow | null = null;
let nextServerProcess: ChildProcess | null = null;
let serverPort: number | null = null;
const serverLogs: string[] = [];
let isShuttingDown = false;

/**
 * Finds an available ephemeral loopback port on 127.0.0.1.
 */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      if (!address || typeof address === "string") {
        srv.close(() => reject(new Error("Unable to obtain loopback address")));
        return;
      }
      const port = address.port;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

/**
 * Resolves the project root directory whether running in development or compiled.
 */
export function getProjectRoot(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "package.json"))) {
    return cwd;
  }
  return path.resolve(__dirname, "..", "..");
}

/**
 * Resolves persistent SQLite database save path inside user data directory.
 */
export function getDesktopSavePath(): string {
  let userDataDir: string;
  if (isElectronRuntime && typeof app.getPath === "function") {
    userDataDir = app.getPath("userData");
  } else {
    // Platform-standard location for testing or CLI outside Electron window
    userDataDir =
      process.platform === "win32"
        ? path.join(
            process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
            "Football Manager"
          )
        : path.join(os.homedir(), "Library", "Application Support", "Football Manager");
  }

  const savesDir = path.join(userDataDir, "saves");
  if (!fs.existsSync(savesDir)) {
    fs.mkdirSync(savesDir, { recursive: true, mode: 0o755 });
  }
  return path.join(savesDir, "career.db");
}

/**
 * Generates an inline splash screen matching the game's emerald and dark navy aesthetic.
 */
function getSplashHtml(): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Football Manager 2026</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #060d1b;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
      user-select: none;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 12px;
      border-radius: 9999px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34d399;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 16px;
    }
    h1 {
      margin: 0 0 6px 0;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #f8fafc;
    }
    p {
      margin: 0 0 28px 0;
      font-size: 14px;
      color: #94a3b8;
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(16, 185, 129, 0.2);
      border-top-color: #10b981;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="badge">Northbridge Athletic FC</div>
  <h1>Football Manager 2026</h1>
  <p>Starting local match simulation &amp; tactics engine...</p>
  <div class="spinner"></div>
</body>
</html>
  `)}`;
}

/**
 * Polls the local server endpoint until it responds with HTTP 200.
 */
export function waitForServerHealthy(
  port: number,
  timeoutMs = 45000
): Promise<void> {
  const startTime = Date.now();
  const healthUrl = `http://127.0.0.1:${port}/api/club`;

  return new Promise((resolve, reject) => {
    function check() {
      if (isShuttingDown) {
        return reject(new Error("Application shutdown initiated during startup"));
      }

      const req = http.get(healthUrl, (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          resolve();
        } else {
          retry();
        }
      });

      req.on("error", () => {
        retry();
      });

      req.setTimeout(1500, () => {
        req.destroy();
        retry();
      });
    }

    function retry() {
      if (Date.now() - startTime > timeoutMs) {
        const errorDetail = serverLogs.slice(-15).join("\n") || "No output captured";
        reject(
          new Error(
            `Next.js server failed to respond at ${healthUrl} within ${timeoutMs / 1000}s.\n\nServer logs:\n${errorDetail}`
          )
        );
      } else {
        setTimeout(check, 300);
      }
    }

    check();
  });
}

/**
 * Cleanly terminates a child process and its process tree across macOS, Linux, and Windows.
 */
export function killProcessTree(child: ChildProcess | null): void {
  if (!child || child.killed || typeof child.pid !== "number") return;

  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      // Ignore secondary kill error
    }
  }
}

/**
 * Determines whether the desktop application should run against the standalone production server.
 */
export function isProductionDesktop(): boolean {
  if (process.env.DESKTOP_MODE === "production") return true;
  if (process.env.DESKTOP_MODE === "development") return false;
  if (process.env.NODE_ENV === "production") return true;
  if (isElectronRuntime && typeof app.isPackaged === "boolean" && app.isPackaged) return true;
  return false;
}

/**
 * Starts the production Next.js standalone server on an ephemeral loopback port using SQLite.
 */
export async function startNextStandaloneServer(
  projectRoot: string,
  port: number,
  savePath: string
): Promise<ChildProcess> {
  const standaloneDir = path.join(projectRoot, ".next", "standalone");
  const serverJs = path.join(standaloneDir, "server.js");

  if (!fs.existsSync(serverJs)) {
    throw new Error(
      `Cannot find Next.js standalone server at "${serverJs}".\nPlease build the application first by running "npm run build".`
    );
  }

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    DATABASE_DRIVER: "sqlite",
    SQLITE_DB_PATH: savePath,
    NODE_ENV: "production",
    ELECTRON_RUN_AS_NODE: "1",
  };

  const executable =
    isElectronRuntime && process.execPath.includes("Electron")
      ? process.execPath
      : process.execPath;

  const child = spawn(executable, [serverJs], {
    cwd: standaloneDir,
    env: childEnv,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (data: Buffer) => {
    const text = data.toString();
    serverLogs.push(text);
    if (serverLogs.length > 100) serverLogs.shift();
    process.stdout.write(`[Standalone Next.js] ${text}`);
  });

  child.stderr?.on("data", (data: Buffer) => {
    const text = data.toString();
    serverLogs.push(text);
    if (serverLogs.length > 100) serverLogs.shift();
    process.stderr.write(`[Standalone Next.js Error] ${text}`);
  });

  child.on("exit", (code, signal) => {
    if (!isShuttingDown) {
      console.error(
        `[Standalone Next.js] Server process exited unexpectedly with code ${code}, signal ${signal}.`
      );
    }
  });

  return child;
}

/**
 * Starts the Next.js development server on an ephemeral loopback port using SQLite.
 */
export async function startNextDevServer(
  projectRoot: string,
  port: number,
  savePath: string
): Promise<ChildProcess> {
  const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
  if (!fs.existsSync(nextBin)) {
    throw new Error(`Cannot find Next.js CLI binary at "${nextBin}".`);
  }

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    DATABASE_DRIVER: "sqlite",
    SQLITE_DB_PATH: savePath,
    NODE_ENV: "development",
    ELECTRON_RUN_AS_NODE: "1",
  };

  const executable =
    isElectronRuntime && process.execPath.includes("Electron")
      ? process.execPath
      : process.execPath;

  const child = spawn(
    executable,
    [nextBin, "dev", "-p", String(port), "-H", "127.0.0.1"],
    {
      cwd: projectRoot,
      env: childEnv,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  child.stdout?.on("data", (data: Buffer) => {
    const text = data.toString();
    serverLogs.push(text);
    if (serverLogs.length > 100) serverLogs.shift();
    process.stdout.write(`[Next.js] ${text}`);
  });

  child.stderr?.on("data", (data: Buffer) => {
    const text = data.toString();
    serverLogs.push(text);
    if (serverLogs.length > 100) serverLogs.shift();
    process.stderr.write(`[Next.js Error] ${text}`);
  });

  child.on("exit", (code, signal) => {
    if (!isShuttingDown) {
      console.error(
        `[Next.js] Server process exited unexpectedly with code ${code}, signal ${signal}.`
      );
    }
  });

  return child;
}

/**
 * Creates the primary application window with secure sandbox and navigation policies.
 */
function createMainWindow(): electron.BrowserWindow {
  const preloadPath = path.join(__dirname, "preload.js");

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: "#060d1b",
    title: "Northbridge Athletic FC | Football Manager 2026",
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Security: Restrict navigation to local loopback server
  win.webContents.on("will-navigate", (event, targetUrl) => {
    if (serverPort && !targetUrl.startsWith(`http://127.0.0.1:${serverPort}`)) {
      event.preventDefault();
      void shell.openExternal(targetUrl);
    }
  });

  // Security: Open all target="_blank" links in external browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("ready-to-show", () => {
    win.show();
  });

  win.on("closed", () => {
    mainWindow = null;
  });

  return win;
}

function cleanupChildServer() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  if (nextServerProcess) {
    console.log("[Electron] Stopping internal Next.js server...");
    killProcessTree(nextServerProcess);
    nextServerProcess = null;
  }
}

// Only register Electron application lifecycle and IPC when running in Electron runtime
if (isElectronRuntime) {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on("second-instance", () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });

    // IPC Handlers for window controls and version
    ipcMain.handle("app:get-version", () => app.getVersion());

    ipcMain.on("window:toggle-fullscreen", (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.setFullScreen(!win.isFullScreen());
      }
    });

    ipcMain.on("window:minimize", (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.minimize();
      }
    });

    ipcMain.on("window:close", (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.close();
      }
    });

    // App Lifecycle
    app.whenReady().then(async () => {
      app.name = "Football Manager 2026";
      mainWindow = createMainWindow();
      void mainWindow.loadURL(getSplashHtml());

      try {
        const projectRoot = getProjectRoot();
        const port = await getFreePort();
        serverPort = port;
        const savePath = getDesktopSavePath();

        console.log(`[Electron] Allocated ephemeral loopback port: ${port}`);
        console.log(`[Electron] SQLite desktop save path: ${savePath}`);

        const isProd = isProductionDesktop();
        console.log(
          `[Electron] Starting server in ${isProd ? "STANDALONE PRODUCTION" : "DEVELOPMENT"} mode`
        );
        if (isProd) {
          nextServerProcess = await startNextStandaloneServer(projectRoot, port, savePath);
        } else {
          nextServerProcess = await startNextDevServer(projectRoot, port, savePath);
        }

        await waitForServerHealthy(port);

        console.log(`[Electron] Next.js server ready at http://127.0.0.1:${port}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Electron] Fatal startup error:", msg);

        if (mainWindow && !mainWindow.isDestroyed()) {
          dialog.showErrorBox(
            "Football Manager 2026 — Startup Error",
            `Could not start the internal game server.\n\n${msg}`
          );
          mainWindow.close();
        }
        app.quit();
      }
    });

    app.on("before-quit", cleanupChildServer);
    app.on("window-all-closed", () => {
      cleanupChildServer();
      app.quit();
    });

    process.on("SIGINT", () => {
      cleanupChildServer();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      cleanupChildServer();
      process.exit(0);
    });

    process.on("exit", () => {
      cleanupChildServer();
    });
  }
}

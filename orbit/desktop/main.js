"use strict";

const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, Tray } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const apiSession = require("./api-session");
const builder = require("./builder-window");

app.setName("Orbit");

const COMPACT_SIZE = { width: 320, height: 350 };
const EXPANDED_SIZE = { width: 710, height: 350 };
const PANEL_SIZE = { width: 550, height: 350 };
const FULL_SIZE = { width: 940, height: 350 };
const DEFAULT_CONFIG_PATH = path.join(__dirname, "desktop-config.json");
let orbitWindow;
let orbitTray;
let expanded = false;
let panelOpen = false;
let scale = 1;
let dragSession;
let isQuitting = false;

function userDataPath(...segments) {
  return path.join(app.getPath("userData"), ...segments);
}

function appendLog(level, message, error) {
  try {
    const logDirectory = userDataPath("logs");
    fs.mkdirSync(logDirectory, { recursive: true });
    const detail = error?.stack || error?.message || error || "";
    const line = `${new Date().toISOString()} [${level}] ${message}${detail ? `\n${detail}` : ""}\n`;
    fs.appendFileSync(path.join(logDirectory, "orbit.log"), line, "utf8");
  } catch {}
}

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function settingsPath() {
  return userDataPath("settings.json");
}

function getConfig() {
  const defaults = readJson(DEFAULT_CONFIG_PATH);
  const preferences = readJson(settingsPath());
  return { launchAtStartup: false, ...defaults, ...preferences };
}

function savePreferences(nextPreferences) {
  const filePath = settingsPath();
  const preferences = { ...readJson(filePath), ...nextPreferences };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
  return preferences;
}

function setLaunchAtStartup(enabled) {
  const launchAtStartup = Boolean(enabled);
  const loginSettings = { openAtLogin: launchAtStartup, name: "Orbit" };
  if (!app.isPackaged) {
    loginSettings.path = process.execPath;
    loginSettings.args = [path.resolve(__dirname, "..")];
  }
  app.setLoginItemSettings(loginSettings);
  savePreferences({ launchAtStartup });
  return launchAtStartup;
}

function positionStatePath() {
  return userDataPath("orbit-window-state.json");
}

function loadSavedPosition() {
  const saved = readJson(positionStatePath(), null);
  return saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) ? saved : null;
}

function saveWindowPosition() {
  if (!orbitWindow || orbitWindow.isDestroyed()) return;
  const { x, y } = orbitWindow.getBounds();
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(positionStatePath(), JSON.stringify({ x, y }), "utf8");
  } catch (error) {
    appendLog("WARN", "Could not save the window position.", error);
  }
}

function clampPosition(x, y, size) {
  const display = screen.getDisplayNearestPoint({ x, y });
  const { workArea } = display;
  return {
    x: Math.min(workArea.x + workArea.width - size.width, Math.max(workArea.x, Math.round(x))),
    y: Math.min(workArea.y + workArea.height - size.height, Math.max(workArea.y, Math.round(y))),
  };
}

function scaledSize() {
  const size = expanded && panelOpen ? FULL_SIZE : expanded ? EXPANDED_SIZE : panelOpen ? PANEL_SIZE : COMPACT_SIZE;
  return {
    width: Math.round(size.width * scale),
    height: Math.round(size.height * scale),
  };
}

function getInitialBounds() {
  const workArea = screen.getPrimaryDisplay().workArea;
  const size = scaledSize();
  const saved = loadSavedPosition();
  if (saved) return { ...size, ...clampPosition(saved.x, saved.y, size) };
  return {
    ...size,
    x: workArea.x + workArea.width - size.width - 18,
    y: workArea.y + workArea.height - size.height - 18,
  };
}

function resizeWindow() {
  if (!orbitWindow || orbitWindow.isDestroyed()) return;
  const current = orbitWindow.getBounds();
  const next = scaledSize();
  orbitWindow.webContents.setZoomFactor(scale);
  const position = clampPosition(
    current.x + current.width - next.width,
    current.y + current.height - next.height,
    next,
  );
  orbitWindow.setBounds({ ...next, ...position }, true);
}

function showOrbit() {
  if (!orbitWindow || orbitWindow.isDestroyed()) {
    createWindow();
    return;
  }
  orbitWindow.show();
  orbitWindow.focus();
}

function restartOrbit() {
  isQuitting = true;
  app.relaunch();
  app.exit(0);
}

function iconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(__dirname, "..", "build", "icon.png");
}

function createTray() {
  if (orbitTray || !fs.existsSync(iconPath())) return;
  const image = nativeImage.createFromPath(iconPath()).resize({ width: 24, height: 24 });
  orbitTray = new Tray(image);
  orbitTray.setToolTip(`Orbit ${app.getVersion()}`);
  orbitTray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show Orbit", click: showOrbit },
    { label: "Hide Orbit", click: () => orbitWindow?.hide() },
    { type: "separator" },
    { label: "Restart Orbit", click: restartOrbit },
    { label: "Quit Orbit", click: () => app.quit() },
  ]));
  orbitTray.on("click", showOrbit);
}

function createWindow() {
  if (orbitWindow && !orbitWindow.isDestroyed()) return orbitWindow;
  orbitWindow = new BrowserWindow({
    ...getInitialBounds(),
    icon: iconPath(),
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  orbitWindow.setAlwaysOnTop(true, "floating");
  orbitWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  orbitWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  orbitWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  orbitWindow.webContents.on("render-process-gone", (_event, details) => {
    appendLog("ERROR", `Orbit's renderer stopped (${details.reason}).`);
  });
  orbitWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    orbitWindow.hide();
  });
  orbitWindow.on("closed", () => { orbitWindow = undefined; });
  orbitWindow.loadFile(path.join(__dirname, "desktop.html")).catch((error) => {
    appendLog("ERROR", "Orbit failed to load its desktop interface.", error);
    dialog.showErrorBox("Orbit could not start", `Orbit could not load its interface.\n\nLog: ${userDataPath("logs", "orbit.log")}`);
  });
  orbitWindow.once("ready-to-show", () => orbitWindow.showInactive());
  return orbitWindow;
}

function showDesktopMenu() {
  if (!orbitWindow) return;
  Menu.buildFromTemplate([
    { label: "Show Orbit", click: showOrbit },
    { label: "Hide Orbit", click: () => orbitWindow.hide() },
    {
      label: orbitWindow.isAlwaysOnTop() ? "Disable always on top" : "Keep always on top",
      click: () => orbitWindow.setAlwaysOnTop(!orbitWindow.isAlwaysOnTop(), "floating"),
    },
    { label: getConfig().launchAtStartup ? "Disable launch at login" : "Launch at login", click: () => setLaunchAtStartup(!getConfig().launchAtStartup) },
    { type: "separator" },
    { label: "Restart Orbit", click: restartOrbit },
    { label: "Quit Orbit", click: () => app.quit() },
  ]).popup({ window: orbitWindow });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  ipcMain.on("orbit:set-expanded", (_event, nextExpanded) => {
    expanded = Boolean(nextExpanded);
    resizeWindow();
  });
  ipcMain.on("orbit:set-panel-open", (_event, open) => {
    panelOpen = Boolean(open);
    resizeWindow();
  });
  ipcMain.on("orbit:set-scale", (_event, nextScale) => {
    scale = Math.min(1.5, Math.max(0.65, Number(nextScale) || 1));
    resizeWindow();
  });
  ipcMain.on("orbit:set-ignore-mouse", (_event, ignore) => orbitWindow?.setIgnoreMouseEvents(Boolean(ignore), { forward: true }));
  ipcMain.on("orbit:drag-start", (_event, point) => {
    if (orbitWindow && point) dragSession = { point, bounds: orbitWindow.getBounds() };
  });
  ipcMain.on("orbit:drag-move", (_event, point) => {
    if (!orbitWindow || !dragSession || !point) return;
    const size = orbitWindow.getBounds();
    const position = clampPosition(
      dragSession.bounds.x + point.x - dragSession.point.x,
      dragSession.bounds.y + point.y - dragSession.point.y,
      size,
    );
    orbitWindow.setPosition(position.x, position.y);
  });
  ipcMain.on("orbit:drag-end", () => {
    dragSession = null;
    saveWindowPosition();
  });
  ipcMain.on("orbit:quit", () => app.quit());
  ipcMain.on("orbit:show-menu", showDesktopMenu);
  ipcMain.handle("orbit:get-config", () => getConfig());
  ipcMain.handle("orbit:get-app-info", () => ({ version: app.getVersion(), userDataPath: app.getPath("userData") }));
  ipcMain.handle("orbit:set-launch-at-startup", (_event, enabled) => setLaunchAtStartup(enabled));
  // The renderer runs from file:// and has no session, so the main process
  // makes the authenticated calls on its behalf. Both handlers take only the
  // payload; the URLs come from config, never from the renderer.
  ipcMain.handle("orbit:speech-token", (_event, type) => {
    const config = getConfig();
    return apiSession.apiFetch(config.speechTokenUrl, {
      method: "POST",
      body: { type: type === "flow" ? "flow" : "rt" },
    });
  });
  ipcMain.handle("orbit:conversation", (_event, text) => {
    const config = getConfig();
    return apiSession.apiFetch(config.conversationUrl, {
      method: "POST",
      body: { text: String(text ?? "") },
    });
  });
  ipcMain.handle("orbit:tts", (_event, text, voice) => {
    const config = getConfig();
    return apiSession.fetchSpeech(config.ttsUrl, String(text ?? ""), String(voice ?? "sarah"));
  });
  ipcMain.handle("orbit:patch-build", (_event, url, status, error) =>
    apiSession.apiFetch(url, { method: "PATCH", body: error ? { status, error } : { status } }));
  // Health is read through the same session as everything else, so a green
  // glow means "signed in and every service answered", not merely "the server
  // is up". An indicator that lights regardless would be worse than none.
  ipcMain.handle("orbit:health", () => {
    const config = getConfig();
    const base = String(config.conversationUrl || "").replace(/\/api\/conversation\/?$/, "");
    return base ? apiSession.apiFetch(base + "/api/system/health") : { ok: false, status: 0 };
  });
  ipcMain.handle("orbit:sign-in", () => apiSession.openSignIn(getConfig()));
  ipcMain.handle("orbit:open-builder", () => {
    builder.openBuilderWindow(getConfig());
    return true;
  });
  ipcMain.handle("orbit:send-to-builder", async (_event, prompt) => {
    const result = await builder.sendPromptToBuilder(prompt, getConfig());
    if (!result.ok) appendLog("WARN", `Could not send the prompt to native.builder (${result.reason}).`);
    return result;
  });

  process.on("uncaughtException", (error) => appendLog("FATAL", "Uncaught main-process exception.", error));
  process.on("unhandledRejection", (error) => appendLog("ERROR", "Unhandled main-process rejection.", error));

  app.on("before-quit", () => { isQuitting = true; });
  app.on("second-instance", showOrbit);
  app.on("activate", showOrbit);
  app.on("window-all-closed", () => {});
  app.whenReady().then(() => {
    appendLog("INFO", `Orbit ${app.getVersion()} starting on ${process.platform}.`);
    const config = getConfig();
    if (config.launchAtStartup) setLaunchAtStartup(true);
    createWindow();
    createTray();
  }).catch((error) => {
    appendLog("FATAL", "Electron failed during startup.", error);
    dialog.showErrorBox("Orbit could not start", `Orbit encountered a startup error.\n\nLog: ${userDataPath("logs", "orbit.log")}`);
    app.exit(1);
  });
}

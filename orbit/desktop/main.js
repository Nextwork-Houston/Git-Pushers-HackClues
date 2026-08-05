"use strict";

const { app, BrowserWindow, ipcMain, Menu, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const COMPACT_SIZE = { width: 320, height: 350 };
const EXPANDED_SIZE = { width: 710, height: 350 };
const PANEL_SIZE = { width: 550, height: 350 };
const FULL_SIZE = { width: 940, height: 350 };
let orbitWindow;
let expanded = false;
let panelOpen = false;
let scale = 1;
let dragSession;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) app.quit();

function getConfig() {
  const configPath = path.join(__dirname, "desktop-config.json");
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

function positionStatePath() {
  return path.join(app.getPath("userData"), "orbit-window-state.json");
}

function loadSavedPosition() {
  try {
    const saved = JSON.parse(fs.readFileSync(positionStatePath(), "utf8"));
    return Number.isFinite(saved.x) && Number.isFinite(saved.y) ? saved : null;
  } catch {
    return null;
  }
}

function saveWindowPosition() {
  if (!orbitWindow || orbitWindow.isDestroyed()) return;
  const { x, y } = orbitWindow.getBounds();
  try { fs.writeFileSync(positionStatePath(), JSON.stringify({ x, y }), "utf8"); }
  catch {}
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

function setExpanded(nextExpanded) {
  expanded = nextExpanded;
  resizeWindow();
}

function setPanelOpen(nextPanelOpen) {
  panelOpen = nextPanelOpen;
  resizeWindow();
}

function setScale(nextScale) {
  scale = Math.min(1.5, Math.max(0.65, Number(nextScale) || 1));
  resizeWindow();
}

function createWindow() {
  orbitWindow = new BrowserWindow({
    ...getInitialBounds(),
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
  orbitWindow.loadFile(path.join(__dirname, "desktop.html"));
  orbitWindow.once("ready-to-show", () => orbitWindow.showInactive());
}

ipcMain.on("orbit:set-expanded", (_event, expanded) => setExpanded(Boolean(expanded)));
ipcMain.on("orbit:set-panel-open", (_event, open) => setPanelOpen(Boolean(open)));
ipcMain.on("orbit:set-scale", (_event, nextScale) => setScale(nextScale));
ipcMain.on("orbit:set-ignore-mouse", (_event, ignore) => {
  if (orbitWindow) orbitWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
});
ipcMain.on("orbit:drag-start", (_event, point) => {
  if (!orbitWindow || !point) return;
  dragSession = { point, bounds: orbitWindow.getBounds() };
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
ipcMain.handle("orbit:get-config", () => getConfig());
ipcMain.on("orbit:show-menu", () => {
  if (!orbitWindow) return;
  const menu = Menu.buildFromTemplate([
    {
      label: orbitWindow.isAlwaysOnTop() ? "Disable always on top" : "Keep always on top",
      click: () => orbitWindow.setAlwaysOnTop(!orbitWindow.isAlwaysOnTop(), "floating"),
    },
    { label: "Restart Orbit", click: () => orbitWindow.reload() },
    { type: "separator" },
    { label: "Quit Orbit", click: () => app.quit() },
  ]);
  menu.popup({ window: orbitWindow });
});

app.whenReady().then(createWindow);
app.on("second-instance", () => {
  if (!orbitWindow) return;
  if (!orbitWindow.isVisible()) orbitWindow.show();
  orbitWindow.focus();
});
app.on("window-all-closed", () => app.quit());

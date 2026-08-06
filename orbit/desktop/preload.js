"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("orbitDesktop", {
  getConfig: () => ipcRenderer.invoke("orbit:get-config"),
  getAppInfo: () => ipcRenderer.invoke("orbit:get-app-info"),
  setLaunchAtStartup: (enabled) => ipcRenderer.invoke("orbit:set-launch-at-startup", Boolean(enabled)),
  setExpanded: (expanded) => ipcRenderer.send("orbit:set-expanded", Boolean(expanded)),
  setPanelOpen: (open) => ipcRenderer.send("orbit:set-panel-open", Boolean(open)),
  setScale: (scale) => ipcRenderer.send("orbit:set-scale", Number(scale)),
  setIgnoreMouse: (ignore) => ipcRenderer.send("orbit:set-ignore-mouse", Boolean(ignore)),
  startDrag: (x, y) => ipcRenderer.send("orbit:drag-start", { x, y }),
  dragTo: (x, y) => ipcRenderer.send("orbit:drag-move", { x, y }),
  endDrag: () => ipcRenderer.send("orbit:drag-end"),
  showMenu: () => ipcRenderer.send("orbit:show-menu"),
  quit: () => ipcRenderer.send("orbit:quit"),
});

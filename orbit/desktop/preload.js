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
  speechToken: (type) => ipcRenderer.invoke("orbit:speech-token", String(type ?? "rt")),
  conversation: (text) => ipcRenderer.invoke("orbit:conversation", String(text ?? "")),
  tts: (text, voice) => ipcRenderer.invoke("orbit:tts", String(text ?? ""), String(voice ?? "sarah")),
  patchBuild: (url, status, error) => ipcRenderer.invoke("orbit:patch-build", String(url), String(status), error ? String(error) : undefined),
  health: () => ipcRenderer.invoke("orbit:health"),
  guest: () => ipcRenderer.invoke("orbit:guest"),
  scaffold: (url, buildId) => ipcRenderer.invoke("orbit:scaffold", String(url), String(buildId)),
  signIn: () => ipcRenderer.invoke("orbit:sign-in"),
  openBuilder: () => ipcRenderer.invoke("orbit:open-builder"),
  sendToBuilder: (prompt) => ipcRenderer.invoke("orbit:send-to-builder", String(prompt ?? "")),
  showMenu: () => ipcRenderer.send("orbit:show-menu"),
  quit: () => ipcRenderer.send("orbit:quit"),
});

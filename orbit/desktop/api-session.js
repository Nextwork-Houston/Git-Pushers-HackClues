"use strict";

/**
 * Authenticated access to the Orbit backend from the desktop shell.
 *
 * The renderer is loaded from `file://`, so it has no origin the backend
 * recognises and no Supabase session cookie. Fetching from there would always
 * be unauthenticated, and cross-site cookies would be blocked anyway because
 * Supabase sets its auth cookies SameSite=Lax.
 *
 * So the main process makes the calls instead. It owns a persistent session
 * partition with a real cookie jar, signs in through a normal browser window
 * on that same partition, and exposes only two narrow operations over IPC.
 * The renderer never sees the cookie.
 */

const { BrowserWindow, net, session, shell } = require("electron");

/** Shared by the sign-in window and every API call, so cookies are common. */
const SESSION_PARTITION = "persist:orbit-account";
const SIGN_IN_WINDOW_SIZE = { width: 520, height: 720 };
const REQUEST_TIMEOUT_MS = 30000;

let signInWindow;

function apiSession() {
  return session.fromPartition(SESSION_PARTITION);
}

function baseOrigin(config) {
  const source = (config && (config.conversationUrl || config.speechTokenUrl)) || "";

  try {
    return new URL(source).origin;
  } catch {
    return null;
  }
}

/**
 * Calls the backend with the desktop's stored session.
 *
 * Returns a plain object rather than a Response because the result crosses an
 * IPC boundary, where a Response cannot be structured-cloned.
 */
async function apiFetch(url, options) {
  const settings = options || {};

  if (!url) return { ok: false, status: 0, error: "No URL configured." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await net.fetch(url, {
      method: settings.method || "GET",
      headers: { "Content-Type": "application/json", ...(settings.headers || {}) },
      body: settings.body === undefined ? undefined : JSON.stringify(settings.body),
      session: apiSession(),
      credentials: "include",
      signal: controller.signal,
    });

    const text = await response.text();
    let data;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Opens the hosted sign-in page.
 *
 * Resolves once the window closes, so the caller can retry whatever was
 * rejected. It cannot tell whether sign-in succeeded — the retry does that.
 */
async function openSignIn(config) {
  const origin = baseOrigin(config);

  if (!origin) return { ok: false, reason: "no-backend-configured" };

  if (signInWindow && !signInWindow.isDestroyed()) {
    signInWindow.show();
    signInWindow.focus();
    return { ok: true, reason: "already-open" };
  }

  signInWindow = new BrowserWindow({
    ...SIGN_IN_WINDOW_SIZE,
    title: "Sign in to Orbit",
    backgroundColor: "#1b1424",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: SESSION_PARTITION,
    },
  });

  signInWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });

  signInWindow.once("ready-to-show", () => signInWindow.show());
  signInWindow.loadURL(`${origin}/login`);

  return new Promise((resolve) => {
    // Reaching the companion means sign-in worked; close and get out of the way.
    signInWindow.webContents.on("did-navigate", (_event, url) => {
      if (url.startsWith(`${origin}/companion`)) signInWindow.close();
    });

    signInWindow.on("closed", () => {
      signInWindow = undefined;
      resolve({ ok: true, reason: "closed" });
    });
  });
}

/**
 * Fetches synthesised speech as raw bytes.
 *
 * Kept separate from apiFetch because the response is audio, not JSON, and an
 * ArrayBuffer survives the IPC structured clone that a Response would not.
 */
async function fetchSpeech(url, text, voice) {
  if (!url) return { ok: false, status: 0, error: "No speech URL configured." };

  try {
    const response = await net.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
      session: apiSession(),
      credentials: "include",
    });

    if (!response.ok) return { ok: false, status: response.status };

    const audio = await response.arrayBuffer();
    return { ok: true, status: response.status, audio };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  }
}

async function isSignedIn(config) {
  const origin = baseOrigin(config);

  if (!origin) return false;

  const result = await apiFetch(`${origin}/api/speech/token`, {
    method: "POST",
    body: { type: "rt" },
  });

  return result.status !== 401
}

module.exports = { apiFetch, fetchSpeech, isSignedIn, openSignIn, SESSION_PARTITION };

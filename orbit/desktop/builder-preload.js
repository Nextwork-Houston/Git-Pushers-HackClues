"use strict";

/**
 * Preload for the native.builder window.
 *
 * Deliberately exposes nothing. Roisin drives that page through
 * `webContents.executeJavaScript` from the main process, which means the
 * third-party page has no bridge back into Orbit and cannot reach Electron,
 * Node, or the user's Speechmatics and Supabase sessions.
 */

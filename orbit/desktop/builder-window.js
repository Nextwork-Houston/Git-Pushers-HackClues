"use strict";

/**
 * Hosts native.builder so Roisin can act inside it.
 *
 * native.builder has no public API — it is a chat-driven web product — so the
 * only way to "do everything through the product" is to drive its own
 * interface. This module opens it in a normal, visible window using a
 * persistent session partition, so the user signs in once with their own
 * account and stays signed in.
 *
 * Everything Roisin does here is something the user could do by typing. The
 * window stays visible on purpose: automation the user cannot see is
 * automation the user cannot stop.
 */

const { BrowserWindow, shell } = require("electron");
const path = require("node:path");

const DEFAULT_BUILDER_URL = "https://builder.nativelyai.com";
/** Keeps the user's native.builder login across restarts. */
const SESSION_PARTITION = "persist:native-builder";
const WINDOW_SIZE = { width: 1280, height: 860 };

let builderWindow;

function allowedOrigin(builderUrl) {
  try {
    return new URL(builderUrl).origin;
  } catch {
    return new URL(DEFAULT_BUILDER_URL).origin;
  }
}

/**
 * Opens the builder window, or focuses it if it is already open.
 */
function openBuilderWindow(config) {
  const builderUrl = (config && config.builderUrl) || DEFAULT_BUILDER_URL;

  if (builderWindow && !builderWindow.isDestroyed()) {
    builderWindow.show();
    builderWindow.focus();
    return builderWindow;
  }

  builderWindow = new BrowserWindow({
    ...WINDOW_SIZE,
    title: "native.builder",
    backgroundColor: "#101014",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "builder-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: SESSION_PARTITION,
    },
  });

  const origin = allowedOrigin(builderUrl);

  // Sign-in flows legitimately leave the origin, so navigation is allowed but
  // anything opening a new window goes to the system browser instead.
  builderWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });

  builderWindow.on("closed", () => {
    builderWindow = undefined;
  });

  builderWindow.once("ready-to-show", () => builderWindow.show());
  builderWindow.loadURL(builderUrl);

  builderWindow.currentOrigin = origin;

  return builderWindow;
}

function isBuilderOpen() {
  return Boolean(builderWindow && !builderWindow.isDestroyed());
}

/**
 * Serialises a value into a JavaScript source literal.
 *
 * The prompt is user speech being spliced into a script that runs inside a
 * third-party page, so `<` and the Unicode line separators are escaped on top
 * of JSON's own quoting. JSON.stringify alone leaves `</script>` and U+2028
 * intact, and both can terminate the surrounding context early.
 */
/** Characters that can terminate the surrounding script context early. */
const UNSAFE_SOURCE_CHARACTERS = new RegExp("[<>\\u2028\\u2029]", "g")

function literal(value) {
  return JSON.stringify(value).replace(UNSAFE_SOURCE_CHARACTERS, (character) =>
    "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

/**
 * Builds the script that types a prompt into native.builder's chat box.
 *
 * Selectors are configurable because this drives someone else's interface and
 * their markup will change. The heuristic fallback looks for the largest
 * visible text input, which is what a chat composer is.
 */
function injectionScript(prompt, selectors) {
  const config = {
    input: (selectors && selectors.input) || "",
    send: (selectors && selectors.send) || "",
  };

  return `(() => {
    const PROMPT = ${literal(prompt)};
    const CONFIG = ${literal(config)};

    function visible(element) {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 16) return false;
      const style = getComputedStyle(element);
      return style.visibility !== "hidden" && style.display !== "none";
    }

    function findComposer() {
      if (CONFIG.input) {
        const configured = document.querySelector(CONFIG.input);
        if (visible(configured)) return configured;
      }

      const candidates = [
        ...document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]'),
      ].filter(visible);

      if (!candidates.length) return null;

      // The composer is the biggest visible text surface on the page.
      return candidates.sort((a, b) => {
        const areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
        const areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
        return areaB - areaA;
      })[0];
    }

    function setValue(element, value) {
      element.focus();

      if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
        // React tracks the last value on the DOM node, so assigning .value
        // directly is ignored. The native setter bypasses that.
        const prototype = Object.getPrototypeOf(element);
        const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
        if (descriptor && descriptor.set) descriptor.set.call(element, value);
        else element.value = value;
      } else {
        element.textContent = value;
      }

      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function findSendButton(composer) {
      if (CONFIG.send) {
        const configured = document.querySelector(CONFIG.send);
        if (visible(configured)) return configured;
      }

      const form = composer.closest("form");
      if (form) {
        const submit = form.querySelector('button[type="submit"]:not([disabled])');
        if (visible(submit)) return submit;
      }

      const labelled = [...document.querySelectorAll("button:not([disabled])")].filter((button) => {
        const label = ((button.getAttribute("aria-label") || "") + " " + button.textContent).toLowerCase();
        return visible(button) && /send|submit|build|go\\b/.test(label);
      });

      return labelled[0] || null;
    }

    const composer = findComposer();
    if (!composer) return { ok: false, reason: "no-composer" };

    setValue(composer, PROMPT);

    const button = findSendButton(composer);
    if (button) {
      button.click();
      return { ok: true, method: "button" };
    }

    // Most chat composers submit on a bare Enter.
    const enter = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
    composer.dispatchEvent(new KeyboardEvent("keydown", enter));
    composer.dispatchEvent(new KeyboardEvent("keypress", enter));
    composer.dispatchEvent(new KeyboardEvent("keyup", enter));

    return { ok: true, method: "enter" };
  })();`;
}

/**
 * Types a prompt into native.builder and submits it.
 *
 * Resolves with a result object rather than throwing so the caller can tell
 * Roisin what happened and she can say it out loud.
 */
async function sendPromptToBuilder(prompt, config) {
  const text = String(prompt || "").trim();

  if (!text) return { ok: false, reason: "empty-prompt" };

  const window = openBuilderWindow(config);

  if (window.webContents.isLoading()) {
    await new Promise((resolve) => {
      const done = () => resolve();
      window.webContents.once("did-finish-load", done);
      setTimeout(done, 15000);
    });
  }

  try {
    const result = await window.webContents.executeJavaScript(
      injectionScript(text, config && config.builderSelectors),
      true,
    );

    if (!result || !result.ok) {
      return {
        ok: false,
        reason: (result && result.reason) || "injection-failed",
      };
    }

    window.show();
    window.focus();
    return result;
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

module.exports = {
  DEFAULT_BUILDER_URL,
  injectionScript,
  isBuilderOpen,
  openBuilderWindow,
  sendPromptToBuilder,
};

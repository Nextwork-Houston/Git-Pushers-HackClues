"use strict";

const orbit = document.querySelector("#orbit");
const desktopShell = document.querySelector(".desktop-shell");
let speechBridge = null;
let voice = null;
let recognitionActive = false;
let config = {};
let orbitScale = Number(localStorage.getItem("orbit-desktop-scale")) || 1;
let dragged = false;
let suppressActivation = false;
let aliveRestartTimer;

function startAliveMode() {
  if (config.aliveMode === false || recognitionActive || orbit.waiting) return;
  orbit.startWaiting({
    ambient: true,
    interval: Number(config.aliveInterval) || 3200,
  });
}

function pauseAliveMode() {
  clearTimeout(aliveRestartTimer);
  if (orbit.waiting && orbit.ambient) orbit.stopWaiting({ state: null });
  clearTimeout(aliveRestartTimer);
}

function scheduleAliveMode(delay = 1800) {
  clearTimeout(aliveRestartTimer);
  aliveRestartTimer = setTimeout(() => {
    if (!recognitionActive && !orbit.waiting) startAliveMode();
  }, delay);
}

function transcriptText(message) {
  return message?.detail?.text ?? message?.detail?.transcript ?? "";
}

/**
 * Sends a finished transcript to Roisin's backend and acts on what she says.
 *
 * When she returns a builderPrompt, the main process types it into the
 * native.builder window on the user's behalf. That window is visible, so the
 * user always sees what was sent.
 */
async function sendConversation(text) {
  if (!config.conversationUrl) {
    orbit.addMessage(
      "I am not connected to a backend yet. Set conversationUrl in desktop-config.json.",
      "assistant",
    );
    return;
  }

  pauseAliveMode();
  orbit.startWaiting({ openChat: true });

  try {
    // The main process holds the session; the renderer has no cookie jar.
    const outcome = await window.orbitDesktop.conversation(text);

    if (outcome.status === 401) {
      orbit.stopWaiting({ state: null });
      orbit.addMessage("Sign in and I can start building for you.", "assistant");
      await window.orbitDesktop.signIn();
      return;
    }

    const result = outcome.data || {};

    if (!outcome.ok) {
      throw new Error(result.error || outcome.error || `Backend returned ${outcome.status}.`);
    }

    const reply = result.reply || result.message || result.text;
    orbit.stopWaiting({ state: "speaking" });

    if (reply) {
      orbit.addMessage(reply, "assistant");
      if (voice) voice.speak(reply);
    }

    if (result.builderPrompt) {
      const delivered = await deliverToBuilder(result.builderPrompt);
      // Only the shell knows whether native.builder accepted it, so it is the
      // only place that can resolve the build from "pending".
      if (result.buildId) {
        reportBuildStatus(result.buildId, delivered);
        scaffoldSpec(result.buildId);
      }
    }

    setTimeout(() => {
      orbit.setState("idle");
      scheduleAliveMode(500);
    }, 900);
  } catch (error) {
    orbit.stopWaiting({ state: null });
    orbit.playAction("tantrum", { duration: 1600 });
    orbit.addMessage(error.message, "assistant");
    scheduleAliveMode(1800);
  }
}

/** Commits the build as a spec, so it outlives the voice session. */
function scaffoldSpec(buildId) {
  if (!config.conversationUrl) return;
  const base = config.conversationUrl.replace(/\/api\/conversation\/?$/, "");
  window.orbitDesktop
    .scaffold(base + "/api/github/scaffold", buildId)
    .then((outcome) => {
      const url = outcome && outcome.data && outcome.data.commit && outcome.data.commit.url;
      if (url) orbit.addMessage("I wrote the spec to GitHub: " + url, "assistant");
    })
    .catch(() => {});
}

function reportBuildStatus(buildId, delivered, reason) {
  if (!config.conversationUrl) return;

  const base = config.conversationUrl.replace(/\/api\/conversation\/?$/, '');
  window.orbitDesktop
    .patchBuild(base + '/api/builds/' + buildId, delivered ? 'sent' : 'failed', reason)
    .catch(() => {});
}

async function deliverToBuilder(prompt) {
  if (!window.orbitDesktop.sendToBuilder) return false;

  // "dance", not "celebrate" — celebrate is a mood the model returns, not an
  // animation the sprite sheets have. An unknown name silently falls back to
  // idle, so she would have stood still at the best moment in the demo.
  orbit.playAction("dance", { duration: 1800 });
  const outcome = await window.orbitDesktop.sendToBuilder(prompt);

  if (outcome && outcome.ok) {
    orbit.addMessage("Sent it to native.builder. Watch it work.", "assistant");
    orbit.playAction("laugh", { duration: 1600 });
    refreshConnection();
    return true;
  }

  const reason = outcome && outcome.reason === "no-composer"
    ? "I could not find the chat box on native.builder. Sign in there first, then ask me again."
    : "I could not hand that to native.builder, so here it is to paste in yourself.";

  orbit.addMessage(reason, "assistant");
  orbit.addMessage(prompt, "assistant");
  return false;
}

/**
 * Starts listening through Speechmatics.
 *
 * The bridge picks its own transport — Flow, then Realtime, then the browser
 * engine — and emits the same `speechmatics.*` events whichever one wins, so
 * nothing below needs to know which is live.
 */
async function startListening() {
  // Already live — a second call would open a second microphone.
  if (speechBridge) return;

  pauseAliveMode();
  orbit.openChat();
  orbit.setState("listening");
  orbit.setListening(true);
  recognitionActive = true;

  if (!window.OrbitSpeechBridge) {
    orbit.addMessage("My speech bridge did not load. Restart me and try again.", "assistant");
    return;
  }

  // Take a guest account rather than demanding a form. Roisin cannot hear
  // without a session, and "just talk to me" should not begin with a login.
  await window.orbitDesktop.guest().catch(() => {});

  speechBridge = new window.OrbitSpeechBridge({
    // The token is fetched by the main process, which has the session.
    getToken: async (type) => {
      const outcome = await window.orbitDesktop.speechToken(type);

      if (outcome.status === 401) {
        await window.orbitDesktop.signIn();
        throw new Error("Sign in to use Speechmatics.");
      }

      if (!outcome.ok) {
        throw new Error((outcome.data && outcome.data.error) || "Could not get a speech token.");
      }

      return outcome.data;
    },
    language: (config.language || "en-US").split("-")[0],
    // Flow speaks its own replies, which would talk over the backend's, so
    // the desktop shell uses transcription only.
    preferFlow: false,
    allowBrowserFallback: config.browserSpeechFallback !== false,
  });

  try {
    await speechBridge.start();
  } catch (error) {
    speechBridge = null;
    recognitionActive = false;
    orbit.setListening(false);

    // Electron ships no Web Speech API, so unlike the browser there is no
    // silent fallback here: without a session she genuinely cannot hear.
    // Saying so, and opening sign-in, beats standing there looking broken.
    orbit.openChat();
    orbit.addMessage(`I could not start listening: ${error.message}`, "assistant");
    orbit.addMessage("Sign in and I will be able to hear you.", "assistant");
    window.orbitDesktop.signIn().then(refreshConnection).catch(() => {});
    orbit.setState("idle");
    scheduleAliveMode();
  }
}

function stopListening() {
  recognitionActive = false;
  if (speechBridge) {
    speechBridge.stop();
    speechBridge = null;
  }
  orbit.setListening(false);
  orbit.setState("idle");
  scheduleAliveMode();
}

window.addEventListener("speechmatics.partial", (event) => {
  orbit.setTranscript(transcriptText(event), { role: "user" });
});

window.addEventListener("speechmatics.final", (event) => {
  const text = transcriptText(event);
  if (!text) return;
  orbit.setTranscript(text, { final: true, role: "user" });
  sendConversation(text);
});

window.addEventListener("speech.error", (event) => {
  orbit.addMessage(`Speech problem: ${event.detail.message}`, "assistant");
});

orbit.addEventListener("avatar-activate", () => {
  window.orbitDesktop.setExpanded(true);
  startListening();
});

orbit.addEventListener("avatar-chat-change", (event) => {
  window.orbitDesktop.setExpanded(event.detail.open);
  if (!event.detail.open) stopListening();
});

orbit.addEventListener("avatar-menu-change", (event) => {
  window.orbitDesktop.setPanelOpen(event.detail.open);
});

orbit.addEventListener("speech-toggle-request", (event) => {
  if (event.detail.active) startListening();
  else stopListening();
});

window.addEventListener("speech.end", () => {
  recognitionActive = false;
  orbit.setListening(false);
});

window.addEventListener("speech.error", () => {
  recognitionActive = false;
  orbit.setListening(false);
});

// Actions marked with a desktopAction are handled here rather than being sent
// as HTTP requests, so the menu can drive the shell itself.
orbit.addEventListener("avatar-action", (event) => {
  const action = event.detail.action;
  if (!action || action.desktopAction !== "open-builder") return;

  event.preventDefault();
  orbit.toggleMenu(false);
  window.orbitDesktop.openBuilder();
  orbit.addMessage("native.builder is open. Tell me what to build.", "assistant");
});

orbit.addEventListener("avatar-size-request", (event) => updateScale(orbitScale + event.detail.step * 0.1));
orbit.addEventListener("avatar-desktop-menu-request", () => window.orbitDesktop.showMenu());

// Right-click anywhere on her opens the desktop menu, which is where Quit
// lives. The window is frameless, so without this there is no visible way to
// close her.
document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  window.orbitDesktop.showMenu();
});

/**
 * Reflects whether the whole stack is actually reachable.
 *
 * Green only when signed in and every service reported configured. Anything
 * less is amber or red, because a light that is always green is not an
 * indicator, it is decoration.
 */
async function refreshConnection() {
  if (!config.conversationUrl) {
    orbit.setConnection("offline", { detail: "No backend configured." });
    return;
  }

  orbit.setConnection("checking");

  try {
    const outcome = await window.orbitDesktop.health();

    if (outcome.status === 401) {
      orbit.setConnection("degraded", { detail: "Signed out." });
      return;
    }

    if (!outcome.ok || !outcome.data) {
      orbit.setConnection("offline", { detail: "Backend unreachable." });
      return;
    }

    const missing = outcome.data.missing || [];
    orbit.setConnection(missing.length === 0 ? "online" : "degraded", {
      detail: missing.length ? `Not configured: ${missing.join(", ")}` : "All services online.",
    });
  } catch {
    orbit.setConnection("offline", { detail: "Backend unreachable." });
  }
}

/** Re-checked periodically so a service dropping out is visible. */
const CONNECTION_POLL_MS = 60000;
orbit.addEventListener("avatar-waiting-stop", () => scheduleAliveMode());

function updateScale(nextScale) {
  orbitScale = Math.min(1.5, Math.max(0.65, Math.round(nextScale * 10) / 10));
  localStorage.setItem("orbit-desktop-scale", String(orbitScale));
  window.orbitDesktop.setScale(orbitScale);
}

function enableDirectDragging() {
  const sprite = orbit.shadowRoot.querySelector(".sprite");
  let startPoint;
  let pointerId;

  const finishDrag = () => {
    if (!startPoint) return;
    if (pointerId !== undefined && sprite.hasPointerCapture(pointerId)) sprite.releasePointerCapture(pointerId);
    suppressActivation = dragged;
    startPoint = null;
    pointerId = undefined;
    window.orbitDesktop.endDrag();
    desktopShell.dataset.dragging = "false";
    if (dragged) orbit.setState("idle");
    dragged = false;
    scheduleAliveMode();
  };

  sprite.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pauseAliveMode();
    startPoint = { x: event.screenX, y: event.screenY };
    pointerId = event.pointerId;
    dragged = false;
    suppressActivation = false;
    window.orbitDesktop.setIgnoreMouse(false);
    sprite.setPointerCapture(event.pointerId);
    window.orbitDesktop.startDrag(event.screenX, event.screenY);
  });
  sprite.addEventListener("pointermove", (event) => {
    if (!startPoint) return;
    if (!dragged && Math.hypot(event.screenX - startPoint.x, event.screenY - startPoint.y) > 5) {
      dragged = true;
      desktopShell.dataset.dragging = "true";
      orbit.setState("skipping");
    }
    if (dragged) window.orbitDesktop.dragTo(event.screenX, event.screenY);
  });
  sprite.addEventListener("pointerup", finishDrag);
  sprite.addEventListener("pointercancel", finishDrag);
  sprite.addEventListener("click", (event) => {
    if (!suppressActivation) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressActivation = false;
  }, true);
}

function enableTransparentClickThrough() {
  const selectors = [".chat", ".menu-toggle", ".skin-toggle", ".speech-toggle", ".action-menu", ".skin-picker"];
  let ignored;

  const containsPoint = (element, x, y) => {
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.pointerEvents === "none" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  };

  const glowContainsPoint = (x, y) => {
    const aura = orbit.shadowRoot.querySelector(".aura");
    const rect = aura.getBoundingClientRect();
    const radiusX = rect.width / 2;
    const radiusY = rect.height / 2;
    const normalizedX = (x - (rect.left + radiusX)) / radiusX;
    const normalizedY = (y - (rect.top + radiusY)) / radiusY;
    return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
  };

  document.addEventListener("mousemove", (event) => {
    const elements = selectors.map((selector) => orbit.shadowRoot.querySelector(selector)).filter(Boolean);
    const interactive = dragged || glowContainsPoint(event.clientX, event.clientY)
      || elements.some((element) => containsPoint(element, event.clientX, event.clientY));
    if (ignored === !interactive) return;
    ignored = !interactive;
    window.orbitDesktop.setIgnoreMouse(ignored);
  });
}

window.orbitDesktop.getConfig().then((loadedConfig) => {
  config = loadedConfig || {};
  if (config.skin && !orbit.hasAttribute("skin")) orbit.setSkin(config.skin, { persist: false });
  orbit.actions = Array.isArray(config.actions) ? config.actions : [];

  if (window.OrbitVoice) {
    voice = new window.OrbitVoice({
      enabled: config.voiceReplies !== false,
      skin: orbit.skin,
      // Tunable in desktop-config.json without rebuilding the app.
      rate: config.voiceRate,
      // Synthesis runs through the main process, which holds the session.
      fetchAudio: async (text, voiceId) => {
        const outcome = await window.orbitDesktop.tts(text, voiceId);
        if (!outcome.ok) throw new Error(outcome.error || `Speech failed (${outcome.status}).`);
        return outcome.audio;
      },
    });

    // Each avatar keeps its own voice, so switching skin switches speaker.
    orbit.addEventListener("avatar-skin-change", (event) => voice.setSkin(event.detail.skin));
  }

  updateScale(orbitScale);
  enableDirectDragging();
  enableTransparentClickThrough();
  startAliveMode();

  refreshConnection();
  setInterval(refreshConnection, CONNECTION_POLL_MS);
});

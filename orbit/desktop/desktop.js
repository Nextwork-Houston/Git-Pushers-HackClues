"use strict";

const orbit = document.querySelector("#orbit");
const desktopShell = document.querySelector(".desktop-shell");
let recognition;
let recognitionActive = false;
let config = {};
let speechBridgePromptShown = false;
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

async function sendConversation(text) {
  if (!config.conversationUrl) return;
  pauseAliveMode();
  orbit.startWaiting({ openChat: true });
  try {
    const response = await fetch(config.conversationUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error(`Conversation backend returned ${response.status}.`);
    const result = await response.json();
    const reply = result.reply || result.message || result.text;
    orbit.stopWaiting({ state: "speaking" });
    if (reply) orbit.addMessage(reply, "assistant");
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

function setupBrowserSpeech() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return null;
  const engine = new Recognition();
  engine.continuous = true;
  engine.interimResults = true;
  engine.lang = config.language || "en-US";
  engine.onresult = (event) => {
    let partial = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = result[0]?.transcript || "";
      if (result.isFinal) {
        orbit.setTranscript(text, { final: true, role: "user" });
        sendConversation(text);
      } else partial += text;
    }
    if (partial) orbit.setTranscript(partial, { role: "user" });
  };
  engine.onerror = (event) => {
    if (event.error !== "aborted") orbit.addMessage(`Microphone error: ${event.error}.`, "assistant");
  };
  engine.onend = () => {
    if (recognitionActive) {
      try { engine.start(); }
      catch {}
    }
  };
  return engine;
}

function startListening() {
  pauseAliveMode();
  orbit.openChat();
  orbit.setState("listening");
  recognitionActive = true;
  if (!recognition) {
    if (!speechBridgePromptShown) {
      orbit.addMessage("I’m listening. Your Speechmatics connection can send transcripts now.", "assistant");
      speechBridgePromptShown = true;
    }
    return;
  }
  try { recognition.start(); }
  catch {}
}

function stopListening() {
  recognitionActive = false;
  if (recognition) recognition.stop();
  orbit.setState("idle");
  scheduleAliveMode();
}

window.addEventListener("speechmatics.partial", (event) => {
  orbit.setTranscript(transcriptText(event), { role: "user" });
});

window.addEventListener("speechmatics.final", (event) => {
  const text = transcriptText(event);
  orbit.setTranscript(text, { final: true, role: "user" });
  sendConversation(text);
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
  if (!event.detail.active) stopListening();
});

orbit.addEventListener("avatar-size-request", (event) => updateScale(orbitScale + event.detail.step * 0.1));
orbit.addEventListener("avatar-desktop-menu-request", () => window.orbitDesktop.showMenu());
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
  recognition = config.browserSpeechFallback ? setupBrowserSpeech() : null;
  updateScale(orbitScale);
  enableDirectDragging();
  enableTransparentClickThrough();
  startAliveMode();
});

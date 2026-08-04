"use strict";

const orbit = document.querySelector("#orbit");
const desktopMenu = document.querySelector("#desktop-menu");
const sizeDown = document.querySelector("#size-down");
const sizeUp = document.querySelector("#size-up");
let recognition;
let recognitionActive = false;
let config = {};
let speechBridgePromptShown = false;
let orbitScale = Number(localStorage.getItem("orbit-desktop-scale")) || 1;
let dragged = false;

function transcriptText(message) {
  return message?.detail?.text ?? message?.detail?.transcript ?? "";
}

async function sendConversation(text) {
  if (!config.conversationUrl) return;
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
    setTimeout(() => orbit.setState("idle"), 900);
  } catch (error) {
    orbit.stopWaiting({ state: null });
    orbit.playAction("tantrum", { duration: 1600 });
    orbit.addMessage(error.message, "assistant");
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

orbit.addEventListener("speech-toggle-request", (event) => {
  if (!event.detail.active) stopListening();
});

desktopMenu.addEventListener("click", () => window.orbitDesktop.showMenu());
sizeDown.addEventListener("click", () => updateScale(orbitScale - 0.1));
sizeUp.addEventListener("click", () => updateScale(orbitScale + 0.1));

function updateScale(nextScale) {
  orbitScale = Math.min(1.5, Math.max(0.65, Math.round(nextScale * 10) / 10));
  localStorage.setItem("orbit-desktop-scale", String(orbitScale));
  window.orbitDesktop.setScale(orbitScale);
}

function enableDirectDragging() {
  const sprite = orbit.shadowRoot.querySelector(".sprite");
  let startPoint;
  sprite.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    startPoint = { x: event.screenX, y: event.screenY };
    dragged = false;
    sprite.setPointerCapture(event.pointerId);
    window.orbitDesktop.startDrag(event.screenX, event.screenY);
  });
  sprite.addEventListener("pointermove", (event) => {
    if (!startPoint) return;
    if (Math.hypot(event.screenX - startPoint.x, event.screenY - startPoint.y) > 4) dragged = true;
    if (dragged) window.orbitDesktop.dragTo(event.screenX, event.screenY);
  });
  sprite.addEventListener("pointerup", (event) => {
    if (!startPoint) return;
    sprite.releasePointerCapture(event.pointerId);
    startPoint = null;
    window.orbitDesktop.endDrag();
  });
  sprite.addEventListener("click", (event) => {
    if (!dragged) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    dragged = false;
  }, true);
}

function enableTransparentClickThrough() {
  const selectors = [".sprite", ".chat", ".menu-toggle", ".skin-toggle", ".speech-toggle", ".action-menu", ".skin-picker"];
  let ignored;
  document.addEventListener("mousemove", (event) => {
    const elements = selectors.map((selector) => orbit.shadowRoot.querySelector(selector)).filter(Boolean);
    elements.push(document.querySelector(".window-tools"));
    const interactive = elements.some((element) => {
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.pointerEvents === "none" || Number(style.opacity) === 0) return false;
      const rect = element.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
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
});

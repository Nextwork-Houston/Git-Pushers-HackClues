(function () {
  "use strict";

  const ANIMATIONS = {
    idle: { sheet: "base", row: 0, delay: 780, label: "Ready", offsetX: "-26px" },
    listening: { sheet: "base", row: 1, delay: 430, label: "Listening", offsetX: "-26px" },
    speaking: { sheet: "base", row: 2, delay: 260, label: "Speaking", offsetX: "-26px" },
    success: { sheet: "base", row: 3, delay: 220, label: "Complete", offsetX: "-26px" },
    thinking: { sheet: "emotions", row: 0, delay: 520, label: "Thinking" },
    crying: { sheet: "emotions", row: 1, delay: 420, label: "Emotional" },
    tantrum: { sheet: "emotions", row: 2, delay: 190, label: "Having a moment" },
    lazy: { sheet: "emotions", row: 3, delay: 680, label: "Taking it easy" },
    belly: { sheet: "acrobatics", row: 0, delay: 560, label: "Lounging" },
    somersault: { sheet: "acrobatics", row: 1, delay: 230, label: "Somersaulting" },
    backflip: { sheet: "acrobatics", row: 2, delay: 220, label: "Backflipping" },
    skipping: { sheet: "acrobatics", row: 3, delay: 250, label: "Skipping" },
    dance: { sheet: "entertainment", row: 0, delay: 250, label: "Dancing" },
    laugh: { sheet: "entertainment", row: 1, delay: 300, label: "Laughing" },
    airguitar: { sheet: "entertainment", row: 2, delay: 240, label: "Rocking out" },
    moonwalk: { sheet: "entertainment", row: 3, delay: 270, label: "Moonwalking" },
  };
  const STATES = new Set(Object.keys(ANIMATIONS));
  const DEFAULT_SHEETS = {
    base: "./orbit-spritesheet.png",
    emotions: "./orbit-actions-emotions.png",
    acrobatics: "./orbit-actions-acrobatics.png",
    entertainment: "./orbit-actions-entertainment.png",
  };
  const DEFAULT_WAITING_ACTIONS = ["thinking", "dance", "skipping", "lazy", "airguitar", "moonwalk", "belly", "backflip"];
  const SKINS = {
    classic: {
      label: "Classic orange",
      filter: "hue-rotate(200deg) saturate(1.12)",
      accent: "#ff9a24",
      accentSoft: "#ffd08a",
    },
    electric: {
      label: "Electric blue",
      filter: "brightness(1)",
      accent: "#20f6ff",
      accentSoft: "#8bf9ff",
    },
    dove: {
      label: "Dove gray",
      filter: "brightness(1.34) contrast(0.86) saturate(0.78)",
      accent: "#58dff6",
      accentSoft: "#b9f4ff",
    },
    pink: {
      label: "Neon pink",
      filter: "hue-rotate(125deg) saturate(1.16) brightness(1.04)",
      accent: "#ff5bd6",
      accentSoft: "#ffb5ec",
    },
  };
  const SKIN_NAMES = new Set(Object.keys(SKINS));
  const normalizeSkinName = (name) => SKIN_NAMES.has(String(name || "").toLowerCase()) ? String(name).toLowerCase() : "electric";
  const ANIMATION_ALIASES = {
    laying: "belly",
    "laying-on-stomach": "belly",
    summersault: "somersault",
    "summer-sault": "somersault",
    "back-flip": "backflip",
    skip: "skipping",
    dancing: "dance",
    "air-guitar": "airguitar",
  };
  const normalizeAnimationName = (name) => {
    const candidate = String(name || "idle").toLowerCase();
    const normalized = ANIMATION_ALIASES[candidate] || candidate;
    return STATES.has(normalized) ? normalized : "idle";
  };

  const icons = {
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>',
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6"/></svg>',
    pulse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2.2-5 4 10 2.2-5H21"/></svg>',
    memory: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 9h6v6H9zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/></svg>',
    palette: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.4a1.8 1.8 0 0 0 0-3.6H12a1.7 1.7 0 0 1 0-3.4h2.5A6.5 6.5 0 0 0 21 7.5C21 5 17 3 12 3Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="10" cy="6.8" r="1"/><circle cx="15" cy="6.8" r="1"/><circle cx="17.5" cy="10" r="1"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 14.5 14.5 9M7.5 17.5l-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0M16.5 6.5l1-1a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0"/></svg>',
  };

  const styles = `
    :host {
      --avatar-accent: #20f6ff;
      --avatar-accent-soft: #8bf9ff;
      --avatar-ink: #071524;
      --avatar-surface: rgba(239, 247, 255, 0.94);
      --avatar-surface-strong: #f5f9fd;
      --avatar-muted: #617386;
      --avatar-shadow: 0 24px 60px rgba(5, 35, 64, 0.22);
      display: inline-block;
      color: var(--avatar-ink);
      font-family: Inter, ui-rounded, "Segoe UI", sans-serif;
      font-size: 16px;
      line-height: 1.4;
    }

    * { box-sizing: border-box; }

    button { font: inherit; }

    .companion {
      display: flex;
      align-items: flex-end;
      gap: 18px;
      min-height: 326px;
      padding: 14px;
      position: relative;
    }

    .stage {
      width: 280px;
      height: 312px;
      position: relative;
      flex: 0 0 auto;
      isolation: isolate;
    }

    .aura {
      position: absolute;
      width: 224px;
      height: 224px;
      left: 28px;
      bottom: 18px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(32, 246, 255, 0.3), rgba(22, 119, 255, 0.09) 52%, transparent 72%);
      filter: blur(2px);
      opacity: var(--avatar-aura-opacity, 0.55);
      transform: scale(0.9);
      transition: transform 320ms ease, opacity 320ms ease;
      z-index: -2;
    }

    .ground {
      position: absolute;
      width: 184px;
      height: 24px;
      left: 48px;
      bottom: 12px;
      border-radius: 50%;
      background: rgba(7, 21, 36, 0.2);
      filter: blur(10px);
      z-index: -1;
    }

    .sprite {
      width: 280px;
      height: 280px;
      position: absolute;
      left: var(--sprite-offset-x, -26px);
      bottom: 0;
      background-image: var(--sprite-image);
      background-repeat: no-repeat;
      background-size: 1120px 1120px;
      background-position: var(--frame-x, 0px) var(--state-y, 0px);
      filter: var(--avatar-skin-filter, none) var(--avatar-outline-glow, drop-shadow(0 0 0 transparent)) drop-shadow(0 16px 12px rgba(5, 27, 49, 0.16));
      transition: filter 220ms ease;
      cursor: pointer;
    }

    .companion[data-state="listening"] .sprite { filter: var(--avatar-skin-filter, none) var(--avatar-outline-glow, drop-shadow(0 0 0 transparent)) drop-shadow(0 0 18px color-mix(in srgb, var(--avatar-accent) 48%, transparent)); }
    .companion[data-state="speaking"] .aura,
    .companion[data-state="listening"] .aura { transform: scale(1.08); }
    .companion[data-state="success"] .aura { transform: scale(1.2); opacity: 0.95; }
    .companion[data-busy="true"] .aura { transform: scale(1.08); opacity: 1; }
    .companion[data-state="tantrum"] .stage { animation: tantrumShake 180ms ease-in-out infinite alternate; }

    @keyframes tantrumShake {
      from { transform: translateX(-2px) rotate(-0.4deg); }
      to { transform: translateX(2px) rotate(0.4deg); }
    }

    .menu-toggle,
    .skin-toggle,
    .speech-toggle {
      position: absolute;
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border: 1px solid rgba(57, 87, 118, 0.16);
      border-radius: 50%;
      color: var(--avatar-ink);
      background: var(--avatar-surface-strong);
      box-shadow: 0 10px 28px rgba(8, 41, 72, 0.16);
      cursor: pointer;
      transition: transform 180ms ease, background 180ms ease, color 180ms ease;
      z-index: 4;
    }

    .menu-toggle:hover,
    .skin-toggle:hover,
    .speech-toggle:hover { transform: translateY(-2px); }
    .menu-toggle:focus-visible,
    .skin-toggle:focus-visible,
    .speech-toggle:focus-visible,
    .action:focus-visible,
    .skin-option:focus-visible { outline: 3px solid color-mix(in srgb, var(--avatar-accent) 38%, transparent); outline-offset: 3px; }
    .menu-toggle svg,
    .skin-toggle svg,
    .speech-toggle svg,
    .action svg { width: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

    .menu-toggle { top: 22px; right: 10px; }
    .skin-toggle { top: 22px; left: 10px; }
    .speech-toggle { right: 12px; bottom: 24px; }
    .speech-toggle[aria-pressed="true"] {
      color: #fff;
      background: var(--avatar-accent);
      animation: micPulse 1.5s ease-out infinite;
    }

    @keyframes micPulse {
      0% { box-shadow: 0 0 0 0 rgba(32, 246, 255, 0.44), 0 10px 28px rgba(8, 41, 72, 0.16); }
      75%, 100% { box-shadow: 0 0 0 12px rgba(32, 246, 255, 0), 0 10px 28px rgba(8, 41, 72, 0.16); }
    }

    .action-menu {
      position: absolute;
      top: 72px;
      right: 10px;
      display: grid;
      gap: 8px;
      width: 216px;
      padding: 10px;
      border: 1px solid rgba(57, 87, 118, 0.14);
      border-radius: 18px;
      background: rgba(239, 247, 255, 0.97);
      box-shadow: var(--avatar-shadow);
      backdrop-filter: blur(18px);
      opacity: 0;
      visibility: hidden;
      transform: translateY(-8px) scale(0.96);
      transform-origin: top right;
      pointer-events: none;
      transition: opacity 160ms ease, transform 160ms ease, visibility 0s linear 160ms;
      z-index: 5;
    }

    .action-menu[data-open="true"] { opacity: 1; visibility: visible; transform: none; pointer-events: auto; transition-delay: 0s; }

    .skin-picker {
      position: absolute;
      top: 72px;
      left: 10px;
      display: grid;
      gap: 7px;
      width: 188px;
      padding: 10px;
      border: 1px solid rgba(57, 87, 118, 0.14);
      border-radius: 18px;
      background: rgba(239, 247, 255, 0.97);
      box-shadow: var(--avatar-shadow);
      backdrop-filter: blur(18px);
      opacity: 0;
      visibility: hidden;
      transform: translateY(-8px) scale(0.96);
      transform-origin: top left;
      pointer-events: none;
      transition: opacity 160ms ease, transform 160ms ease, visibility 0s linear 160ms;
      z-index: 6;
    }

    .skin-picker[data-open="true"] { opacity: 1; visibility: visible; transform: none; pointer-events: auto; transition-delay: 0s; }
    .skin-picker-title { padding: 2px 4px 5px; color: var(--avatar-muted); font-size: 0.74rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    .skin-option {
      display: grid;
      grid-template-columns: 28px 1fr 18px;
      align-items: center;
      gap: 9px;
      width: 100%;
      padding: 8px;
      border: 0;
      border-radius: 11px;
      color: var(--avatar-ink);
      text-align: left;
      background: transparent;
      cursor: pointer;
    }
    .skin-option:hover, .skin-option[aria-checked="true"] { background: color-mix(in srgb, var(--avatar-accent) 12%, transparent); }
    .skin-option[aria-checked="true"]::after { content: "✓"; color: var(--avatar-accent); font-weight: 900; }
    .skin-swatch { width: 26px; height: 26px; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px rgba(7, 21, 36, 0.18); }
    .skin-option[data-skin="classic"] .skin-swatch { background: linear-gradient(135deg, #ffcc75, #ff7a18 70%, #58616c); }
    .skin-option[data-skin="electric"] .skin-swatch { background: linear-gradient(135deg, #8bf9ff, #1677ff 70%, #263849); }
    .skin-option[data-skin="dove"] .skin-swatch { background: linear-gradient(135deg, #f1f2f4, #aeb8c2 70%, #71808e); }
    .skin-option[data-skin="pink"] .skin-swatch { background: linear-gradient(135deg, #ffc3ef, #ff4acb 70%, #76536e); }
    .action {
      display: grid;
      grid-template-columns: 34px 1fr auto;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px;
      border: 0;
      border-radius: 12px;
      color: var(--avatar-ink);
      text-align: left;
      background: transparent;
      cursor: pointer;
    }

    .action:hover { background: rgba(22, 119, 255, 0.1); }
    .action:disabled { cursor: wait; opacity: 0.62; }
    .action-icon {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 10px;
      color: #0068ff;
      background: rgba(22, 119, 255, 0.14);
    }
    .action-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 750; }
    .action-arrow { color: #8395a8; font-size: 16px; }

    .chat {
      width: min(360px, calc(100vw - 32px));
      max-height: 306px;
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(57, 87, 118, 0.14);
      border-radius: 24px 24px 8px 24px;
      background: var(--avatar-surface);
      box-shadow: var(--avatar-shadow);
      backdrop-filter: blur(20px);
      opacity: 0;
      transform: translateX(12px) scale(0.96);
      transform-origin: bottom right;
      pointer-events: none;
      transition: opacity 220ms ease, transform 220ms ease;
      overflow: hidden;
    }

    .chat[data-open="true"] { opacity: 1; transform: none; pointer-events: auto; }
    .chat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px 10px;
      border-bottom: 1px solid rgba(57, 87, 118, 0.1);
    }
    .identity { display: flex; align-items: center; gap: 9px; }
    .status-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--avatar-accent); box-shadow: 0 0 0 5px rgba(32, 246, 255, 0.14); }
    .identity strong { display: block; font-size: 13px; letter-spacing: 0.01em; }
    .status { color: var(--avatar-muted); font-size: 11px; text-transform: capitalize; }
    .chat-close { border: 0; padding: 4px; color: var(--avatar-muted); background: transparent; cursor: pointer; }
    .chat-close svg { width: 17px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }

    .messages {
      display: flex;
      flex-direction: column;
      gap: 9px;
      min-height: 78px;
      padding: 14px 16px 16px;
      overflow-y: auto;
      scrollbar-width: thin;
    }
    .message {
      max-width: 88%;
      padding: 9px 12px;
      border-radius: 14px;
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .message[data-role="assistant"] { align-self: flex-start; border-bottom-left-radius: 4px; background: #dff8ff; }
    .message[data-role="user"] { align-self: flex-end; border-bottom-right-radius: 4px; color: #fff; background: #0b2340; }
    .message[data-live="true"] { color: var(--avatar-muted); font-style: italic; }

    .listening-bars { display: inline-flex; align-items: flex-end; gap: 3px; height: 15px; margin-left: 6px; vertical-align: middle; }
    .listening-bars i { width: 3px; height: 5px; border-radius: 2px; background: var(--avatar-accent); animation: bars 700ms ease-in-out infinite alternate; }
    .listening-bars i:nth-child(2) { animation-delay: 120ms; }
    .listening-bars i:nth-child(3) { animation-delay: 240ms; }
    @keyframes bars { to { height: 14px; } }

    @media (max-width: 680px) {
      .companion { flex-direction: column-reverse; align-items: center; gap: 4px; padding: 0; }
      .chat { border-radius: 22px 22px 22px 8px; transform: translateY(10px) scale(0.97); }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
    }
  `;

  class AvatarCompanion extends HTMLElement {
    static get observedAttributes() {
      return ["name", "sprite-src", "emotions-src", "acrobatics-src", "entertainment-src", "state", "skin", "chat-open", "menu-open", "skin-menu-open"];
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._state = "idle";
      this._skin = "electric";
      this._frame = 0;
      this._frameTimer = null;
      this._messages = [];
      this._liveTranscript = "";
      this._actions = [];
      this._speechCleanup = null;
      this._sheets = { ...DEFAULT_SHEETS };
      this._waiting = false;
      this._waitingTimer = null;
      this._waitingActions = [...DEFAULT_WAITING_ACTIONS];
      this._waitingIndex = 0;
      this._actionTimer = null;
    }

    connectedCallback() {
      const storedSkin = this._loadStoredSkin();
      if (!this.hasAttribute("skin") && storedSkin) this.setAttribute("skin", storedSkin);
      if (!this.shadowRoot.hasChildNodes()) this._render();
      this._syncFromAttributes();
      this._startAnimation();
    }

    disconnectedCallback() {
      clearInterval(this._frameTimer);
      clearInterval(this._waitingTimer);
      clearTimeout(this._actionTimer);
      if (this._speechCleanup) this._speechCleanup();
    }

    attributeChangedCallback() {
      if (this.isConnected && this.shadowRoot.hasChildNodes()) this._syncFromAttributes();
    }

    get state() { return this._state; }
    set state(value) { this.setState(value); }
    get animations() { return Object.keys(ANIMATIONS); }
    get skins() { return Object.keys(SKINS); }
    get skin() { return this._skin; }
    set skin(value) { this.setSkin(value); }
    get waiting() { return this._waiting; }
    get actions() { return [...this._actions]; }
    set actions(value) {
      this._actions = Array.isArray(value) ? value.map((action, index) => this._normalizeAction(action, index)) : [];
      if (this.isConnected) this._renderActions();
    }

    setState(nextState) {
      const normalized = normalizeAnimationName(nextState);
      this._state = normalized;
      if (this.getAttribute("state") !== normalized) this.setAttribute("state", normalized);
      this._frame = 0;
      this._updateFrame();
      this._startAnimation();
      if (normalized === "listening" || normalized === "speaking") this.openChat();
      this._updateStatus();
      this._renderMessages();
    }

    setSkin(name, options = {}) {
      const normalized = normalizeSkinName(name);
      this._skin = normalized;
      if (this.getAttribute("skin") !== normalized) this.setAttribute("skin", normalized);
      else this._applySkin();
      if (options.persist !== false) this._storeSkin(normalized);
      this.dispatchEvent(new CustomEvent("avatar-skin-change", {
        detail: { skin: normalized, label: SKINS[normalized].label },
        bubbles: true,
        composed: true,
      }));
      return normalized;
    }

    playAction(name, options = {}) {
      const normalized = normalizeAnimationName(name);
      clearTimeout(this._actionTimer);
      this.setState(normalized);
      this.dispatchEvent(new CustomEvent("avatar-animation", {
        detail: { name: normalized },
        bubbles: true,
        composed: true,
      }));
      const duration = Number(options.duration || 0);
      if (duration > 0) {
        const returnTo = normalizeAnimationName(options.returnTo);
        this._actionTimer = setTimeout(() => {
          if (!this._waiting) this.setState(returnTo);
        }, duration);
      }
      return normalized;
    }

    startWaiting(options = {}) {
      clearInterval(this._waitingTimer);
      clearTimeout(this._actionTimer);
      const requested = Array.isArray(options.actions) ? options.actions.map(normalizeAnimationName).filter((name) => name !== "idle") : [];
      this._waitingActions = requested.length ? requested : [...DEFAULT_WAITING_ACTIONS];
      this._waiting = true;
      this._waitingIndex = Math.floor(Math.random() * this._waitingActions.length);
      this._playNextWaitingAction();
      const interval = Math.max(1800, Number(options.interval || 3400));
      this._waitingTimer = setInterval(() => this._playNextWaitingAction(), interval);
      if (options.openChat) this.openChat();
      if (this.$) this.$(".companion").dataset.busy = "true";
      this.dispatchEvent(new CustomEvent("avatar-waiting-start", { bubbles: true, composed: true }));
    }

    stopWaiting(options = {}) {
      clearInterval(this._waitingTimer);
      this._waitingTimer = null;
      this._waiting = false;
      if (this.$) this.$(".companion").dataset.busy = "false";
      const nextState = options.state === null ? null : normalizeAnimationName(options.state);
      if (nextState) this.setState(nextState);
      else this._updateStatus();
      this.dispatchEvent(new CustomEvent("avatar-waiting-stop", { bubbles: true, composed: true }));
    }

    setWaitingActions(actions) {
      const next = Array.isArray(actions) ? actions.map(normalizeAnimationName).filter((name) => name !== "idle") : [];
      this._waitingActions = next.length ? next : [...DEFAULT_WAITING_ACTIONS];
    }

    openChat() {
      const changed = !this.hasAttribute("chat-open");
      this.setAttribute("chat-open", "");
      if (changed) this.dispatchEvent(new CustomEvent("avatar-chat-change", { detail: { open: true }, bubbles: true, composed: true }));
    }
    closeChat() {
      const changed = this.hasAttribute("chat-open");
      this.removeAttribute("chat-open");
      if (changed) this.dispatchEvent(new CustomEvent("avatar-chat-change", { detail: { open: false }, bubbles: true, composed: true }));
    }
    activate(options = {}) {
      this.openChat();
      if (options.listen !== false) this.setState("listening");
      this.dispatchEvent(new CustomEvent("avatar-activate", {
        detail: { state: this._state },
        bubbles: true,
        composed: true,
      }));
    }
    toggleMenu(force) {
      const next = typeof force === "boolean" ? force : !this.hasAttribute("menu-open");
      if (next) this.removeAttribute("skin-menu-open");
      this.toggleAttribute("menu-open", next);
    }

    toggleSkinMenu(force) {
      const next = typeof force === "boolean" ? force : !this.hasAttribute("skin-menu-open");
      if (next) this.removeAttribute("menu-open");
      this.toggleAttribute("skin-menu-open", next);
    }

    addMessage(text, role = "assistant") {
      const cleanText = String(text || "").trim();
      if (!cleanText) return;
      this._messages.push({ text: cleanText, role: role === "user" ? "user" : "assistant" });
      this._liveTranscript = "";
      this._renderMessages();
      this.openChat();
    }

    setTranscript(text, options = {}) {
      const role = options.role === "assistant" ? "assistant" : "user";
      if (options.final) {
        this.addMessage(text, role);
        return;
      }
      this._liveTranscript = String(text || "");
      this._liveRole = role;
      this._renderMessages();
      this.openChat();
      if (this._liveTranscript) this.setState(role === "assistant" ? "speaking" : "listening");
    }

    clearMessages() {
      this._messages = [];
      this._liveTranscript = "";
      this._renderMessages();
    }

    bindSpeechSource(source, options = {}) {
      if (!source || typeof source.addEventListener !== "function") throw new TypeError("Speech source must be an EventTarget.");
      if (this._speechCleanup) this._speechCleanup();
      const events = {
        start: options.startEvent || "speech.start",
        partial: options.partialEvent || "speech.partial",
        final: options.finalEvent || "speech.final",
        end: options.endEvent || "speech.end",
      };
      const getText = options.getText || ((event) => event.detail?.text ?? event.detail?.transcript ?? "");
      const handlers = {
        start: () => this.setState("listening"),
        partial: (event) => this.setTranscript(getText(event), { role: "user" }),
        final: (event) => this.setTranscript(getText(event), { role: "user", final: true }),
        end: () => this.setState("idle"),
      };
      Object.entries(events).forEach(([key, eventName]) => source.addEventListener(eventName, handlers[key]));
      this._speechCleanup = () => Object.entries(events).forEach(([key, eventName]) => source.removeEventListener(eventName, handlers[key]));
      return this._speechCleanup;
    }

    async runAction(actionOrId) {
      const action = typeof actionOrId === "string" ? this._actions.find((item) => item.id === actionOrId) : actionOrId;
      if (!action) throw new Error("Avatar action not found.");
      const requestEvent = new CustomEvent("avatar-action", { detail: { action }, bubbles: true, composed: true, cancelable: true });
      if (!this.dispatchEvent(requestEvent)) return { prevented: true };
      if (!action.url) return { dispatched: true };

      const options = { method: action.method, headers: { ...(action.headers || {}) } };
      if (!['GET', 'HEAD'].includes(action.method) && action.body !== undefined) {
        options.headers["Content-Type"] ||= "application/json";
        options.body = typeof action.body === "string" ? action.body : JSON.stringify(action.body);
      }

      const animateWhileWaiting = action.animateWhileWaiting !== false;
      if (animateWhileWaiting) this.startWaiting({ actions: action.waitingActions, openChat: true });
      try {
        const response = await fetch(action.url, options);
        const contentType = response.headers.get("content-type") || "";
        const data = contentType.includes("application/json") ? await response.json() : await response.text();
        if (!response.ok) throw new Error(`Backend returned ${response.status}.`);
        this.dispatchEvent(new CustomEvent("avatar-action-result", { detail: { action, response, data }, bubbles: true, composed: true }));
        return data;
      } finally {
        if (animateWhileWaiting && this._waiting) this.stopWaiting({ state: null });
      }
    }

    _render() {
      this.shadowRoot.innerHTML = `
        <style>${styles}</style>
        <section class="companion" data-state="idle">
          <aside class="chat" role="region" aria-label="Conversation with avatar">
            <header class="chat-header">
              <div class="identity"><span class="status-dot"></span><div><strong class="pet-name"></strong><div class="status">Ready</div></div></div>
              <button class="chat-close" type="button" aria-label="Close conversation">${icons.close}</button>
            </header>
            <div class="messages" role="log" aria-live="polite"></div>
          </aside>
          <div class="stage">
            <div class="aura"></div><div class="ground"></div>
            <div class="sprite" role="img"></div>
            <button class="skin-toggle" type="button" aria-label="Choose avatar color" aria-expanded="false">${icons.palette}</button>
            <div class="skin-picker" role="radiogroup" aria-label="Avatar colors">
              <div class="skin-picker-title">Choose a color</div>
              ${Object.entries(SKINS).map(([name, skin]) => `<button class="skin-option" type="button" role="radio" data-skin="${name}" aria-checked="false"><span class="skin-swatch" aria-hidden="true"></span><span>${skin.label}</span></button>`).join("")}
            </div>
            <button class="menu-toggle" type="button" aria-label="Open avatar actions" aria-expanded="false">${icons.menu}</button>
            <div class="action-menu" role="menu"></div>
            <button class="speech-toggle" type="button" aria-label="Start voice conversation" aria-pressed="false">${icons.mic}</button>
          </div>
        </section>`;
      this.$ = (selector) => this.shadowRoot.querySelector(selector);
      this.$(".menu-toggle").addEventListener("click", () => this.toggleMenu());
      this.$(".skin-toggle").addEventListener("click", () => this.toggleSkinMenu());
      this.$(".sprite").addEventListener("click", () => this.activate());
      this.$(".chat-close").addEventListener("click", () => {
        this.closeChat();
        this.setState("idle");
      });
      this.$(".speech-toggle").addEventListener("click", () => {
        const active = this._state !== "listening";
        if (active) this.activate();
        else this.setState("idle");
        this.dispatchEvent(new CustomEvent("speech-toggle-request", { detail: { active }, bubbles: true, composed: true }));
      });
      this.shadowRoot.addEventListener("click", (event) => {
        const skinButton = event.target.closest(".skin-option");
        if (skinButton) {
          this.setSkin(skinButton.dataset.skin);
          this.toggleSkinMenu(false);
          return;
        }
        const button = event.target.closest(".action");
        if (button) this._handleActionClick(button);
      });
      this._renderMessages();
      this._renderActions();
    }

    _syncFromAttributes() {
      const nextState = normalizeAnimationName(this.getAttribute("state"));
      if (this._state !== nextState) {
        this._state = nextState;
        this._frame = 0;
        this._startAnimation();
      }
      const name = this.getAttribute("name") || "Orbit";
      this._skin = normalizeSkinName(this.getAttribute("skin"));
      this._sheets = {
        base: this.getAttribute("sprite-src") || DEFAULT_SHEETS.base,
        emotions: this.getAttribute("emotions-src") || DEFAULT_SHEETS.emotions,
        acrobatics: this.getAttribute("acrobatics-src") || DEFAULT_SHEETS.acrobatics,
        entertainment: this.getAttribute("entertainment-src") || DEFAULT_SHEETS.entertainment,
      };
      this.$(".pet-name").textContent = name;
      this.$(".sprite").setAttribute("aria-label", `${name}, ${this._state}`);
      this.$(".companion").dataset.state = this._state;
      this.$(".companion").dataset.busy = String(this._waiting);
      this._applySkin();
      const chatOpen = this.hasAttribute("chat-open");
      const menuOpen = this.hasAttribute("menu-open");
      const skinMenuOpen = this.hasAttribute("skin-menu-open");
      this.$(".chat").dataset.open = String(chatOpen);
      this.$(".action-menu").dataset.open = String(menuOpen);
      this.$(".menu-toggle").setAttribute("aria-expanded", String(menuOpen));
      this.$(".menu-toggle").innerHTML = menuOpen ? icons.close : icons.menu;
      this.$(".skin-picker").dataset.open = String(skinMenuOpen);
      this.$(".skin-toggle").setAttribute("aria-expanded", String(skinMenuOpen));
      this.$(".speech-toggle").setAttribute("aria-pressed", String(this._state === "listening"));
      this._updateStatus();
      this._updateFrame();
    }

    _applySkin() {
      if (!this.$) return;
      const skin = SKINS[this._skin] || SKINS.electric;
      const companion = this.$(".companion");
      companion.dataset.skin = this._skin;
      companion.style.setProperty("--avatar-skin-filter", skin.filter);
      companion.style.setProperty("--avatar-accent", skin.accent);
      companion.style.setProperty("--avatar-accent-soft", skin.accentSoft);
      this.shadowRoot.querySelectorAll(".skin-option").forEach((button) => {
        button.setAttribute("aria-checked", String(button.dataset.skin === this._skin));
      });
      this.$(".skin-toggle").setAttribute("aria-label", `Choose avatar color. Current: ${skin.label}`);
    }

    _loadStoredSkin() {
      const key = this.getAttribute("skin-storage-key");
      if (!key) return null;
      try { return normalizeSkinName(localStorage.getItem(key)); }
      catch { return null; }
    }

    _storeSkin(skin) {
      const key = this.getAttribute("skin-storage-key");
      if (!key) return;
      try { localStorage.setItem(key, skin); }
      catch {}
    }

    _startAnimation() {
      clearInterval(this._frameTimer);
      if (this._state === "idle") {
        this._frame = 0;
        this._updateFrame();
        return;
      }
      this._frameTimer = setInterval(() => {
        this._frame = (this._frame + 1) % 4;
        this._updateFrame();
      }, ANIMATIONS[this._state].delay);
    }

    _playNextWaitingAction() {
      if (!this._waiting || !this._waitingActions.length) return;
      const action = this._waitingActions[this._waitingIndex % this._waitingActions.length];
      this._waitingIndex += 1;
      this.playAction(action);
    }

    _updateFrame() {
      if (!this.$) return;
      const positions = ["0px", "-280px", "-560px", "-840px"];
      const rows = ["0px", "-280px", "-560px", "-840px"];
      const animation = ANIMATIONS[this._state];
      const sheet = this._sheets[animation.sheet] || DEFAULT_SHEETS[animation.sheet];
      this.$(".sprite").style.setProperty("--frame-x", positions[this._frame]);
      this.$(".sprite").style.setProperty("--state-y", rows[animation.row]);
      this.$(".sprite").style.setProperty("--sprite-offset-x", animation.offsetX || "0px");
      this.$(".companion").style.setProperty("--sprite-image", `url("${String(sheet).replace(/["\\]/g, "\\$&")}")`);
      this.$(".companion").dataset.state = this._state;
    }

    _updateStatus() {
      if (!this.$) return;
      this.$(".status").textContent = this._waiting ? `Working · ${ANIMATIONS[this._state].label}` : ANIMATIONS[this._state].label;
      this.$(".speech-toggle").setAttribute("aria-pressed", String(this._state === "listening"));
      this.$(".sprite").setAttribute("aria-label", `${this.getAttribute("name") || "Orbit"}, ${this._state}`);
    }

    _renderMessages() {
      if (!this.$) return;
      const container = this.$(".messages");
      container.replaceChildren();
      const messages = this._messages.length ? this._messages : [{ text: "Say hello whenever you’re ready.", role: "assistant" }];
      messages.forEach((message) => container.append(this._messageNode(message)));
      if (this._liveTranscript) container.append(this._messageNode({ text: this._liveTranscript, role: this._liveRole, live: true }));
      if (this._state === "listening" && !this._liveTranscript) {
        const listening = document.createElement("div");
        listening.className = "message";
        listening.dataset.role = "assistant";
        listening.innerHTML = 'I’m listening <span class="listening-bars" aria-hidden="true"><i></i><i></i><i></i></span>';
        container.append(listening);
      }
      if (this._waiting && !this._liveTranscript) {
        const waiting = document.createElement("div");
        waiting.className = "message";
        waiting.dataset.role = "assistant";
        waiting.innerHTML = 'Still working <span class="listening-bars" aria-hidden="true"><i></i><i></i><i></i></span>';
        container.append(waiting);
      }
      requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
    }

    _messageNode(message) {
      const node = document.createElement("div");
      node.className = "message";
      node.dataset.role = message.role;
      if (message.live) node.dataset.live = "true";
      node.textContent = message.text;
      return node;
    }

    _normalizeAction(action, index) {
      return {
        id: action.id || `action-${index + 1}`,
        label: action.label || `Action ${index + 1}`,
        icon: action.icon || "link",
        url: action.url || "",
        method: String(action.method || "POST").toUpperCase(),
        headers: action.headers,
        body: action.body,
        animateWhileWaiting: action.animateWhileWaiting !== false,
        waitingActions: Array.isArray(action.waitingActions) ? action.waitingActions.map(normalizeAnimationName).filter((name) => name !== "idle") : undefined,
      };
    }

    _renderActions() {
      if (!this.$) return;
      const menu = this.$(".action-menu");
      menu.replaceChildren();
      this._actions.forEach((action) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "action";
        button.dataset.actionId = action.id;
        button.setAttribute("role", "menuitem");
        button.innerHTML = `<span class="action-icon">${icons[action.icon] || icons.link}</span><span class="action-label"></span><span class="action-arrow">›</span>`;
        button.querySelector(".action-label").textContent = action.label;
        menu.append(button);
      });
      if (!this._actions.length) {
        const empty = document.createElement("div");
        empty.className = "action-label";
        empty.style.padding = "10px";
        empty.textContent = "No actions configured";
        menu.append(empty);
      }
    }

    async _handleActionClick(button) {
      const action = this._actions.find((item) => item.id === button.dataset.actionId);
      if (!action) return;
      button.disabled = true;
      const label = button.querySelector(".action-label");
      const original = action.label;
      label.textContent = "Working…";
      try {
        const result = await this.runAction(action);
        if (!result?.prevented) {
          this.setState("success");
          this.addMessage(`${original} completed.`, "assistant");
          setTimeout(() => this.setState("idle"), 1500);
        }
        this.toggleMenu(false);
      } catch (error) {
        this.playAction("tantrum", { duration: 1900 });
        this.addMessage(`${original} failed: ${error.message}`, "assistant");
        this.dispatchEvent(new CustomEvent("avatar-action-error", { detail: { action, error }, bubbles: true, composed: true }));
      } finally {
        button.disabled = false;
        label.textContent = original;
      }
    }
  }

  if (!customElements.get("avatar-companion")) customElements.define("avatar-companion", AvatarCompanion);
  window.AvatarCompanion = AvatarCompanion;
})();

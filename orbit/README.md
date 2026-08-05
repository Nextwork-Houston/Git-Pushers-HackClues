# Orbit Avatar Companion

Orbit is a dependency-free Web Component built to be copied into other projects. It includes 20 animated states, automatic waiting performances, a conversation window, a voice-interface event surface, and a configurable backend action menu.

## Orbit Desktop

The `desktop` folder wraps the component in a transparent, always-on-top Electron application for Windows, macOS, and Linux. Orbit starts as a compact pet in the lower-right corner. Its neon aura defines the interactive boundary, so transparent corners remain click-through. Drag Orbit to move it; the application remembers position, size, selected avatar, connected agents, and conversation settings across upgrades.

Orbit includes a tray menu with Show, Hide, Restart, and Quit controls. Launch at login is optional and disabled by default. Packaged defaults live in `desktop/desktop-config.json`; mutable settings and logs are stored in Electron's operating-system user-data directory rather than the installed application folder.

Set `conversationUrl`, the default skin, and backend menu actions in `desktop/desktop-config.json`. Speechmatics integrations can send `speechmatics.partial` and `speechmatics.final` browser events containing `detail.text`; Orbit opens chat and renders those transcripts immediately.

## Install Orbit

Production installers include Electron and all Orbit assets. End users do not need Node.js, npm, VS Code, or a terminal.

### Windows

Download `Orbit-Setup-x64.exe`, double-click it, and complete the installer. Orbit is added to the Start Menu and can create a Desktop shortcut. It installs per user without requiring administrator privileges.

### macOS

Download the DMG for Intel (`Orbit-1.0.1-x64.dmg`) or Apple Silicon (`Orbit-1.0.1-arm64.dmg`), open it, and drag Orbit into Applications. Current development packages are unsigned; see `docs/BUILDING.md` for the standard security and future notarization notes.

### Linux

Download `Orbit-1.0.1-x86_64.AppImage`, make it executable when required, and launch it. Debian-based systems can instead install `Orbit-1.0.1-amd64.deb`.

## Development

```bash
npm install
npm run dev
npm run check
```

Development launchers are also available:

- Windows: double-click `launch-orbit.bat`, or run `launch-orbit.ps1`.
- macOS: double-click `launch-orbit.command` after granting execute permission.
- Linux: run `launch-orbit.sh` after granting execute permission.

The launchers install missing development dependencies and then start Orbit. They are not production installers.

## Building installers

```bash
npm run build
npm run build:win
npm run build:mac
npm run build:linux
npm run dist
```

Generated applications and installers appear in `release/`. Build each production package on its matching operating system. See `docs/BUILDING.md` for artifact names, application-data locations, signing status, and CI details.

## Preview

From this folder, run:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080/demo.html`.

## Add Orbit to a project

Copy these files into the target project:

- `avatar-companion.js`
- `orbit-spritesheet.png`
- `orbit-actions-emotions.png`
- `orbit-actions-acrobatics.png`
- `orbit-actions-entertainment.png`
- `orbit-actions-love.png`
- The matching `*-orange.png`, `*-dove.png`, and `*-pink.png` variants for every sheet above
- `orbit.pet.json` if the project uses pet metadata

```html
<script src="/avatars/avatar-companion.js"></script>

<avatar-companion
  id="orbit"
  sprite-src="/avatars/orbit-spritesheet.png"
  emotions-src="/avatars/orbit-actions-emotions.png"
  acrobatics-src="/avatars/orbit-actions-acrobatics.png"
  entertainment-src="/avatars/orbit-actions-entertainment.png"
  love-src="/avatars/orbit-actions-love.png"
  skin="electric"
  skin-storage-key="my-app-orbit-skin"
  state="idle">
</avatar-companion>
```

## Avatar colors

The four avatars are **Solis** (`classic` orange), **Orbit** (`electric` blue), **Nimbus** (`dove` gray), and **Roisin** (`pink`). Users can choose one with the palette icon, or the host application can change it directly:

```js
orbit.setSkin("dove");
orbit.skin = "pink";
console.log(orbit.skins);
```

Add `skin-storage-key` to remember the user's choice in local storage. Omit it when the host application manages preferences itself. Every expression, action, and waiting animation uses the active skin. Listen for `avatar-skin-change` to synchronize the selection with an account or backend profile.

The chat header automatically uses the selected avatar's name. Add a `name` attribute only when a host project needs to override the built-in names.

Orbit now uses dedicated animation sheets for orange, blue, dove, and pink. This keeps the polished rounded 3D-toy materials consistent with the approved comparison artwork instead of approximating colors with global CSS filters. Keep every `*-orange.png`, `*-dove.png`, and `*-pink.png` sheet beside `avatar-companion.js`; the unsuffixed files are the electric-blue masters.

## Expressions and actions

Available animations are `idle`, `listening`, `speaking`, `success`, `thinking`, `crying`, `tantrum`, `lazy`, `belly`, `somersault`, `backflip`, `skipping`, `dance`, `laugh`, `airguitar`, `moonwalk`, `hearteyes`, `kiss`, `hearthug`, and `lovestruck`.

```js
orbit.playAction("dance", { duration: 3000 });
orbit.playAction("backflip", { duration: 1800, returnTo: "success" });
orbit.playAction("laying-on-stomach", { duration: 4000 });
orbit.playAction("heart-eyes", { duration: 2600 });
orbit.playAction("blowing-kiss", { duration: 2600 });
```

Common aliases such as `laying`, `laying-on-stomach`, `summersault`, `summer-sault`, `back-flip`, `skip`, `dancing`, `air-guitar`, `heart-eyes`, `heart-hug`, and `blowing-kiss` are accepted.

## Waiting performances

Start a rotating performance while an assistant, tool, or custom backend operation is working:

```js
orbit.startWaiting({
  interval: 3200,
  openChat: true,
  actions: ["thinking", "dance", "skipping", "moonwalk", "backflip"]
});

const result = await yourBackendClient.run();
orbit.stopWaiting({ state: "speaking" });
orbit.addMessage(result.message, "assistant");
```

Configured action-menu requests automatically start and stop the waiting performance. Set `animateWhileWaiting: false` on an action to disable it, or provide a per-action `waitingActions` array.

## Conversation API

```js
const orbit = document.querySelector("#orbit");

orbit.setState("listening");
orbit.setTranscript("Partial words from Speechmatics...");
orbit.setTranscript("The final user transcript.", { final: true, role: "user" });

orbit.setState("speaking");
orbit.addMessage("The assistant response appears here.", "assistant");
orbit.setState("idle");
```

For a Speechmatics client or any other transcription source, translate its events into the methods above. If your integration already exposes an `EventTarget`, `bindSpeechSource` can wire it directly:

```js
orbit.bindSpeechSource(speechEvents, {
  startEvent: "speech.start",
  partialEvent: "speech.partial",
  finalEvent: "speech.final",
  endEvent: "speech.end",
  getText: (event) => event.detail.transcript,
});
```

The microphone button emits `speech-toggle-request`. Start or stop the Speechmatics session in that listener, then call `setState` as the session changes.

## Native Agent Builder

Orbit includes an in-avatar connector for the AI Factory Native.builder Hackathon. Open the hamburger menu and expand **Connect native.builder agent** to register a deployed native.builder workflow or another public agent endpoint. The connector captures the agent name, platform, model or workflow label, endpoint, and request method, then immediately adds the agent to Orbit's action menu.

Add `agent-storage-key` to persist user-connected agents in local storage:

```html
<avatar-companion agent-storage-key="my-project-orbit-agents"></avatar-companion>
```

Hosts can also use the same builder API directly:

```js
const agent = orbit.connectAgent({
  label: "Native research workflow",
  platform: "native.builder",
  model: "Research pipeline",
  url: "https://your-native-builder-app.example/api/research",
  method: "POST"
});

orbit.removeAgent(agent.id);
```

Keep API keys and provider secrets behind the connected server endpoint. Do not store secrets in Orbit or other browser-visible configuration.

## Backend action menu

```js
orbit.actions = [
  {
    id: "health",
    label: "System health",
    icon: "pulse",
    url: "https://api.example.com/system/health",
    method: "GET"
  },
  {
    id: "workflow",
    label: "Run workflow",
    icon: "spark",
    url: "/api/workflows/daily",
    method: "POST",
    body: { source: "orbit" },
    waitingActions: ["thinking", "airguitar", "moonwalk"]
  }
];
```

Clicking an action calls its URL with `fetch`. Available built-in icons are `pulse`, `memory`, `spark`, and `link`. Listen for `avatar-action-result` or `avatar-action-error` to update the host application.

To take over the request yourself, cancel `avatar-action`:

```js
orbit.addEventListener("avatar-action", async (event) => {
  event.preventDefault();
  orbit.startWaiting();
  try {
    await yourBackendClient.run(event.detail.action.id);
    orbit.stopWaiting({ state: "success" });
  } catch (error) {
    orbit.stopWaiting({ state: null });
    orbit.playAction("tantrum", { duration: 1800 });
  }
});
```

## Events

- `speech-toggle-request`: the user clicked the voice button.
- `avatar-action`: an action was selected; cancel it to bypass built-in `fetch`.
- `avatar-action-result`: the backend returned a successful response.
- `avatar-action-error`: the backend request failed.
- `avatar-agent-connected`: a user connected an agent through Orbit's Agent Builder.
- `avatar-agent-removed`: a persisted Agent Builder connection was removed.
- `avatar-animation`: a new expression or action started.
- `avatar-waiting-start`: the waiting performance began.
- `avatar-waiting-stop`: the waiting performance ended.

## Theme

Override component variables from the host project:

```css
avatar-companion {
  --avatar-accent: #20f6ff;
  --avatar-accent-soft: #8bf9ff;
  --avatar-ink: #071524;
  --avatar-surface: rgba(239, 247, 255, 0.94);
}
```

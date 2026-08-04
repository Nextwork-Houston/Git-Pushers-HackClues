# Git Pushers HackClues

HackClues is a Next.js hackathon application with an interactive AI companion experience. This branch adds **Orbit**, a reusable animated voice companion that runs in the browser and as a cross-platform desktop pet.

## Live experiences

- Main application: `/`
- Public Orbit showcase: `/orbit`
- Orbit desktop downloads: `/orbit/downloads/`

## Orbit capabilities

- 16 expressions and actions, including thinking, crying, dancing, skipping, somersaults, backflips, and waiting performances.
- Click-to-activate chat with Speechmatics-compatible transcript events.
- Configurable backend action menu and conversation endpoint.
- Four selectable skins: Classic Orange, Electric Blue, Dove Gray, and Neon Pink.
- Transparent Electron desktop shell with direct dragging, persistent resizing, stable idle positioning, always-on-top behavior, and transparent click-through areas.
- Windows, macOS, and Linux startup installers.

## Technology

- Next.js 15, React 19, TypeScript, Tailwind CSS
- Electron desktop runtime
- Dependency-free Web Component for the avatar UI
- Vercel static delivery for the Orbit showcase and installer downloads

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000/orbit` for the public Orbit showcase. The existing authenticated dashboard remains available at `/`.

Run a production check before opening a pull request:

```bash
npm run build
```

## Desktop development

```bash
cd orbit/desktop
npm install
npm start
```

Desktop configuration lives in `orbit/desktop/desktop-config.json`. Set `conversationUrl` to a backend endpoint that accepts `{ "text": "..." }` and returns a JSON object containing `reply`, `message`, or `text`.

Speechmatics integrations can dispatch browser events to the desktop renderer:

```js
window.dispatchEvent(new CustomEvent("speechmatics.partial", {
  detail: { text: "partial transcript" }
}));

window.dispatchEvent(new CustomEvent("speechmatics.final", {
  detail: { text: "final transcript" }
}));
```

## Repository structure

```text
app/                  Next.js application routes
components/           Existing dashboard components
orbit/                Orbit source, Electron shell, and installers
public/orbit/         Vercel-ready showcase, sprites, and downloads
docs/                 Architecture and deployment documentation
vercel.json           Public route and download response configuration
```

## Branch strategy

Orbit and its Vercel configuration belong in one feature branch because they form one deployable feature. Use separate branches for unrelated work or later isolated changes, such as a Speechmatics backend, authentication replacement, or desktop auto-updater.

Current feature branch: `feature/orbit-desktop-companion`.

See [Orbit architecture](docs/ORBIT_ARCHITECTURE.md), [deployment instructions](docs/DEPLOYMENT.md), and [contribution guidelines](CONTRIBUTING.md) for additional detail.

## Security notes

- Never place Speechmatics or backend API secrets in `desktop-config.json` or client-side environment variables.
- Issue temporary Speechmatics tokens from a server-side endpoint.
- Keep Electron context isolation and sandboxing enabled.
- Validate backend action URLs and authorization on the server.

## License

No open-source license has been declared. All rights remain with the repository owners unless a license is added.


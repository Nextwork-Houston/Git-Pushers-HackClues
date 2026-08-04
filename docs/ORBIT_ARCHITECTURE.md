# Orbit Architecture

## Overview

Orbit is divided into three layers so the same character can be used inside the web application, on a static showcase, and as a desktop companion.

## Layers

### Avatar component

`orbit/avatar-companion.js` is a dependency-free Web Component. It owns:

- Sprite atlas animation and state transitions.
- Chat presentation and transcript rendering.
- Color selection and preference persistence.
- Backend action dispatch and waiting performances.
- Public events for activation, chat visibility, animation, skin changes, and action results.

### Web showcase

`public/orbit/demo.html` demonstrates the component without requiring authentication. Vercel rewrites `/orbit` to this static page. The static implementation intentionally mirrors the component source in `orbit/` so the showcase remains portable.

### Desktop shell

`orbit/desktop/` wraps the component in Electron. The main process manages window position, scale, drag movement, always-on-top behavior, transparent click-through regions, and application lifecycle. The preload script exposes a narrow IPC bridge; Node integration remains disabled in the renderer.

## Animation model

Each atlas contains a four-column by four-row grid. The renderer uses exact pixel offsets to prevent neighboring-frame bleed. Idle remains on frame zero; active expressions and actions advance through four frames at animation-specific rates.

## Conversation flow

1. The user clicks Orbit or Speechmatics emits a transcript event.
2. Orbit opens chat and enters `listening`.
3. Partial transcripts update the live user message.
4. Final transcripts are committed to chat.
5. If `conversationUrl` is configured, Orbit starts a waiting performance while the backend responds.
6. The assistant reply appears and Orbit transitions through speaking to idle.

## Security boundaries

- Renderer code has no direct Node.js access.
- IPC methods are explicitly allow-listed in `preload.js`.
- API secrets must remain server-side.
- Downloaded installers contain source and assets, not credentials.


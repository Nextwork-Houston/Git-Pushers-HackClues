# Orbit Architecture

## What this is

Roisin is a voice companion that turns spoken intent into working software by
driving [native.builder](https://builder.nativelyai.com), an AI software
factory. You talk; she listens, works out what you actually want, writes a
precise build instruction, and puts it into native.builder for you.

## The constraint that shapes everything

**native.builder has no public API.** It is a chat-driven web product. Its only
programmatic surface is one-way GitHub Sync, which pushes Builder's files out to
a repository and never accepts anything back.

So Roisin cannot call native.builder. She has to *use* it, the way a person
does. That is why the desktop shell hosts native.builder in a real window and
types into its chat box, and why the browser build falls back to handing you the
instruction to paste.

Everything Roisin does inside that window is something you could do by typing,
using your own logged-in session. The window is always visible — automation you
cannot see is automation you cannot stop.

## Layers

### Avatar component — `orbit/avatar-companion.js`

A dependency-free Web Component. It owns sprite animation and state
transitions, chat presentation, colour selection, action dispatch, and the
waiting performances. It emits events; it never decides policy.

### Speech bridge — `orbit/speech-bridge.js`

Also dependency-free, so the same file runs in the Next app, the static
showcase, and the Electron renderer without a bundler. It tries three
transports in order and emits identical events whichever one wins:

| Transport | What it gives | When it runs |
| --- | --- | --- |
| Speechmatics Flow | transcripts plus a spoken agent reply | when a Flow token is available |
| Speechmatics Realtime | transcripts only | when Flow is unavailable |
| Web Speech API | transcripts only, browser quality | when Speechmatics cannot be reached |

Events: `speech.start`, `speechmatics.partial`, `speechmatics.final`,
`speech.reply`, `speech.transport`, `speech.error`, `speech.end`.

Both Speechmatics transports need a short-lived JWT from `/api/speech/token`,
which requires a session. The public showcase therefore lands on the browser
engine, and the signed-in companion upgrades automatically.

### Next application — `app/`

| Route | Purpose |
| --- | --- |
| `/` | redirects to the showcase |
| `/orbit` | public showcase, no sign-in |
| `/login` | username and password, backed by Supabase |
| `/companion` | signed-in companion with the XP meter |
| `/api/speech/token` | mints short-lived Speechmatics JWTs |
| `/api/conversation` | Roisin's reasoning and history persistence |
| `/api/system/health` | reports which services are configured |
| `/api/github/commit` | writes a file through the GitHub App |

`proxy.ts` (Next 16 renamed `middleware` to `proxy`) guards the HTML routes.
API routes are excluded from it so they answer `401` JSON instead of
redirecting.

### Desktop shell — `orbit/desktop/`

Two windows:

- **Roisin** — frameless, transparent, always on top, click-through except over
  her and her panels. Node integration off, context isolation on.
- **native.builder** — a normal visible window on a persistent session
  partition, so you sign in once. Its preload deliberately exposes nothing;
  Roisin drives it from the main process with `executeJavaScript`, so the
  third-party page has no bridge back into Orbit.

## Conversation flow

1. You press the mic. The bridge picks a transport.
2. Partial transcripts stream into the chat as you speak.
3. A final transcript is posted to `/api/conversation`.
4. Roisin's model returns `{ say, action, builderPrompt, mood }`.
5. She says her line. History is appended server-side; the client can never
   rewrite what was said earlier.
6. If there is a `builderPrompt`, the main process types it into
   native.builder and submits it. In the browser, it is shown and copied
   instead.
7. XP is awarded — more for a build than for chat — and the meter moves.

## Driving someone else's interface

`orbit/desktop/builder-window.js` finds the chat composer by configured
selector first, then by heuristic: the largest visible `textarea`,
`[contenteditable]`, or `[role=textbox]`. It sets the value through the native
property setter, because React ignores a plain `.value` assignment, then clicks
a send button or presses Enter.

This is inherently fragile — it depends on markup that belongs to someone else.
`builderSelectors` in `desktop-config.json` exists so a DOM change can be fixed
by editing config rather than shipping a new build.

The prompt is user speech spliced into a script that runs in a third-party page,
so it is serialised through `literal()`, which escapes `<`, `>`, and the Unicode
line separators on top of JSON's own quoting. `tests/builder-window.test.ts`
evaluates the generated literal to prove the prompt survives as inert data.

## Data model

Four owner-scoped tables, all under row level security (`supabase/schema.sql`):

- `profiles` — one row per auth user. `username` is `citext`, so a name cannot
  be claimed twice under different capitalisation.
- `pets` — the companion: name, skin, XP, mood. One per account, enforced by a
  unique constraint on `user_id`, which is what lets the app look up "my pet"
  without choosing between duplicates. `level` is a generated column derived
  from `xp`, so the two can never disagree.
- `messages` — one row per message. An earlier design kept the whole history in
  a single `jsonb` column, which meant every append rewrote the entire
  conversation and two concurrent replies could lose one another.
- `builds` — every instruction handed to native.builder. The builder offers no
  way to query what it was sent, so this is the only record it happened.

Moods and skins are enums rather than free text: the sprite sheets animate a
fixed set, so a typo should fail on write instead of silently rendering idle.

XP is added by the `award_xp` function in a single statement. Read-modify-write
from the application would let two replies arriving together read the same
starting value and lose one of the awards.

A trigger provisions a pet on sign-up, so a signed-in user always has something
to talk to.

## Source layout

`orbit/` is the source of truth. `public/orbit/` is a published copy so the
static showcase and the Next app can serve the same files without a bundler.
`npm run sync:orbit` regenerates the copy and CI fails if it is stale — editing
the copy directly is how the two drift apart.

## Security boundaries

- The Speechmatics API key never leaves the server; the browser gets a JWT that
  expires in two minutes.
- Row level security is the real boundary on Supabase data; the `user_id`
  filters in the services are defence in depth and better error messages.
- The renderer has no Node access; IPC methods are allow-listed in `preload.js`.
- The native.builder window cannot reach Orbit, Electron, or your Speechmatics
  and Supabase sessions.
- Downloaded installers contain source and assets, never credentials.

# How Orbit works

Roisin is a voice companion who turns what you say into working software. You
talk; she works out what you actually meant, looks things up when she needs to,
writes a precise build instruction, and hands it to
[native.builder](https://builder.nativelyai.com).

---

## The one constraint that shapes everything

**native.builder has no public API.** We read their full documentation index —
GitHub Sync pushes one way out, and there is no REST endpoint, no CLI, and no
webhook.

So Roisin cannot *call* native.builder. She has to *use* it, the way a person
does. The desktop shell opens it in a real, visible window and types into its
chat box using your own logged-in session.

Everything else in the stack is a genuine API:

| Service | How we talk to it | What it does |
| --- | --- | --- |
| Speechmatics | WebSocket + REST | hears you, and speaks her replies |
| AI/ML API | REST | her reasoning |
| Bright Data | REST | live web research |
| Supabase | REST | accounts, pets, messages, builds |
| **native.builder** | **typing into its UI** | **builds the software** |

---

## The logic tree

```
you speak
│
├─ speech-bridge.js picks a transport
│  ├─ Speechmatics Flow ......... transcript + spoken agent reply
│  ├─ Speechmatics Realtime ..... transcript only          ← fallback
│  └─ Web Speech API ............ transcript only          ← last resort
│
│  All three emit the same events, so nothing downstream knows which ran.
│
└─ final transcript → POST /api/conversation
   │
   ├─ who are you?          getUser()        → 401 if no session
   ├─ which companion?      getCurrentPet()  → one pet per account
   ├─ what was said before? getMessages()    → last 40, oldest first
   │
   └─ composeReply(transcript, history)
      │
      │  The model returns exactly one of four actions.
      │
      ├─ "chat" ─────────── greeting, or a question about how things work
      │                     └→ she replies. +2 XP.
      │
      ├─ "ask" ──────────── one detail missing that ONLY YOU know
      │                     (which of your tools, who will use it)
      │                     └→ she asks for exactly one thing. +2 XP.
      │
      ├─ "research" ─────── facts she could look up herself
      │  │                  (competitors, pricing, what other products do)
      │  │
      │  ├─ Bright Data SERP zone ──→ real Google results as JSON
      │  │                            (top 6, title + url + snippet)
      │  │
      │  └─ composeFromResearch(transcript, findings, history)
      │     └→ second model pass, grounded in what actually came back
      │        └→ becomes a "build" ↓
      │
      └─ "build" ────────── she has enough to be specific
         │
         ├─ write 2–4 message rows   (transcript, reply, research?, prompt)
         ├─ record a build           status = pending
         ├─ award XP                 +10, atomically, in the database
         │
         └─ return { reply, builderPrompt, buildId, sources, mood, pet }
            │
            ├─ Roisin speaks the reply         (Speechmatics TTS)
            ├─ the avatar animates the mood
            │
            └─ builderPrompt → where are we running?
               │
               ├─ DESKTOP ── main process types it into native.builder
               │             └→ PATCH /api/builds/:id  status = sent | failed
               │
               └─ BROWSER ── shown in chat and copied to your clipboard
                             (no builder window to type into)
```

### Why an action is only honoured if it carries its payload

A `"build"` with no `builderPrompt` would award build XP and play the
celebration animation for nothing. A `"research"` with no query would bill
Bright Data for an empty search. Both are demoted to `"chat"` before anything
acts on them.

### Why "research" and not "ask"

The model's instinct is to ask the user for information it could find itself —
including asking someone to name their own competitors. That is the model's
homework, not yours. The rule is now mechanical: **any comparative claim**
("better than what's out there", "like X but", "what everyone else charges")
**means research.**

It took three attempts at the prompt to make that stick.

---

## What research actually changes

Ask for *"a workout tracker, better than what's already out there"*:

**Without research** — the model describes a workout tracker from memory.
Generic, and possibly describing products that no longer exist.

**With research** — Bright Data returns Hevy, Strong, and three review
round-ups, and the instruction that reaches native.builder names drop-set
marking, failure sets, CSV export, Apple Health, and Siri Shortcuts. Real
features from real products, found seconds earlier.

That is the difference between "she types what you said" and "she did the
work".

---

## File structure

```
app/                              Next.js routes
├── page.tsx                      /        → redirects to /orbit
├── layout.tsx                    root layout + global styles
├── globals.css                   design tokens, auth and companion styling
├── login/                        /login   username + password
├── orbit/page.tsx                /orbit   → the public showcase
├── companion/                    /companion  signed-in surface, XP meter
└── api/
    ├── conversation/             the brain — everything above happens here
    ├── speech/token/             mints 2-minute Speechmatics JWTs
    ├── speech/tts/               proxies TTS so the API key stays server-side
    ├── builds/[id]/              resolves a build: pending → sent | failed
    ├── system/health/            which services are configured
    └── github/commit/            writes a file via the GitHub App

server/                           server-only logic
├── server.ts                     Supabase client + getUser()
├── auth.ts                       sign-up, login, logout
├── env.ts                        env lookups, with legacy name fallbacks
├── types.ts                      Zod schemas — the shape of everything
├── roisin.ts                     her prompt, her reasoning, both passes
├── brightdata.ts                 SERP research + page unlocker
├── PetService.ts                 pet lookup, updates, atomic XP
└── ConversationService.ts        messages and the build ledger

orbit/                            SOURCE OF TRUTH for the avatar
├── avatar-companion.js           the Web Component — sprites, chat, menus
├── speech-bridge.js              Flow → Realtime → browser, one event API
├── voice.js                      TTS playback, one voice per avatar
├── demo.html                     the public showcase
├── service-worker.js             PWA caching
├── orbit-*.png                   sprite atlases, 4 characters
└── desktop/                      Electron shell
    ├── main.js                   windows, tray, IPC, positioning
    ├── preload.js                the ONLY bridge into the renderer
    ├── desktop.js                renderer logic
    ├── api-session.js            holds the session; makes authed calls
    ├── builder-window.js         hosts native.builder, types into it
    └── builder-preload.js        deliberately empty — no bridge back

public/orbit/                     GENERATED copy of orbit/ — do not edit
supabase/schema.sql               the entire database, in one file
scripts/
├── sync-orbit-assets.mjs         orbit/ → public/orbit/  (CI checks this)
├── package-desktop.mjs           builds the download ZIPs
└── provision-supabase.mjs        creates a project and applies the schema
tests/                            58 unit tests
docs/                             this file, architecture, deployment, handoff
```

### Two rules about the layout

**`orbit/` is the source of truth.** `public/orbit/` is a generated copy so the
static showcase and the Next app can serve the same component without a
bundler. Edit `orbit/`, run `npm run sync:orbit`. CI fails if the copy is
stale — editing the copy directly is how the two silently drift apart.

**The renderer never holds a secret.** It runs from `file://`, so it has no
session and no cookie jar. The Electron main process owns the session and makes
every authenticated call; `preload.js` exposes a narrow, allow-listed bridge.
The native.builder window gets a preload that exposes *nothing*, so a
third-party page has no route back into Orbit.

---

## Data model

Four owner-scoped tables, all under row level security. The publishable key
ships inside the browser bundle, so anything RLS does not cover is public.

| Table | Holds | Notable |
| --- | --- | --- |
| `profiles` | username per account | `citext`, so a name can't be claimed twice under different capitalisation |
| `pets` | the companion | one per account (unique `user_id`); `level` is a generated column derived from `xp` |
| `messages` | one row per message | indexed `(pet_id, created_at desc)` — the only way it is read |
| `builds` | every instruction sent to native.builder | the only record it happened; the builder can't be queried |

Moods and skins are **enums**, not free text — the sprite sheets animate a
fixed set, so an invented mood fails on write rather than silently rendering
idle. XP moves only through `award_xp()`, in one statement, because
read-modify-write from the app loses an award when two replies overlap.

---

## Running it

```bash
npm install
npm run dev                # http://localhost:3000/orbit
cd orbit && npm run dev    # desktop Roisin
```

| Command | Does |
| --- | --- |
| `npm run verify` | everything CI runs: typecheck, tests, asset sync, build |
| `npm run sync:orbit` | regenerate `public/orbit/` from `orbit/` |
| `npm run package:desktop` | rebuild the download ZIPs |
| `npm run supabase:provision` | create a project and apply the schema |

`GET /api/system/health` reports which services are configured, without
revealing any values.

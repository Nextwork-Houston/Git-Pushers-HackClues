# Git Pushers HackClues

**Say it. Roisin builds it.**

Roisin is a voice companion who sits on your desktop and turns what you say into
working software by driving [native.builder](https://builder.nativelyai.com).
You describe what you want out loud; she works out what you actually meant,
writes a precise build instruction, and puts it into native.builder for you.

Live: **https://git-pushers-hackclues-orbit.vercel.app/orbit**

## How she works

1. **You talk.** Speechmatics transcribes you in real time — Flow when it is
   available, Realtime otherwise, the browser engine as a last resort.
2. **She thinks.** Rambling speech becomes one specific, self-contained
   instruction, with the right partner named (Speechmatics for speech, Supabase
   for data, Bright Data for scraping) so the builder does not reach for a
   generic library.
3. **She acts.** The desktop shell opens native.builder in a visible window and
   types the instruction into its chat.
4. **She levels up.** Every exchange earns XP; builds earn more than chat.

native.builder has no public API, so "acting" means using its interface the way
a person would, in your own signed-in session, in a window you can watch. See
[the architecture notes](docs/ORBIT_ARCHITECTURE.md) for why.

## Surfaces

| Surface | Where | Sign-in |
| --- | --- | --- |
| Public showcase | `/orbit` | no |
| Signed-in companion | `/companion` | yes |
| Desktop companion | `/orbit/downloads/` | yes, for voice |

## Running it

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

- Showcase: http://localhost:3000/orbit
- Companion: http://localhost:3000/companion (redirects to `/login` first)

Desktop shell:

```bash
cd orbit
npm install
npm run dev
```

From a downloaded ZIP, run `install-orbit-desktop.cmd` (Windows),
`install-orbit-desktop.sh` (macOS and Linux). It installs Electron on first
launch.

## Configuration

Everything lives in `.env.local`; see [.env.example](.env.example) for the full
list. The ones that matter:

| Variable | Needed for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sign-in, pets, history |
| `SPEECHMATICS_API_KEY` | real transcription |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | Roisin's reasoning |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` | committing files on your behalf |

`GET /api/system/health` reports which of these are configured, without
revealing any values.

Desktop settings live in `orbit/desktop/desktop-config.json`: `conversationUrl`,
`speechTokenUrl`, `builderUrl`, and `builderSelectors` for when native.builder's
markup changes.

## Database

Run [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL editor. It is
the whole database in one file: enums, `profiles`, `pets`, `messages`, `builds`,
row level security on all four, and the trigger that gives every new account a
companion.

It drops the Orbit tables before recreating them, so running it discards
existing Orbit data. That is deliberate — incremental migrations guarded with
`if not exists` silently skipped tables that had been created by hand with a
different shape, which is how the schema drifted out of sync with the code.

## Verifying

```bash
npm run verify   # typecheck, tests, asset sync check, production build
```

Individually: `npm run typecheck`, `npm test`, `npm run sync:orbit:check`,
`npm run build`.

`orbit/` is the source of truth for the avatar and speech bridge; `public/orbit/`
is a generated copy. Edit `orbit/`, then run `npm run sync:orbit`. CI fails if
the copy is stale.

## Repository layout

```text
app/                    Next routes, pages, and API handlers
server/                 Supabase clients, services, and Roisin's reasoning
orbit/                  Avatar component, speech bridge, Electron shell
public/orbit/           Published copy of the Orbit assets (generated)
supabase/migrations/    Schema and row level security
scripts/                Repository tooling
tests/                  Unit tests
docs/                   Architecture and deployment
```

## Security notes

- The Speechmatics API key stays server-side. The browser receives a JWT that
  expires in two minutes, minted by `/api/speech/token`.
- Row level security is the real boundary on user data; the `user_id` filters in
  the services are defence in depth.
- Never put secrets in `desktop-config.json` — it ships inside the download.
- Keep Electron context isolation and sandboxing enabled.
- The native.builder window has no bridge back into Orbit.

## License

No open-source license has been declared. All rights remain with the repository
owners unless a license is added.

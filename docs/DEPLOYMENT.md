# Deployment

## Vercel

The project is linked as `git-pushers-hackclues-orbit`. Pushing to `main`
deploys production; any other branch gets a preview URL.

```bash
npx vercel          # preview
npx vercel --prod   # production
```

`vercel.json` exposes `/orbit` publicly and sets download and service-worker
headers.

### Environment variables

The API routes will not work in production until these are set in the Vercel
project. Without them the routes answer `503` and Roisin cannot reply, even
though the showcase page still loads.

| Variable | Consequence if missing |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | sign-in fails |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sign-in fails |
| `SPEECHMATICS_API_KEY` | `/api/speech/token` returns 503; speech drops to the browser engine |
| `SPEECHMATICS_FLOW_TEMPLATE_ID` | Flow falls back to the default template |
| `LLM_API_KEY` | `/api/conversation` returns 502; Roisin cannot think |
| `LLM_BASE_URL`, `LLM_MODEL` | defaults are used |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` | `/api/github/commit` fails |

Paste `GITHUB_APP_PRIVATE_KEY` as the full `.pem` contents, BEGIN and END lines
included.

Check the result at `GET /api/system/health`, which reports which services are
configured without revealing any values.

## Database

Apply `supabase/migrations/0001_init.sql` to the Supabase project before the
first sign-in. It creates the tables, enables row level security, and adds the
trigger that provisions a companion for every new account.

Applying it is safe to repeat; the statements are written to be idempotent.

## Desktop release bundle

The hosted ZIP files contain the Electron source, component assets, and the
per-platform install scripts. Rebuild whenever anything in `orbit/` changes —
including `speech-bridge.js` and the desktop config — or downloaded copies will
keep the old behaviour.

Signed packages should be produced in CI on their native operating systems:
Windows for the signed installer, macOS for the notarized app, Linux for the
AppImage or distribution package.

## Verification checklist

- `npm run verify` passes.
- `/orbit` loads without signing in and the microphone button transcribes.
- `/login` accepts a new account and lands on `/companion`.
- `/companion` shows the XP meter and Roisin replies to speech.
- Both download links return `200`.
- Dragging the desktop avatar moves the window without opening chat.
- Size and position survive a restart.
- Asking for a build opens native.builder and types the instruction into it.
- `GET /api/system/health` reports `ok`.

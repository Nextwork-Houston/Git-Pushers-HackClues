# Supabase handoff

## Why there is a second project

The original project (`oiinfrecpkftmornugeb`) belongs to a teammate's account,
so nobody else could apply schema changes to it. Sign-up was failing because
the database was missing `profiles.username` and `conversations.user_id`, and
the fix could not be applied without dashboard access.

Rather than block, a second project was created from
[`supabase/schema.sql`](../supabase/schema.sql), which is the complete schema in
one file. Nothing was changed in the original project — it is still there,
untouched, if we decide to go back to it.

## What to review

The schema is a redesign, not a copy of what was there before. The parts worth
disagreeing with:

**Messages are rows, not a `jsonb` column.** The previous `conversations.messages`
array meant every reply rewrote the whole history, so two replies arriving
together could lose one another. Now `messages` has one row per message,
indexed `(pet_id, created_at desc)` because that is the only way it is read.

**XP moves through `award_xp()` only.** The application used to read `xp`, add
to it, and write it back, which loses an award when two replies overlap. The
function does it in one statement. `pets.level` is a generated column derived
from `xp`, so the two cannot disagree, and `ModifyPetSchema` deliberately has
no `xp` field so nothing can set it directly.

**Moods and skins are enums.** The sprite sheets animate a fixed set, so an
invented mood should fail on write rather than silently render as idle. The
conversation route validates the model's free-text mood against the same enum
before it reaches the column.

**One pet per account**, enforced by a unique constraint on `pets.user_id`.
That is what lets the app look up "my pet" without choosing between duplicates.

**A `builds` table.** native.builder has no API to query after the fact, so
this is the only record that an instruction was sent. XP history and a build
log both come from here.

**`username` is `citext`** so a name cannot be claimed twice under different
capitalisation, and availability is checked through the security-definer
function `username_available()` rather than by exposing the table to `anon`.

**Row level security is on for all four tables**, owner-scoped by `auth.uid()`.
This matters more than it looks: the publishable key ships inside the browser
bundle, so anything RLS does not cover is public. `messages.user_id` and
`builds.user_id` are denormalised from `pets` specifically so a policy can be
checked without a subquery on every read.

## If you want to change something

`supabase/schema.sql` is the whole database. Edit it, run it in the SQL editor,
and the result is correct regardless of prior state — it drops the Orbit tables
before recreating them.

That destructiveness is deliberate. The earlier incremental migrations were
guarded with `if not exists`, which silently skipped tables that already
existed with a different shape. That is exactly how the schema drifted out of
sync with the code and broke sign-in, and it failed silently for days.

If we move to incremental migrations later, they need to be written against the
real prior state and verified against a live database, not assumed.

## Moving back to the original project

Nothing is coupled to the project ref. Point these at whichever project should
win and redeploy:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Both live in `.env.local` locally and in the Vercel project's environment
variables for production. Run `supabase/schema.sql` against the target project
first, or sign-in will fail the same way it did before.

`GET /api/system/health` reports which services are configured without
revealing any values, and is the quickest way to confirm a switch worked.

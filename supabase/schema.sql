-- ===========================================================================
-- Orbit / Roisin — complete database schema.
--
-- This file is the whole database. Run it in the Supabase SQL editor and the
-- result is a correct schema regardless of what was there before. It replaces
-- the earlier incremental migrations, which could not be trusted: they were
-- guarded with "if not exists" and therefore did nothing on tables that had
-- already been created by hand with a different shape.
--
-- DESTRUCTIVE. The drops below remove any existing Orbit data.
-- ===========================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- Reset
--
-- Dropped in dependency order. `cascade` also removes the policies, indexes,
-- and constraints attached to each table.
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.builds cascade;
drop table if exists public.messages cascade;
drop table if exists public.conversations cascade;
drop table if exists public.pets cascade;
drop table if exists public.profiles cascade;

drop type if exists public.avatar_skin cascade;
drop type if exists public.build_status cascade;
drop type if exists public.message_kind cascade;
drop type if exists public.message_role cascade;
drop type if exists public.pet_mood cascade;

-- ---------------------------------------------------------------------------
-- Types
--
-- Enums rather than free text: the sprite sheets only animate a fixed set of
-- moods, so a typo should fail on write instead of silently rendering idle.
-- ---------------------------------------------------------------------------
create type public.pet_mood as enum (
  'idle', 'happy', 'sad', 'angry', 'curious',
  'thinking', 'love', 'confused', 'celebrate'
);

create type public.avatar_skin as enum ('classic', 'electric', 'dove', 'pink');

create type public.message_role as enum ('user', 'assistant', 'system');

create type public.message_kind as enum (
  'text', 'transcript', 'builder_prompt', 'tool_result', 'error'
);

create type public.build_status as enum ('pending', 'sent', 'failed');

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  -- citext so "Roisin" and "roisin" cannot both be registered.
  username     citext not null unique check (char_length(username) between 3 and 32),
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- pets
--
-- One companion per account. The unique constraint on user_id is what lets
-- the application look up "my pet" without choosing between duplicates.
-- ---------------------------------------------------------------------------
create table public.pets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references auth.users (id) on delete cascade,
  name       text not null default 'Roisin' check (char_length(name) between 1 and 40),
  skin       public.avatar_skin not null default 'pink',
  xp         integer not null default 0 check (xp >= 0),
  -- Derived, so the level can never disagree with the XP that produced it.
  level      integer generated always as (xp / 100 + 1) stored,
  mood       public.pet_mood not null default 'idle',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- messages
--
-- One row per message. The previous design kept the whole history in a single
-- jsonb column, which meant every append rewrote the entire conversation and
-- two concurrent replies could lose one another.
--
-- user_id is denormalised from pets so a policy can be checked without a
-- subquery on every read.
-- ---------------------------------------------------------------------------
create table public.messages (
  id            uuid primary key default gen_random_uuid(),
  pet_id        uuid not null references public.pets (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          public.message_role not null,
  kind          public.message_kind not null default 'text',
  content       text not null check (char_length(content) between 1 and 20000),
  input_tokens  integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  created_at    timestamptz not null default now()
);

-- Reading a conversation means "the newest N for this pet", so the index
-- carries the sort order.
create index messages_pet_created_idx on public.messages (pet_id, created_at desc);

-- ---------------------------------------------------------------------------
-- builds
--
-- Every instruction Roisin hands to native.builder. Kept because the builder
-- has no API to query afterwards: this table is the only record that a build
-- was requested, and it is what an XP or history view is built from.
-- ---------------------------------------------------------------------------
create table public.builds (
  id           uuid primary key default gen_random_uuid(),
  pet_id       uuid not null references public.pets (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  message_id   uuid references public.messages (id) on delete set null,
  prompt       text not null check (char_length(prompt) between 1 and 20000),
  status       public.build_status not null default 'pending',
  error        text,
  delivered_at timestamptz,
  created_at   timestamptz not null default now()
);

create index builds_user_created_idx on public.builds (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Timestamps
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger pets_touch_updated_at
  before update on public.pets
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- This is the real boundary. The anon key ships inside the browser bundle, so
-- anything not covered here is public.
-- ---------------------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.pets      enable row level security;
alter table public.messages  enable row level security;
alter table public.builds    enable row level security;

create policy "profiles: owner reads"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: owner creates" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: owner updates" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "pets: owner reads"   on public.pets for select using (auth.uid() = user_id);
create policy "pets: owner creates" on public.pets for insert with check (auth.uid() = user_id);
create policy "pets: owner updates" on public.pets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "pets: owner deletes" on public.pets for delete using (auth.uid() = user_id);

create policy "messages: owner reads"   on public.messages for select using (auth.uid() = user_id);
create policy "messages: owner creates" on public.messages for insert with check (auth.uid() = user_id);
create policy "messages: owner deletes" on public.messages for delete using (auth.uid() = user_id);

create policy "builds: owner reads"   on public.builds for select using (auth.uid() = user_id);
create policy "builds: owner creates" on public.builds for insert with check (auth.uid() = user_id);
create policy "builds: owner updates" on public.builds for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Username availability
--
-- Checked during sign-up, before the account exists, so it must be callable
-- anonymously. Security definer means only a boolean escapes; the table stays
-- closed to the anon role.
-- ---------------------------------------------------------------------------
create or replace function public.username_available(candidate text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (select 1 from public.profiles where username = candidate::citext);
$$;

grant execute on function public.username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Awarding XP
--
-- Done in one statement so two replies arriving together cannot both read the
-- same starting value and overwrite each other's award.
-- ---------------------------------------------------------------------------
create or replace function public.award_xp(
  target_pet uuid,
  amount integer,
  next_mood public.pet_mood default null
)
returns public.pets
language plpgsql
security invoker
as $$
declare
  updated public.pets;
begin
  if amount < 0 then
    raise exception 'XP awards cannot be negative';
  end if;

  update public.pets
  set xp = xp + amount,
      mood = coalesce(next_mood, mood)
  where id = target_pet
    and user_id = auth.uid()
  returning * into updated;

  if updated is null then
    raise exception 'Pet not found for this account';
  end if;

  return updated;
end;
$$;

grant execute on function public.award_xp(uuid, integer, public.pet_mood) to authenticated;

-- ---------------------------------------------------------------------------
-- Provisioning
--
-- A new account gets a companion immediately, so the app never has to render
-- a signed-in user with nothing to talk to.
-- ---------------------------------------------------------------------------
create or replace function public.provision_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pets (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.provision_new_user();

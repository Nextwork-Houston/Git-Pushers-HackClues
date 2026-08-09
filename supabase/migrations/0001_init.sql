-- Orbit / Roisin baseline schema.
--
-- Every table is owner-scoped and protected by row level security, so the
-- public anon key can never read another account's pet or conversation.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, holds the username used for sign-in.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by their owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "a user may create their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "a user may update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Sign-up checks whether a username is taken before the account exists, so
-- that single lookup has to be readable while anonymous. Exposing only the
-- username column through a security-definer function keeps the table closed.
create or replace function public.username_available(candidate text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (select 1 from public.profiles where username = candidate);
$$;

grant execute on function public.username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- pets: the Orbit companion belonging to a user.
-- ---------------------------------------------------------------------------
create table if not exists public.pets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  pet_name        text not null default 'Roisin',
  xp              integer not null default 0 check (xp >= 0),
  spritesheet_url text not null default '/orbit/orbit-spritesheet-pink.png',
  mood            text not null default 'idle',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists pets_user_id_idx on public.pets (user_id);

alter table public.pets enable row level security;

create policy "pets are readable by their owner"
  on public.pets for select
  using (auth.uid() = user_id);

create policy "a user may create their own pet"
  on public.pets for insert
  with check (auth.uid() = user_id);

create policy "a user may update their own pet"
  on public.pets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "a user may delete their own pet"
  on public.pets for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- conversations: one message log per pet.
--
-- user_id is denormalised from pets so row level security can be enforced
-- without a subquery on every read.
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  pet_id     uuid primary key references public.pets (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  messages   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_id_idx on public.conversations (user_id);

alter table public.conversations enable row level security;

create policy "conversations are readable by their owner"
  on public.conversations for select
  using (auth.uid() = user_id);

create policy "a user may create their own conversation"
  on public.conversations for insert
  with check (auth.uid() = user_id);

create policy "a user may update their own conversation"
  on public.conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
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

drop trigger if exists pets_touch_updated_at on public.pets;
create trigger pets_touch_updated_at
  before update on public.pets
  for each row execute function public.touch_updated_at();

drop trigger if exists conversations_touch_updated_at on public.conversations;
create trigger conversations_touch_updated_at
  before update on public.conversations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Every new account gets a pet and an empty conversation immediately, so the
-- app never has to handle a signed-in user with nothing to talk to.
-- ---------------------------------------------------------------------------
create or replace function public.provision_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_pet_id uuid;
begin
  insert into public.pets (user_id) values (new.id) returning id into new_pet_id;
  insert into public.conversations (pet_id, user_id) values (new_pet_id, new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.provision_new_user();

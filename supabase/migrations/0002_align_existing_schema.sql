-- Aligns an existing Orbit database with the schema the application expects.
--
-- 0001 uses `create table if not exists`, which silently does nothing when a
-- table already exists. The project's tables were created before that
-- migration was written, so they were skipped and ended up missing
-- `profiles.username` and `conversations.user_id`.
--
-- This migration is written to be safe on both a fresh database and one that
-- already has data, and to be safe to run more than once.

-- ---------------------------------------------------------------------------
-- profiles.username
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists username text;

-- Existing rows need a username before the column can be required. The local
-- part of the sign-in email is what the application would have stored.
update public.profiles as p
set username = split_part(u.email, '@', 1)
from auth.users as u
where p.id = u.id
  and p.username is null;

-- Anything still null has no matching auth user; fall back to the id so the
-- not-null constraint can be applied without dropping the row.
update public.profiles
set username = 'user_' || replace(id::text, '-', '')
where username is null;

alter table public.profiles
  alter column username set not null;

do $$
begin
  alter table public.profiles add constraint profiles_username_key unique (username);
exception
  when duplicate_table then null;   -- constraint already present
  when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- conversations.user_id
--
-- Denormalised from pets so row level security needs no subquery on reads.
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column if not exists user_id uuid;

update public.conversations as c
set user_id = p.user_id
from public.pets as p
where c.pet_id = p.id
  and c.user_id is null;

-- A conversation with no surviving pet cannot be attributed to anyone, and
-- leaving it would block the not-null constraint.
delete from public.conversations where user_id is null;

alter table public.conversations
  alter column user_id set not null;

do $$
begin
  alter table public.conversations
    add constraint conversations_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;
exception
  when duplicate_object then null;
end;
$$;

create index if not exists conversations_user_id_idx on public.conversations (user_id);
create index if not exists pets_user_id_idx on public.pets (user_id);

-- ---------------------------------------------------------------------------
-- Username availability
--
-- Sign-up checks this before the account exists, so it runs anonymously.
-- A security-definer function exposes only a boolean, keeping the table shut.
-- ---------------------------------------------------------------------------
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
-- Row level security
--
-- Enabling this is the point of the whole exercise: without it the public
-- anon key can read every row in every table.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.pets enable row level security;
alter table public.conversations enable row level security;

drop policy if exists "profiles are readable by their owner" on public.profiles;
create policy "profiles are readable by their owner"
  on public.profiles for select using (auth.uid() = id);

drop policy if exists "a user may create their own profile" on public.profiles;
create policy "a user may create their own profile"
  on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "a user may update their own profile" on public.profiles;
create policy "a user may update their own profile"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "pets are readable by their owner" on public.pets;
create policy "pets are readable by their owner"
  on public.pets for select using (auth.uid() = user_id);

drop policy if exists "a user may create their own pet" on public.pets;
create policy "a user may create their own pet"
  on public.pets for insert with check (auth.uid() = user_id);

drop policy if exists "a user may update their own pet" on public.pets;
create policy "a user may update their own pet"
  on public.pets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "a user may delete their own pet" on public.pets;
create policy "a user may delete their own pet"
  on public.pets for delete using (auth.uid() = user_id);

drop policy if exists "conversations are readable by their owner" on public.conversations;
create policy "conversations are readable by their owner"
  on public.conversations for select using (auth.uid() = user_id);

drop policy if exists "a user may create their own conversation" on public.conversations;
create policy "a user may create their own conversation"
  on public.conversations for insert with check (auth.uid() = user_id);

drop policy if exists "a user may update their own conversation" on public.conversations;
create policy "a user may update their own conversation"
  on public.conversations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Defaults, timestamps, and provisioning
-- ---------------------------------------------------------------------------
alter table public.pets alter column pet_name set default 'Roisin';
alter table public.pets alter column xp set default 0;
alter table public.pets alter column mood set default 'idle';
alter table public.pets alter column spritesheet_url set default '/orbit/orbit-spritesheet-pink.png';
alter table public.conversations alter column messages set default '[]'::jsonb;

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

-- Every new account gets a companion and an empty conversation immediately.
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

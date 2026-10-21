-- Thornvale save data. Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Only the game server (using the secret / service_role key) may read or write these tables:
-- row level security is on and there are no public policies.

create table if not exists public.accounts (
  name_key      text primary key,              -- character name in lower case
  display_name  text not null,
  salt          text not null,
  hash          text not null,                 -- scrypt(password, salt); the password itself is never stored
  created_at    timestamptz not null default now(),
  last_login    timestamptz
);

create table if not exists public.characters (
  name_key      text primary key references public.accounts (name_key) on delete cascade,
  display_name  text not null,
  data          jsonb not null,                -- the full save: level, exp, backpack, depot, bank, quests, spells…
  save_version  integer not null,              -- format version (src/game/save/migrate.ts)
  level         integer,
  vocation      text,
  updated_at    timestamptz not null default now()
);

-- A copy of a character is stored here before an update migrates it to a new save format,
-- so any migration can be rolled back.
create table if not exists public.character_backups (
  id            bigint generated always as identity primary key,
  name_key      text not null,
  data          jsonb not null,
  save_version  integer not null,
  reason        text,
  created_at    timestamptz not null default now()
);

create index if not exists character_backups_name_idx on public.character_backups (name_key, created_at desc);
create index if not exists characters_level_idx on public.characters (level desc);

alter table public.accounts enable row level security;
alter table public.characters enable row level security;
alter table public.character_backups enable row level security;

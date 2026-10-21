-- Thornvale save data. Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Only the game server (using the secret / service_role key) may read or write these tables:
-- row level security is on and there are no public policies.

-- Name + password logins, used only when the server runs without Supabase Auth (no SUPABASE_PUBLISHABLE_KEY).
create table if not exists public.accounts (
  name_key      text primary key,              -- character name in lower case
  display_name  text not null,
  salt          text not null,
  hash          text not null,                 -- scrypt(password, salt); the password itself is never stored
  created_at    timestamptz not null default now(),
  last_login    timestamptz
);

create table if not exists public.characters (
  name_key      text primary key,
  owner_id      uuid references auth.users (id) on delete set null,   -- email login (Supabase Auth) that owns it
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
create index if not exists characters_owner_idx on public.characters (owner_id);
create index if not exists characters_level_idx on public.characters (level desc);

alter table public.accounts enable row level security;
alter table public.characters enable row level security;
alter table public.character_backups enable row level security;

-- Player market: sell offers (items held in escrow) and deliveries waiting for characters
-- that were offline (gold from sales, items of expired offers). Written only by the game server.
create table if not exists public.market_offers (
  id            text primary key,
  seller_key    text not null,                 -- seller's character name in lower case
  seller_name   text not null,
  item_id       text not null,
  qty           integer not null check (qty > 0),
  price         bigint not null check (price > 0),   -- gold per piece
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);

create table if not exists public.market_deliveries (
  id            text primary key,
  name_key      text not null,                 -- character it belongs to, lower case
  gold          bigint not null default 0,
  items         jsonb not null default '[]'::jsonb,
  reason        text,
  created_at    timestamptz not null default now()
);

create index if not exists market_offers_seller_idx on public.market_offers (seller_key);
create index if not exists market_offers_item_idx on public.market_offers (item_id, price);
create index if not exists market_deliveries_name_idx on public.market_deliveries (name_key);

alter table public.market_offers enable row level security;
alter table public.market_deliveries enable row level security;

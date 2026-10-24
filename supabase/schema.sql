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

-- Premium accounts and founder packs (src/game/premium/premium.ts, server/payments.ts).
-- Additive only. Written only by the game server (service key); Row Level Security is on
-- with no policies, and the two functions can only be called with the service key.

-- One row per account (Supabase Auth user id). Everything here can be rebuilt from `purchases`.
-- No foreign key to auth.users on purpose: a payment for an unknown id must still be recorded.
create table if not exists public.account_perks (
  owner_id      uuid primary key,
  premium_until timestamptz,                                  -- null = never had premium
  founder_tier  text check (founder_tier in ('wayfarer', 'warden', 'legend')),
  founder_no    integer,                                      -- Legend number, never reused
  extra_slots   integer not null default 0,                   -- extra character slots (founders)
  founder_name  text,                                         -- shown on the Founders page and stone
  flagged       boolean not null default false,               -- a chargeback came in: owner should look
  updated_at    timestamptz not null default now()
);
create unique index if not exists account_perks_founder_no_idx on public.account_perks (founder_no) where founder_no is not null;

-- The ledger: every payment, refund and chargeback. Never deleted (accounting).
create table if not exists public.purchases (
  id            bigint generated always as identity primary key,
  provider      text not null,                                -- 'paddle'
  txn           text not null,                                -- provider transaction id
  owner_id      uuid not null,
  product       text not null,                                -- premium_30, founder_legend, …
  days          integer not null,
  tier          text,                                         -- founder tier it gave, if any
  amount_minor  bigint,                                       -- what was paid, in minor units
  currency      text,
  status        text not null default 'completed' check (status in ('completed', 'refunded', 'chargeback')),
  raw           jsonb,                                        -- the provider's event, for support
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (provider, txn)
);
create index if not exists purchases_owner_idx on public.purchases (owner_id);

alter table public.account_perks enable row level security;
alter table public.purchases enable row level security;

create or replace function public.thornvale_tier_rank(t text) returns integer
language sql immutable set search_path = public as $$
  select case t when 'legend' then 3 when 'warden' then 2 when 'wayfarer' then 1 else 0 end
$$;

create or replace function public.thornvale_tier_slots(t text) returns integer
language sql immutable set search_path = public as $$
  select case t when 'legend' then 2 when 'warden' then 1 else 0 end
$$;

-- Records a payment and grants it in one transaction. Idempotent: the same provider
-- transaction twice returns 'duplicate' and changes nothing.
-- Premium end = max(current end, p_start) + p_days (p_start is opening day for founder packs).
create or replace function public.thornvale_grant_purchase(
  p_provider text, p_txn text, p_owner uuid, p_product text, p_days integer, p_start timestamptz,
  p_tier text, p_amount_minor bigint, p_currency text, p_raw jsonb
) returns text
language plpgsql set search_path = public as $$
declare
  cur public.account_perks%rowtype;
  new_tier text;
  new_no integer;
begin
  insert into public.purchases (provider, txn, owner_id, product, days, tier, amount_minor, currency, status, raw)
  values (p_provider, p_txn, p_owner, p_product, p_days, p_tier, p_amount_minor, p_currency, 'completed', p_raw)
  on conflict (provider, txn) do nothing;
  if not found then
    return 'duplicate';
  end if;
  -- one grant at a time, so Legend numbers are handed out in order
  perform pg_advisory_xact_lock(4242001);
  insert into public.account_perks (owner_id) values (p_owner) on conflict (owner_id) do nothing;
  select * into cur from public.account_perks where owner_id = p_owner for update;
  new_tier := cur.founder_tier;
  if p_tier is not null and public.thornvale_tier_rank(p_tier) > public.thornvale_tier_rank(cur.founder_tier) then
    new_tier := p_tier;
  end if;
  new_no := cur.founder_no;
  if new_tier = 'legend' and new_no is null then
    select coalesce(max(founder_no), 0) + 1 into new_no from public.account_perks;
  end if;
  update public.account_perks set
    premium_until = greatest(coalesce(cur.premium_until, p_start), p_start) + make_interval(days => p_days),
    founder_tier = new_tier,
    founder_no = new_no,
    extra_slots = public.thornvale_tier_slots(new_tier),
    updated_at = now()
  where owner_id = p_owner;
  return 'granted';
end $$;

-- A refund takes back the premium days and recomputes the founder tier from the payments
-- that are left. A chargeback takes back the days and flags the account; looks stay until
-- the owner decides. Returns 'revoked', 'already' or 'unknown'.
create or replace function public.thornvale_revoke_purchase(p_provider text, p_txn text, p_kind text)
returns text
language plpgsql set search_path = public as $$
declare
  pur public.purchases%rowtype;
  best text;
begin
  select * into pur from public.purchases where provider = p_provider and txn = p_txn for update;
  if not found then
    return 'unknown';
  end if;
  if pur.status <> 'completed' then
    return 'already';
  end if;
  update public.purchases
    set status = case when p_kind = 'chargeback' then 'chargeback' else 'refunded' end, updated_at = now()
    where id = pur.id;
  perform pg_advisory_xact_lock(4242001);
  if p_kind = 'chargeback' then
    update public.account_perks
      set premium_until = premium_until - make_interval(days => pur.days), flagged = true, updated_at = now()
      where owner_id = pur.owner_id;
  else
    select tier into best from public.purchases
      where owner_id = pur.owner_id and status = 'completed' and tier is not null
      order by public.thornvale_tier_rank(tier) desc limit 1;
    update public.account_perks
      set premium_until = premium_until - make_interval(days => pur.days),
          founder_tier = best,
          extra_slots = public.thornvale_tier_slots(best),
          updated_at = now()
      where owner_id = pur.owner_id;
  end if;
  return 'revoked';
end $$;

-- Functions are callable by everyone by default: only the server may use these.
revoke execute on function public.thornvale_grant_purchase(text, text, uuid, text, integer, timestamptz, text, bigint, text, jsonb) from public, anon, authenticated;
revoke execute on function public.thornvale_revoke_purchase(text, text, text) from public, anon, authenticated;
grant execute on function public.thornvale_grant_purchase(text, text, uuid, text, integer, timestamptz, text, bigint, text, jsonb) to service_role;
grant execute on function public.thornvale_revoke_purchase(text, text, text) to service_role;
-- Account flags (tutorial): an account that has finished Wayfarer's Isle once may let its later
-- characters skip it. account_key = 'auth:<Supabase Auth user id>' or 'name:<name_key>'. Server only.
create table if not exists public.account_flags (
  account_key       text primary key,
  tutorial_done_at  timestamptz,
  created_at        timestamptz not null default now()
);

alter table public.account_flags enable row level security;

-- "Tell me when the gates open" (website). Migration 20261023_launch_signups.sql.
create table if not exists public.launch_signups (
  email              text primary key check (email = lower(email) and length(email) <= 254),
  source             text not null default 'website',
  unsubscribe_token  uuid not null unique default gen_random_uuid(),
  created_at         timestamptz not null default now()
);

alter table public.launch_signups enable row level security;

-- The Gilded Exchange (Grand Thornvale): buy/sell orders with escrow, collect boxes, trade history.
-- src/game/exchange/exchange.ts (rules), src/game/exchange/ExchangeSystem.ts (game), server/storage.ts.
-- Additive only: three new tables and one function. Written only by the game server (service key);
-- Row Level Security is on with no policies, and the function can only be called with the service key.

-- Open offers. The escrow is implied: a sell holds qty_left pieces, a buy holds qty_left × price gold.
create table if not exists public.exchange_orders (
  id          text primary key,
  owner_key   text not null,                                   -- owner's character name in lower case
  owner_name  text not null,
  side        text not null check (side in ('buy', 'sell')),
  item_id     text not null,
  qty         integer not null check (qty > 0),                -- pieces asked for when placed
  qty_left    integer not null check (qty_left > 0 and qty_left <= qty),
  price       bigint not null check (price > 0),               -- gold per piece
  seq         bigint not null,                                 -- time priority
  created_at  timestamptz not null default now()
);
create index if not exists exchange_orders_item_idx on public.exchange_orders (item_id, side, price);
create index if not exists exchange_orders_owner_idx on public.exchange_orders (owner_key);

-- What waits for each character: bought items, gold from sales, refunds, cancelled escrow.
create table if not exists public.exchange_boxes (
  owner_key   text primary key,
  gold        bigint not null default 0 check (gold >= 0),
  items       jsonb not null default '[]'::jsonb,              -- [{ "id": item id, "qty": pieces }]
  updated_at  timestamptz not null default now()
);

-- Every trade (price history; never needed to give anything back).
create table if not exists public.exchange_trades (
  id          text primary key,
  item_id     text not null,
  qty         integer not null check (qty > 0),
  price       bigint not null check (price > 0),               -- gold per piece (the older offer's price)
  buyer_key   text not null,
  seller_key  text not null,
  created_at  timestamptz not null default now()
);
create index if not exists exchange_trades_item_idx on public.exchange_trades (item_id, created_at desc);

alter table public.exchange_orders enable row level security;
alter table public.exchange_boxes enable row level security;
alter table public.exchange_trades enable row level security;

-- One Exchange change and the acting character's save, in ONE transaction: either everything
-- is stored or nothing is, so escrow can never be lost or duplicated by a crash.
--   p.character  { key, name, owner?, data, version, level, vocation } or null
--   p.drop       [order id]          p.orders  [order rows]
--   p.boxes      [box rows]          p.trades  [trade rows]
create or replace function public.thornvale_exchange_commit(p jsonb) returns void
language plpgsql set search_path = public as $$
declare
  c jsonb := p->'character';
begin
  if c is not null and jsonb_typeof(c) = 'object' then
    insert into public.characters (name_key, display_name, data, save_version, level, vocation, updated_at, owner_id)
    values (c->>'key', c->>'name', c->'data', (c->>'version')::int, (c->>'level')::int, c->>'vocation', now(), nullif(c->>'owner', '')::uuid)
    on conflict (name_key) do update set
      display_name = excluded.display_name, data = excluded.data, save_version = excluded.save_version,
      level = excluded.level, vocation = excluded.vocation, updated_at = now(),
      owner_id = coalesce(excluded.owner_id, public.characters.owner_id);
  end if;

  delete from public.exchange_orders
  where id in (select jsonb_array_elements_text(coalesce(p->'drop', '[]'::jsonb)));

  insert into public.exchange_orders (id, owner_key, owner_name, side, item_id, qty, qty_left, price, seq, created_at)
  select o.id, o.owner_key, o.owner_name, o.side, o.item_id, o.qty, o.qty_left, o.price, o.seq, to_timestamp(o.created_ms / 1000.0)
  from jsonb_to_recordset(coalesce(p->'orders', '[]'::jsonb))
    as o(id text, owner_key text, owner_name text, side text, item_id text, qty integer, qty_left integer, price bigint, seq bigint, created_ms double precision)
  on conflict (id) do update set qty_left = excluded.qty_left;

  insert into public.exchange_boxes (owner_key, gold, items, updated_at)
  select b.owner_key, b.gold, b.items, now()
  from jsonb_to_recordset(coalesce(p->'boxes', '[]'::jsonb)) as b(owner_key text, gold bigint, items jsonb)
  on conflict (owner_key) do update set gold = excluded.gold, items = excluded.items, updated_at = now();

  delete from public.exchange_boxes
  where owner_key in (select b->>'owner_key' from jsonb_array_elements(coalesce(p->'boxes', '[]'::jsonb)) b)
    and gold = 0 and items = '[]'::jsonb;

  insert into public.exchange_trades (id, item_id, qty, price, buyer_key, seller_key, created_at)
  select t.id, t.item_id, t.qty, t.price, t.buyer_key, t.seller_key, to_timestamp(t.at_ms / 1000.0)
  from jsonb_to_recordset(coalesce(p->'trades', '[]'::jsonb))
    as t(id text, item_id text, qty integer, price bigint, buyer_key text, seller_key text, at_ms double precision)
  on conflict (id) do nothing;
end;
$$;

revoke execute on function public.thornvale_exchange_commit(jsonb) from public, anon, authenticated;
grant execute on function public.thornvale_exchange_commit(jsonb) to service_role;

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

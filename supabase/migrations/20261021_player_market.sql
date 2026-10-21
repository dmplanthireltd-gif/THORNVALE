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

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

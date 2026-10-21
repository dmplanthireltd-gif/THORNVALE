-- Account flags (tutorial): an account that has finished Wayfarer's Isle once may let its later
-- characters skip it. One row per account. Written only by the game server.
--   account_key: 'auth:<Supabase Auth user id>' (email login) or 'name:<character name, lower case>'
create table if not exists public.account_flags (
  account_key       text primary key,
  tutorial_done_at  timestamptz,
  created_at        timestamptz not null default now()
);

alter table public.account_flags enable row level security;

-- Every email account that already owns a character played before the tutorial existed:
-- mark it as done, so its next characters may skip the island.
insert into public.account_flags (account_key, tutorial_done_at)
select distinct 'auth:' || owner_id::text, now()
from public.characters
where owner_id is not null
on conflict (account_key) do nothing;

-- Same for name + password accounts (only used when the server runs without email login).
insert into public.account_flags (account_key, tutorial_done_at)
select 'name:' || name_key, now()
from public.accounts
on conflict (account_key) do nothing;

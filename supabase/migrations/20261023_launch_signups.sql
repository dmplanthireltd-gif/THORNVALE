-- "Tell me when the gates open": emails of people who asked for launch news on the website.
-- Written only by the game server (POST /api/notify). Each row has its own unsubscribe token;
-- GET /api/notify/unsubscribe?token=... deletes the row. Delete the whole table's rows once the
-- launch emails have gone out (see the privacy policy).
create table if not exists public.launch_signups (
  email              text primary key check (email = lower(email) and length(email) <= 254),
  source             text not null default 'website',
  unsubscribe_token  uuid not null unique default gen_random_uuid(),
  created_at         timestamptz not null default now()
);

alter table public.launch_signups enable row level security;

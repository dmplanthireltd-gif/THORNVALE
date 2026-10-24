-- Bunker 47 (owner's separate co-op zombie game, served by this server; see server/bunker.ts):
-- one row per player per finished game, for the in-game leaderboard. Written and read only by
-- the game server (GET/POST /api/b47/scores). Nothing here is linked to Thornvale accounts.
create table if not exists public.b47_scores (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 1 and 16),
  round       integer not null check (round between 1 and 999),
  kills       integer not null default 0 check (kills >= 0),
  heads       integer not null default 0 check (heads >= 0),
  points      integer not null default 0 check (points >= 0),
  squad       smallint not null default 1 check (squad between 1 and 8),
  created_at  timestamptz not null default now()
);

create index if not exists b47_scores_rank on public.b47_scores (round desc, kills desc, created_at);

alter table public.b47_scores enable row level security;

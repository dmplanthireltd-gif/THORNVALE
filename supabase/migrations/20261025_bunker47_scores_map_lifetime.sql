-- Dead Locks (Bunker 47) leaderboard, part 2: remember which map each score was set on, and a lifetime
-- kill total per player name. Additive only: existing rows keep their data and count as 'bunker' (the only
-- map that existed when they were set). Read and written only by the game server (server/bunker.ts).
alter table public.b47_scores add column if not exists map text not null default 'bunker'
  check (map ~ '^[a-z]{2,12}$');

create index if not exists b47_scores_name on public.b47_scores (lower(name));

-- lifetime totals per player name (names are not accounts: the same name on two devices adds up)
create or replace view public.b47_lifetime with (security_invoker = on) as
  select min(name) as name, sum(kills)::bigint as kills, sum(heads)::bigint as heads, count(*)::integer as games,
         max(round) as best_round, max(created_at) as last_at
  from public.b47_scores
  group by lower(name);

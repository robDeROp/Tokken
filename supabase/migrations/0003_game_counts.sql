-- Count completed local practice games separately from completed online matches.
create table if not exists public.training_games (
  game_id uuid primary key,
  mode text not null check (mode in ('training', 'hulp', 'pro')),
  completed_at timestamptz not null default now()
);
alter table public.training_games enable row level security;
revoke all on table public.training_games from public, anon, authenticated;

-- The browser may submit only a finished practice-session id and a known mode.
-- The unique id makes retries idempotent; this table stores no player data.
create or replace function public.record_training_game(p_game_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_game_id is null or p_mode not in ('training', 'hulp', 'pro') then
    raise exception 'invalid_training_game';
  end if;
  insert into public.training_games(game_id, mode)
  values (p_game_id, p_mode)
  on conflict (game_id) do nothing;
end;
$$;
revoke all on function public.record_training_game(uuid, text) from public;
grant execute on function public.record_training_game(uuid, text) to anon, authenticated;

-- Online counts come from the existing match history; training sessions remain
-- separate so a future tournament can use completed online results only.
create or replace function public.scoreboard_counts()
returns table(training bigint, online bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.training_games),
    (select count(*) from public.game_results);
$$;
revoke all on function public.scoreboard_counts() from public;
grant execute on function public.scoreboard_counts() to anon, authenticated;

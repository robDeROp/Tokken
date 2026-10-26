-- Chat uses room codes so the browser and Edge Function share the same schema.
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  code text not null,
  at timestamptz not null default now(),
  player_id text not null,
  name text not null,
  color smallint,
  text text not null check (char_length(text) between 1 and 300)
);
create index if not exists chat_messages_code_at_idx on public.chat_messages(code, at desc, id desc);
alter table public.chat_messages enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chat_messages' and policyname = 'chat readable with the room code'
  ) then
    create policy "chat readable with the room code" on public.chat_messages
      for select to anon, authenticated using (true);
  end if;
end $$;
grant select on public.chat_messages to anon, authenticated;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- Keep a separate result for each rematch, and rank people by display name.
alter table public.games add column if not exists match_no integer not null default 0;
create table if not exists public.game_results (
  game_id uuid not null references public.games(id),
  match_no integer not null,
  seats jsonb not null,
  winner integer not null check (winner in (0,1)),
  finished_at timestamptz not null default now(),
  primary key (game_id, match_no)
);
alter table public.game_results enable row level security;

create or replace function public.record_game_result() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'playing' and old.status = 'lobby' then
    new.match_no := old.match_no + 1;
  end if;
  if new.status = 'finished' and old.status <> 'finished' then
    insert into public.game_results(game_id, match_no, seats, winner)
    values (new.id, new.match_no, new.seats, (new.state->>'winner')::int)
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists game_result on public.games;
create trigger game_result before update on public.games for each row execute function public.record_game_result();
insert into public.game_results(game_id, match_no, seats, winner, finished_at)
select id, match_no, seats, (state->>'winner')::int, updated_at from public.games
where status = 'finished' and state->>'winner' in ('0','1') on conflict do nothing;

create or replace function public.scoreboard() returns table(name text, played bigint, wins bigint)
language sql stable security definer set search_path = public as $$
  select min(trim(s.value->>'name')) as name, count(*) as played,
    count(*) filter (where ((s.ordinality - 1) % 2) = r.winner) as wins
  from public.game_results r cross join lateral jsonb_array_elements(r.seats) with ordinality as s(value, ordinality)
  where s.value->>'bot' = 'false' and length(trim(s.value->>'name')) > 0
  group by lower(trim(s.value->>'name'))
  order by wins desc, played asc, name asc limit 30;
$$;
revoke all on function public.record_game_result() from public, anon, authenticated;
revoke all on function public.scoreboard() from public;
grant execute on function public.scoreboard() to anon, authenticated;

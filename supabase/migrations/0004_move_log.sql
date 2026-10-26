-- Alle zetten bijhouden (online én oefenen), om later een AI op te trainen.
-- Per zet: de volledige stand vóór de zet (incl. alle handen), de gekozen actie en het resultaat.
create table if not exists public.move_log (
  id bigint generated always as identity primary key,
  game_id text not null,
  source text not null check (source in ('online', 'practice')),
  mode text not null,
  move_no int not null,
  round int,
  seat smallint not null,
  is_bot boolean not null default false,
  player_id text,
  player_name text,
  action jsonb not null,
  result jsonb,
  state_before jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists move_log_game_idx on public.move_log (game_id, move_no);
create index if not exists move_log_created_idx on public.move_log (created_at);
-- RLS aan, geen policies: enkel de server (service role) en de functie hieronder schrijven; niemand leest publiek.
alter table public.move_log enable row level security;

-- Oefenspellen lopen in de browser; die sturen hun zetten in groepjes door.
create or replace function public.log_practice_moves(p_game_id uuid, p_mode text, p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 60 then raise exception 'bad_rows'; end if;
  if p_mode not in ('training', 'hulp', 'pro') then raise exception 'bad_mode'; end if;
  if (select count(*) from public.move_log where game_id = p_game_id::text) > 4000 then return; end if;
  insert into public.move_log (game_id, source, mode, move_no, round, seat, is_bot, player_id, player_name, action, result, state_before)
  select p_game_id::text, 'practice', p_mode, (r->>'move_no')::int, (r->>'round')::int, (r->>'seat')::smallint,
         coalesce((r->>'is_bot')::boolean, false), coalesce(auth.uid()::text, 'anon'), left(r->>'player_name', 30),
         r->'action', r->'result', r->'state_before'
  from jsonb_array_elements(p_rows) r
  where r ? 'action' and r ? 'state_before' and pg_column_size(r) < 80000;
end $$;
revoke all on function public.log_practice_moves(uuid, text, jsonb) from public;
grant execute on function public.log_practice_moves(uuid, text, jsonb) to anon, authenticated;

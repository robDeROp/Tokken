-- Tokken: spellen (publiek leesbaar) en geheimen (enkel server)
create table public.games (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  mode text not null default 'training' check (mode in ('training', 'hulp', 'pro')),
  host_player text not null,
  players jsonb not null default '[]'::jsonb,          -- [{id, name}]
  seats jsonb not null default '[null,null,null,null]'::jsonb, -- per kleur: {playerId|null, name, bot}
  state jsonb,                                          -- publieke spelstand (zonder kaarten in handen)
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_secrets (
  game_id uuid primary key references public.games(id) on delete cascade,
  tokens jsonb not null default '{}'::jsonb,            -- token -> playerId
  full_state jsonb,
  host_user uuid
);

create table public.app_config (
  key text primary key,
  value jsonb not null
);
insert into public.app_config(key, value) values ('require_login_to_create', 'false'::jsonb);

alter table public.games enable row level security;
alter table public.game_secrets enable row level security;
alter table public.app_config enable row level security;

create policy "games are readable by everyone with the code"
  on public.games for select to anon, authenticated using (true);

alter publication supabase_realtime add table public.games;

create index games_updated_at_idx on public.games (updated_at);

-- games + game_secrets in één transactie bewaren, met versiecontrole
create or replace function public.save_game(
  p_id uuid, p_version int, p_status text, p_mode text, p_players jsonb, p_seats jsonb,
  p_state jsonb, p_tokens jsonb, p_full jsonb
) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.games
     set status = p_status, mode = p_mode, players = p_players, seats = p_seats, state = p_state,
         version = p_version + 1, updated_at = now()
   where id = p_id and version = p_version;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  update public.game_secrets set tokens = p_tokens, full_state = p_full where game_id = p_id;
  return true;
end $$;
revoke execute on function public.save_game(uuid, int, text, text, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_game(uuid, int, text, text, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;

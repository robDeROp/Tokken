-- Rating zoals bij schaken (Elo). Eén rating per Google-account, start op 1000.
-- Computers hebben een vaste rating per niveau (bot_ratings). Alle partijen worden gelogd in matches.

-- ---------- profielen ----------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Speler',
  avatar_url text,
  rating int not null default 1000,
  peak_rating int not null default 1000,
  games int not null default 0,
  wins int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select to anon, authenticated using (true);
grant select on public.profiles to anon, authenticated;

-- nieuw account = nieuw profiel (voornaam en foto van Google)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name, avatar_url)
  values (new.id,
          left(coalesce(nullif(split_part(new.raw_user_meta_data->>'full_name', ' ', 1), ''), nullif(new.raw_user_meta_data->>'name', ''), 'Speler'), 20),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into public.profiles (user_id, display_name, avatar_url)
select id, left(coalesce(nullif(split_part(raw_user_meta_data->>'full_name', ' ', 1), ''), 'Speler'), 20), raw_user_meta_data->>'avatar_url'
from auth.users on conflict (user_id) do nothing;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------- computers: vaste rating per niveau (aanpasbaar zonder nieuwe code) ----------
-- Gemeten met scripts/level-tournament.ts; houd gelijk met BOT_RATING in lib/engine.ts.
create table if not exists public.bot_ratings (level smallint primary key, rating int not null);
delete from public.bot_ratings where level not between 1 and 5;
insert into public.bot_ratings values (1, 450), (2, 700), (3, 1000), (4, 1130), (5, 1210)
on conflict (level) do update set rating = excluded.rating;
alter table public.bot_ratings enable row level security;
drop policy if exists "bot ratings readable" on public.bot_ratings;
create policy "bot ratings readable" on public.bot_ratings for select to anon, authenticated using (true);
grant select on public.bot_ratings to anon, authenticated;

-- ---------- alle partijen (online en oefenen) ----------
create table if not exists public.matches (
  id text primary key,
  source text not null check (source in ('online', 'practice')),
  mode text not null,
  room_code text,
  seats jsonb not null,             -- [{name, user_id, bot, level}] x4, in stoelvolgorde
  status text not null default 'playing' check (status in ('playing', 'finished')),
  winner smallint check (winner in (0, 1)),
  moves int,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rated boolean not null default false
);
create index if not exists matches_started_idx on public.matches (started_at desc);
alter table public.matches enable row level security;

-- welke Google-gebruiker achter een speler in een kamer zit (enkel de server schrijft/leest)
create table if not exists public.room_players (
  game_id uuid not null,
  player_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (game_id, player_id)
);
alter table public.room_players enable row level security;

create table if not exists public.rating_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  match_id text not null references public.matches(id) on delete cascade,
  rating_before int not null,
  rating_after int not null,
  delta int not null,
  won boolean not null,
  team_rating numeric not null,
  opp_rating numeric not null,
  at timestamptz not null default now(),
  unique (user_id, match_id)
);
create index if not exists rating_history_user_idx on public.rating_history (user_id, at desc);
alter table public.rating_history enable row level security;
drop policy if exists "rating history readable" on public.rating_history;
create policy "rating history readable" on public.rating_history for select to anon, authenticated using (true);
grant select on public.rating_history to anon, authenticated;

alter table public.move_log add column if not exists bot_level smallint;

-- ---------- Elo ----------
-- Ploegspel: stoel 0+2 tegen 1+3. Ploegrating = gemiddelde van beide spelers
-- (mens met account: zijn rating; mens zonder account: 1000; computer: rating van zijn niveau).
-- Verwachte score E = 1 / (1 + 10^((tegen - eigen) / 400)); verschil = K * (uitslag - E).
-- K = 40 voor je eerste 10 partijen, daarna 24.
create or replace function public.apply_match_result(p_match_id text, p_winner int, p_moves int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.matches;
  r numeric[] := array[1000, 1000, 1000, 1000];
  s jsonb; i int; uid uuid; pr public.profiles;
  team_r numeric; opp_r numeric; e numeric; k int; d int; won boolean;
  out jsonb := '[]'::jsonb;
begin
  if p_winner not in (0, 1) then raise exception 'bad_winner'; end if;
  select * into m from public.matches where id = p_match_id for update;
  if not found then raise exception 'no_match'; end if;
  if m.rated then return '[]'::jsonb; end if;
  for i in 0..3 loop
    s := m.seats->i;
    if coalesce((s->>'bot')::boolean, false) then
      r[i + 1] := coalesce((select b.rating from public.bot_ratings b where b.level = coalesce((s->>'level')::int, 3)), 1000);
    else
      uid := nullif(s->>'user_id', '')::uuid;
      if uid is not null then
        r[i + 1] := coalesce((select p.rating from public.profiles p where p.user_id = uid), 1000);
      end if;
    end if;
  end loop;
  for i in 0..3 loop
    s := m.seats->i;
    uid := nullif(s->>'user_id', '')::uuid;
    continue when coalesce((s->>'bot')::boolean, false) or uid is null;
    select * into pr from public.profiles where user_id = uid for update;
    continue when not found;
    team_r := (r[i + 1] + r[((i + 2) % 4) + 1]) / 2;
    opp_r := (r[((i + 1) % 4) + 1] + r[((i + 3) % 4) + 1]) / 2;
    e := 1 / (1 + power(10, (opp_r - team_r) / 400));
    won := (i % 2) = p_winner;
    k := case when pr.games < 10 then 40 else 24 end;
    d := round(k * ((case when won then 1 else 0 end) - e));
    update public.profiles set rating = rating + d, peak_rating = greatest(peak_rating, rating + d),
      games = games + 1, wins = wins + (case when won then 1 else 0 end), updated_at = now()
    where user_id = uid;
    insert into public.rating_history (user_id, match_id, rating_before, rating_after, delta, won, team_rating, opp_rating)
    values (uid, p_match_id, pr.rating, pr.rating + d, d, won, team_r, opp_r) on conflict do nothing;
    out := out || jsonb_build_object('seat', i, 'user_id', uid, 'before', pr.rating, 'after', pr.rating + d, 'delta', d, 'won', won);
  end loop;
  update public.matches set status = 'finished', winner = p_winner, finished_at = now(), rated = true,
    moves = coalesce(p_moves, moves) where id = p_match_id;
  return out;
end $$;
revoke all on function public.apply_match_result(text, int, int) from public, anon, authenticated;

-- ---------- oefenen (loopt in de browser) ----------
-- p_levels = niveaus van stoel 1, 2 (ploegmaat) en 3
create or replace function public.start_practice(p_id uuid, p_mode text, p_levels int[])
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; l int[] := array[3, 3, 3]; i int;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if p_mode not in ('training', 'hulp', 'pro') then raise exception 'bad_mode'; end if;
  for i in 1..3 loop l[i] := least(5, greatest(1, coalesce(p_levels[i], 3))); end loop;
  select * into me from public.profiles where user_id = auth.uid();
  insert into public.matches (id, source, mode, seats)
  values (p_id::text, 'practice', p_mode, jsonb_build_array(
    jsonb_build_object('name', coalesce(me.display_name, 'Speler'), 'user_id', auth.uid(), 'bot', false),
    jsonb_build_object('name', 'Robot Rik', 'bot', true, 'level', l[1]),
    jsonb_build_object('name', 'Robot Roos', 'bot', true, 'level', l[2]),
    jsonb_build_object('name', 'Robot Bert', 'bot', true, 'level', l[3])))
  on conflict (id) do nothing;
end $$;
revoke all on function public.start_practice(uuid, text, int[]) from public, anon;
grant execute on function public.start_practice(uuid, text, int[]) to authenticated;

-- Einde van een oefenspel: enkel je eigen partij, met genoeg gelogde zetten.
create or replace function public.finish_practice(p_id uuid, p_winner int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.matches; n int;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into m from public.matches where id = p_id::text;
  if not found or m.source <> 'practice' or (m.seats->0->>'user_id')::uuid is distinct from auth.uid() then raise exception 'no_match'; end if;
  if m.rated then return '[]'::jsonb; end if;
  select count(*) into n from public.move_log where game_id = p_id::text;
  if n < 30 then raise exception 'too_short'; end if;
  return public.apply_match_result(p_id::text, p_winner, n);
end $$;
revoke all on function public.finish_practice(uuid, int) from public, anon;
grant execute on function public.finish_practice(uuid, int) to authenticated;

-- Oefenzetten loggen, met het niveau van de computer die de zet deed
create or replace function public.log_practice_moves(p_game_id uuid, p_mode text, p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare seats jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 60 then raise exception 'bad_rows'; end if;
  if p_mode not in ('training', 'hulp', 'pro') then raise exception 'bad_mode'; end if;
  if (select count(*) from public.move_log where game_id = p_game_id::text) > 4000 then return; end if;
  select m.seats into seats from public.matches m where m.id = p_game_id::text;
  insert into public.move_log (game_id, source, mode, move_no, round, seat, is_bot, bot_level, player_id, player_name, action, result, state_before)
  select p_game_id::text, 'practice', p_mode, (r->>'move_no')::int, (r->>'round')::int, (r->>'seat')::smallint,
         coalesce((r->>'is_bot')::boolean, false),
         case when coalesce((r->>'is_bot')::boolean, false)
              then coalesce(nullif(r->>'bot_level', '')::smallint, (seats->((r->>'seat')::int)->>'level')::smallint) end,
         coalesce(auth.uid()::text, 'anon'), left(r->>'player_name', 30),
         r->'action', r->'result', r->'state_before'
  from jsonb_array_elements(p_rows) r
  where r ? 'action' and r ? 'state_before' and pg_column_size(r) < 80000;
end $$;
revoke all on function public.log_practice_moves(uuid, text, jsonb) from public;
grant execute on function public.log_practice_moves(uuid, text, jsonb) to anon, authenticated;

-- ---------- ranglijst: mensen (minstens 1 gespeelde partij) + de computers ----------
create or replace function public.leaderboard()
returns table(user_id uuid, name text, avatar_url text, rating int, games int, wins int, bot_level smallint)
language sql stable security definer set search_path = public as $$
  (select p.user_id, p.display_name, p.avatar_url, p.rating, p.games, p.wins, null::smallint
   from public.profiles p where p.games > 0 order by p.rating desc, p.games desc limit 100)
  union all
  (select null, null, null, b.rating, null, null, b.level from public.bot_ratings b)
  order by 4 desc;
$$;
revoke all on function public.leaderboard() from public;
grant execute on function public.leaderboard() to anon, authenticated;

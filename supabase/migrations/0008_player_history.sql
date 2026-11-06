-- Spelgeschiedenis per speler: rondes, speelduur en knikkers binnen per kleur bij elke partij.
alter table public.matches add column if not exists rounds int;
alter table public.matches add column if not exists lanes jsonb;

-- apply_match_result: ook rondes, starttijd en knikkers binnen per kleur bewaren
drop function if exists public.apply_match_result(text, int, int, int[]);
create or replace function public.apply_match_result(p_match_id text, p_winner int, p_moves int default null, p_home int[] default null,
  p_rounds int default null, p_lanes int[] default null, p_started timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.matches;
  r numeric[] := array[1000, 1000, 1000, 1000];
  h int[] := array[0, 0, 0, 0];
  s jsonb; i int; uid uuid; pr public.profiles;
  team_r numeric; opp_r numeric; e numeric; k int; d int; won boolean; humans int := 0; lvl int;
  sh numeric; f numeric; base numeric;
  bot_delta numeric[] := array[0, 0, 0, 0, 0, 0, 0, 0, 0];
  out jsonb := '[]'::jsonb;
begin
  if p_winner not in (0, 1) then raise exception 'bad_winner'; end if;
  select * into m from public.matches where id = p_match_id for update;
  if not found then raise exception 'no_match'; end if;
  if m.rated then return '[]'::jsonb; end if;
  if p_home is not null and array_length(p_home, 1) = 4 then
    for i in 1..4 loop h[i] := least(8, greatest(0, coalesce(p_home[i], 0))); end loop;
  end if;
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
    humans := humans + 1;
    team_r := (r[i + 1] + r[((i + 2) % 4) + 1]) / 2;
    opp_r := (r[((i + 1) % 4) + 1] + r[((i + 3) % 4) + 1]) / 2;
    e := 1 / (1 + power(10, (opp_r - team_r) / 400));
    won := (i % 2) = p_winner;
    k := case when pr.games < 10 then 40 else 24 end;
    sh := case when h[i + 1] + h[((i + 2) % 4) + 1] = 0 then 0.5 else h[i + 1]::numeric / (h[i + 1] + h[((i + 2) % 4) + 1]) end;
    f := 0.5 + sh;
    base := k * ((case when won then 1 else 0 end) - e);
    d := round(case when won then base * f else base * (2 - f) end);
    update public.profiles set rating = rating + d, peak_rating = greatest(peak_rating, rating + d),
      games = games + 1, wins = wins + (case when won then 1 else 0 end), updated_at = now()
    where user_id = uid;
    insert into public.rating_history (user_id, match_id, rating_before, rating_after, delta, won, team_rating, opp_rating, share, home_me, home_mate)
    values (uid, p_match_id, pr.rating, pr.rating + d, d, won, team_r, opp_r, sh, h[i + 1], h[((i + 2) % 4) + 1]) on conflict do nothing;
    out := out || jsonb_build_object('seat', i, 'user_id', uid, 'before', pr.rating, 'after', pr.rating + d, 'delta', d, 'won', won,
      'share', sh, 'homeMe', h[i + 1], 'homeMate', h[((i + 2) % 4) + 1], 'base', round(base));
  end loop;
  if humans > 0 then
    for i in 0..3 loop
      s := m.seats->i;
      continue when not coalesce((s->>'bot')::boolean, false);
      lvl := least(9, greatest(1, coalesce((s->>'level')::int, 3)));
      team_r := (r[i + 1] + r[((i + 2) % 4) + 1]) / 2;
      opp_r := (r[((i + 1) % 4) + 1] + r[((i + 3) % 4) + 1]) / 2;
      e := 1 / (1 + power(10, (opp_r - team_r) / 400));
      won := (i % 2) = p_winner;
      sh := case when h[i + 1] + h[((i + 2) % 4) + 1] = 0 then 0.5 else h[i + 1]::numeric / (h[i + 1] + h[((i + 2) % 4) + 1]) end;
      f := 0.5 + sh;
      base := 5 * ((case when won then 1 else 0 end) - e);
      bot_delta[lvl] := bot_delta[lvl] + (case when won then base * f else base * (2 - f) end);
    end loop;
    for lvl in 1..9 loop
      if bot_delta[lvl] <> 0 then
        update public.bot_ratings set rating = rating + round(bot_delta[lvl]) where level = lvl;
      end if;
    end loop;
  end if;
  update public.matches set status = 'finished', winner = p_winner, finished_at = now(), rated = true,
    moves = coalesce(p_moves, moves), home = case when p_home is null then null else to_jsonb(h) end,
    rounds = coalesce(p_rounds, rounds),
    lanes = case when p_lanes is not null and array_length(p_lanes, 1) = 4 then to_jsonb(p_lanes) else lanes end,
    started_at = case when p_started is not null and p_started < now() and p_started > now() - interval '1 day' then p_started else started_at end
  where id = p_match_id;
  return out;
end $$;
revoke all on function public.apply_match_result(text, int, int, int[], int, int[], timestamptz) from public, anon, authenticated;

drop function if exists public.finish_practice(uuid, int, int[]);
create or replace function public.finish_practice(p_id uuid, p_winner int, p_home int[] default null, p_rounds int default null, p_lanes int[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.matches; n int;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into m from public.matches where id = p_id::text;
  if not found or m.source <> 'practice' or (m.seats->0->>'user_id')::uuid is distinct from auth.uid() then raise exception 'no_match'; end if;
  if m.rated then return '[]'::jsonb; end if;
  select count(*) into n from public.move_log where game_id = p_id::text;
  if n < 30 then raise exception 'too_short'; end if;
  return public.apply_match_result(p_id::text, p_winner, n, p_home, p_rounds, p_lanes, null);
end $$;
revoke all on function public.finish_practice(uuid, int, int[], int, int[]) from public, anon;
grant execute on function public.finish_practice(uuid, int, int[], int, int[]) to authenticated;

-- Spelgeschiedenis van een speler (publiek, zoals de ranglijst): laatste uitgespeelde partijen met rating.
create or replace function public.player_history(p_user uuid, p_limit int default 30)
returns table(match_id text, source text, mode text, finished_at timestamptz, seconds int, rounds int, moves int,
  seat int, won boolean, delta int, rating_after int, home_me int, home_mate int, players jsonb, lanes jsonb, winner int)
language sql stable security definer set search_path = public as $$
  select m.id, m.source, m.mode, m.finished_at,
    case when m.finished_at is not null and m.finished_at > m.started_at then extract(epoch from (m.finished_at - m.started_at))::int end,
    m.rounds, m.moves,
    (select (x.ord - 1)::int from jsonb_array_elements(m.seats) with ordinality x(v, ord) where x.v->>'user_id' = p_user::text limit 1),
    h.won, h.delta, h.rating_after, h.home_me, h.home_mate,
    (select jsonb_agg(jsonb_build_object('name', x.v->>'name', 'bot', coalesce((x.v->>'bot')::boolean, false), 'level', (x.v->>'level')::int,
        'me', x.v->>'user_id' = p_user::text) order by x.ord) from jsonb_array_elements(m.seats) with ordinality x(v, ord)),
    m.lanes, m.winner
  from public.rating_history h join public.matches m on m.id = h.match_id
  where h.user_id = p_user
  order by h.at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;
revoke all on function public.player_history(uuid, int) from public;
grant execute on function public.player_history(uuid, int) to anon, authenticated;

create or replace function public.player_profile(p_user uuid)
returns table(user_id uuid, name text, avatar_url text, rating int, peak_rating int, games int, wins int, since timestamptz)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.display_name, p.avatar_url, p.rating, p.peak_rating, p.games, p.wins, p.created_at
  from public.profiles p where p.user_id = p_user;
$$;
revoke all on function public.player_profile(uuid) from public;
grant execute on function public.player_profile(uuid) to anon, authenticated;

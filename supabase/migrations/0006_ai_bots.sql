-- AI-computers (niveau 6–9): Jules, Mia, Staf, Bompa Fons. Ratings gemeten met scripts/ai-train/arena.ts.
insert into public.bot_ratings values (6, 1120), (7, 1260), (8, 1290), (9, 1390)
on conflict (level) do update set rating = excluded.rating;

create or replace function public.start_practice(p_id uuid, p_mode text, p_levels int[])
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; l int[] := array[3, 3, 3]; i int; robots text[] := array['Robot Rik', 'Robot Roos', 'Robot Bert'];
  names text[] := array[null, null, null]; base text; n int;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if p_mode not in ('training', 'hulp', 'pro') then raise exception 'bad_mode'; end if;
  for i in 1..3 loop
    l[i] := least(9, greatest(1, coalesce(p_levels[i], 3)));
    base := case l[i] when 6 then 'Jules' when 7 then 'Mia' when 8 then 'Staf' when 9 then 'Bompa Fons' else robots[i] end;
    names[i] := base; n := 2;
    while i > 1 and names[i] = any(names[1:i - 1]) loop names[i] := base || ' ' || n; n := n + 1; end loop;
  end loop;
  select * into me from public.profiles where user_id = auth.uid();
  insert into public.matches (id, source, mode, seats)
  values (p_id::text, 'practice', p_mode, jsonb_build_array(
    jsonb_build_object('name', coalesce(me.display_name, 'Speler'), 'user_id', auth.uid(), 'bot', false),
    jsonb_build_object('name', names[1], 'bot', true, 'level', l[1]),
    jsonb_build_object('name', names[2], 'bot', true, 'level', l[2]),
    jsonb_build_object('name', names[3], 'bot', true, 'level', l[3])))
  on conflict (id) do nothing;
end $$;
revoke all on function public.start_practice(uuid, text, int[]) from public, anon;
grant execute on function public.start_practice(uuid, text, int[]) to authenticated;

-- Bots leren hun rating uit spellen tegen mensen (met account): na elk spel schuift de rating van elk
-- bot-niveau een beetje (K = 5 per bot-stoel). Zo komt "Expert" vanzelf op de juiste plaats t.o.v. mensen.
create or replace function public.apply_match_result(p_match_id text, p_winner int, p_moves int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.matches;
  r numeric[] := array[1000, 1000, 1000, 1000];
  s jsonb; i int; uid uuid; pr public.profiles;
  team_r numeric; opp_r numeric; e numeric; k int; d int; won boolean; humans int := 0; lvl int;
  bot_delta numeric[] := array[0, 0, 0, 0, 0, 0, 0, 0, 0];
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
    humans := humans + 1;
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
  -- bots bijsturen, enkel als er een mens met account meespeelde
  if humans > 0 then
    for i in 0..3 loop
      s := m.seats->i;
      continue when not coalesce((s->>'bot')::boolean, false);
      lvl := least(9, greatest(1, coalesce((s->>'level')::int, 3)));
      team_r := (r[i + 1] + r[((i + 2) % 4) + 1]) / 2;
      opp_r := (r[((i + 1) % 4) + 1] + r[((i + 3) % 4) + 1]) / 2;
      e := 1 / (1 + power(10, (opp_r - team_r) / 400));
      bot_delta[lvl] := bot_delta[lvl] + 5 * ((case when (i % 2) = p_winner then 1 else 0 end) - e);
    end loop;
    for lvl in 1..9 loop
      if bot_delta[lvl] <> 0 then
        update public.bot_ratings set rating = rating + round(bot_delta[lvl]) where level = lvl;
      end if;
    end loop;
  end if;
  update public.matches set status = 'finished', winner = p_winner, finished_at = now(), rated = true,
    moves = coalesce(p_moves, moves) where id = p_match_id;
  return out;
end $$;
revoke all on function public.apply_match_result(text, int, int) from public, anon, authenticated;

-- Klaarmaken om live te spelen: oefenzetten enkel van een aangemelde speler in zijn eigen partij,
-- kleinere zettenlog (zonder kaartvolgorde van het pak), ontbrekende indexen.

create or replace function public.log_practice_moves(p_game_id uuid, p_mode text, p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare m public.matches;
begin
  if auth.uid() is null then return; end if;                       -- anoniem oefenen wordt niet gelogd
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 60 then raise exception 'bad_rows'; end if;
  if p_mode not in ('training', 'hulp', 'pro') then raise exception 'bad_mode'; end if;
  select * into m from public.matches where id = p_game_id::text;
  -- enkel je eigen oefenpartij, en niet lang na het einde
  if not found or m.source <> 'practice' or (m.seats->0->>'user_id')::uuid is distinct from auth.uid() then return; end if;
  if m.status = 'finished' and m.finished_at < now() - interval '10 minutes' then return; end if;
  if (select count(*) from public.move_log where game_id = p_game_id::text) > 4000 then return; end if;
  insert into public.move_log (game_id, match_id, source, mode, move_no, round, seat, is_bot, bot_level, player_id, player_name, action, result, state_before)
  select p_game_id::text, p_game_id::text, 'practice', p_mode, (r->>'move_no')::int, (r->>'round')::int, (r->>'seat')::smallint,
         coalesce((r->>'is_bot')::boolean, false),
         case when coalesce((r->>'is_bot')::boolean, false)
              then coalesce(nullif(r->>'bot_level', '')::smallint, (m.seats->((r->>'seat')::int)->>'level')::smallint) end,
         auth.uid()::text, left(r->>'player_name', 30),
         r->'action', r->'result',
         -- de volgorde van het pak is niet nodig om te leren (en is 60% van de grootte): enkel het aantal
         (r->'state_before' - 'deck' - 'center') || jsonb_build_object('deckCount', coalesce(jsonb_array_length(r->'state_before'->'deck'), 0))
  from jsonb_array_elements(p_rows) r
  where r ? 'action' and r ? 'state_before' and pg_column_size(r) < 80000;
end $$;
revoke all on function public.log_practice_moves(uuid, text, jsonb) from public, anon;
grant execute on function public.log_practice_moves(uuid, text, jsonb) to authenticated;

-- bestaande rijen inkrimpen
update public.move_log
set state_before = (state_before - 'deck' - 'center') || jsonb_build_object('deckCount', coalesce(jsonb_array_length(state_before->'deck'), 0))
where state_before ? 'deck';

create index if not exists rating_history_match_idx on public.rating_history (match_id);
create index if not exists room_players_user_idx on public.room_players (user_id);

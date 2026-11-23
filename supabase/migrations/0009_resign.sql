-- Opgeven in oefenspellen: telt als verlies (met rating zodra het spel lang genoeg is om te tellen).
alter table public.matches add column if not exists resigned boolean not null default false;

create or replace function public.resign_practice(p_id uuid, p_home int[] default null, p_rounds int default null, p_lanes int[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.matches; n int;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into m from public.matches where id = p_id::text;
  if not found or m.source <> 'practice' or (m.seats->0->>'user_id')::uuid is distinct from auth.uid() then raise exception 'no_match'; end if;
  if m.rated or m.status = 'finished' then return '[]'::jsonb; end if;
  select count(*) into n from public.move_log where game_id = p_id::text;
  update public.matches set resigned = true where id = p_id::text;
  if n < 30 then
    -- te kort om eerlijk te tellen: wel afgesloten en gelogd, geen rating
    update public.matches set status = 'finished', winner = 1, finished_at = now(), moves = n, rounds = coalesce(p_rounds, rounds) where id = p_id::text;
    return '[]'::jsonb;
  end if;
  return public.apply_match_result(p_id::text, 1, n, p_home, p_rounds, p_lanes, null);
end $$;
revoke all on function public.resign_practice(uuid, int[], int, int[]) from public, anon;
grant execute on function public.resign_practice(uuid, int[], int, int[]) to authenticated;

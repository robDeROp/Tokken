-- Niveau 10 "De Kloon" (speelt zoals de echte spelers) en nieuwe ratings na het nieuwe AI-netwerk.
-- De functies klemden niveaus af op 1..9: maak dat 1..10, zonder ze volledig te herschrijven.
do $$
declare r record; def text;
begin
  for r in select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('apply_match_result', 'start_practice') loop
    def := pg_get_functiondef(r.oid);
    if position('least(9,' in def) > 0 then execute replace(def, 'least(9,', 'least(10,'); end if;
  end loop;
end $$;
-- ratings: zie lib/engine.ts BOT_RATING (gemeten met scripts/ai-train/arena.ts)
-- nieuw netwerk (ronde 3): AI's ~30 Elo sterker; De Kloon gemeten tegen Staf (23% winst = -210)
insert into public.bot_ratings (level, rating) values (6, 1150), (7, 1290), (8, 1320), (9, 1420), (10, 1110)
on conflict (level) do update set rating = excluded.rating;

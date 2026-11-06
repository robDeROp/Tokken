'use client';
// Ranglijst met Elo-rating (mensen met een account + de computers met hun vaste rating).
import { useEffect, useState } from 'react';
import { sb } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { BOT_LEVEL_NAME, asLevel, isAiLevel } from '@/lib/engine';

type Row = { user_id: string | null; name: string | null; avatar_url: string | null; rating: number; games: number | null; wins: number | null; bot_level: number | null };

export default function Leaderboard({ userId }: { userId: string | null }) {
  const { t, lang } = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => sb().rpc('leaderboard').then(({ data, error }) => {
      if (!alive) return;
      if (error) setErr(true); else { setErr(false); setRows((data ?? []) as Row[]); }
    });
    void load();
    const timer = setInterval(() => { void load(); }, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  const humans = rows?.filter((r) => r.bot_level === null) ?? [];
  const me = humans.find((r) => r.user_id === userId);
  let rank = 0;
  return (
    <section className="panel leaderboard">
      <h2>{t.leaderboard}</h2>
      <p className="muted small">{t.leaderboardHelp}</p>
      {err ? <p className="muted small">{lang === 'nl' ? 'De ranglijst is nog niet bereikbaar.' : 'The leaderboard is not available yet.'}</p>
        : !rows ? <p>{lang === 'nl' ? 'Laden…' : 'Loading…'}</p> : <>
          {me && <p className="small">{t.yourRating}: <strong>{me.rating}</strong> · {me.games} {t.games}</p>}
          {!humans.length && <p className="muted small">{t.leaderboardEmpty}</p>}
          <ol>
            {rows.map((r) => {
              if (r.bot_level !== null) {
                const l = asLevel(r.bot_level);
                return (
                  <li key={`bot-${l}`} className="lb-bot">
                    <span className="score-rank">{isAiLevel(l) ? '🧠' : '🤖'}</span>
                    <strong>{BOT_LEVEL_NAME[l][lang]}</strong>
                    <span><b>{r.rating}</b> <small className="muted">{isAiLevel(l) ? 'AI' : t.bot}</small></span>
                  </li>
                );
              }
              rank++;
              return (
                <li key={r.user_id} className={r.user_id === userId ? 'lb-me' : ''}>
                  <span className="score-rank">{rank}</span>
                  <strong>{r.name}</strong>
                  <span><b>{r.rating}</b> <small className="muted">{r.wins}/{r.games} {lang === 'nl' ? 'gewonnen' : 'won'}</small></span>
                </li>
              );
            })}
          </ol>
        </>}
    </section>
  );
}

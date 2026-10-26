'use client';
import { useEffect, useState } from 'react';
import { sb } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
type Score = { name: string; played: number; wins: number };
type Counts = { training: number; online: number };
export default function Scoreboard() {
  const { lang } = useT();
  const [rows, setRows] = useState<Score[]>([]);
  const [counts, setCounts] = useState<Counts>({ training: 0, online: 0 });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [scores, totals] = await Promise.all([sb().rpc('scoreboard'), sb().rpc('scoreboard_counts')]);
      if (!alive) return;
      if (scores.error || totals.error) setStatus('error');
      else {
        setRows(scores.data ?? []);
        setCounts(totals.data?.[0] ?? { training: 0, online: 0 });
        setStatus('ready');
      }
    };
    void load();
    const ch = sb().channel('scoreboard').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: 'status=eq.finished' }, () => { void load(); }).subscribe();
    const timer = setInterval(() => { void load(); }, 30000);
    return () => { alive = false; clearInterval(timer); void sb().removeChannel(ch); };
  }, []);
  return <section className="panel scoreboard">
    <h2>Scoreboard</h2>
    <p className="muted small">{lang === 'nl' ? 'Gewonnen online spellen · per spelersnaam · zonder computers' : 'Online wins · by player name · excluding bots'}</p>
    {status === 'loading' ? <p>{lang === 'nl' ? 'Laden…' : 'Loading…'}</p> : status === 'error' ? <p>{lang === 'nl' ? 'Het scoreboard is nog niet bereikbaar.' : 'The scoreboard is currently unavailable.'}</p> : <>
      <div className="score-counts" aria-label={lang === 'nl' ? 'Afgeronde potjes' : 'Completed games'}>
        <div><strong>{counts.training}</strong><span>{lang === 'nl' ? 'training' : 'practice'}<small>{lang === 'nl' ? 'potjes' : 'games'}</small></span></div>
        <div><strong>{counts.online}</strong><span>{lang === 'nl' ? 'online' : 'online'}<small>{lang === 'nl' ? 'potjes' : 'games'}</small></span></div>
      </div>
      {!rows.length ? <p className="muted small">{lang === 'nl' ? 'Nog geen online uitslagen. Speel het eerste echte spel uit!' : 'No online results yet. Finish the first real game!'}</p> :
        <ol>{rows.map((r, i) => <li key={r.name}><span className="score-rank">{i + 1}</span><strong>{r.name}</strong><span>{r.wins} {lang === 'nl' ? 'gewonnen' : 'wins'} <small className="muted">/ {r.played} {lang === 'nl' ? 'online gespeeld' : 'played online'}</small></span></li>)}</ol>}
    </>}
  </section>;
}

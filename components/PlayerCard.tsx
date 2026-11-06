'use client';
// Spelerkaart: rating, statistieken en de laatste spellen (met de eindstand van elke partij).
import { useEffect, useState } from 'react';
import { sb } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { COLOR_HEX } from './Board';

type Profile = { user_id: string; name: string; avatar_url: string | null; rating: number; peak_rating: number; games: number; wins: number; since: string };
type Seat = { name: string; bot: boolean; level: number | null; me: boolean | null };
type Game = {
  match_id: string; source: 'online' | 'practice'; mode: string; finished_at: string | null; seconds: number | null; rounds: number | null;
  moves: number | null; seat: number | null; won: boolean; delta: number; rating_after: number; home_me: number | null; home_mate: number | null;
  players: Seat[] | null; lanes: number[] | null; winner: number | null;
};

const fmtTime = (s: number | null) => {
  if (!s || s <= 0) return '—';
  const m = Math.floor(s / 60), sec = s % 60;
  return m >= 60 ? `${Math.floor(m / 60)}u${String(m % 60).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

export default function PlayerCard({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { t, lang } = useT();
  const nl = lang === 'nl';
  const [prof, setProf] = useState<Profile | null>(null);
  const [games, setGames] = useState<Game[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all([sb().rpc('player_profile', { p_user: userId }), sb().rpc('player_history', { p_user: userId, p_limit: 30 })]).then(([p, h]) => {
      if (!alive) return;
      if (p.error || h.error) { setErr(true); return; }
      setProf((p.data ?? [])[0] ?? null);
      setGames((h.data ?? []) as Game[]);
    });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => { alive = false; window.removeEventListener('keydown', esc); };
  }, [userId, onClose]);

  const done = games ?? [];
  const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => typeof x === 'number' && x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const avgSec = avg(done.map((g) => g.seconds));
  const avgRounds = avg(done.map((g) => g.rounds));
  const myLanes = done.map((g) => (g.lanes && g.seat !== null ? g.lanes[g.seat] : null));
  const lanesKnown = myLanes.filter((x): x is number => x !== null);
  const avgLanes = lanesKnown.length ? lanesKnown.reduce((a, b) => a + b, 0) / lanesKnown.length : null;
  // rating-verloop (oud -> nieuw)
  const series = done.slice().reverse().map((g) => g.rating_after);
  if (series.length) series.unshift(series[0] - done[done.length - 1].delta);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel player-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={prof?.name ?? ''}>
        <button className="drawer-close pc-close" aria-label={nl ? 'Sluiten' : 'Close'} onClick={onClose}>×</button>
        {err ? <p>{nl ? 'Kon de statistieken niet laden.' : 'Could not load the stats.'}</p> : !prof || !games ? <p>{t.loading}</p> : <>
          <div className="pc-head">
            {prof.avatar_url ? <img src={prof.avatar_url} alt="" className="pc-avatar" referrerPolicy="no-referrer" /> : <span className="pc-avatar pc-initial">{prof.name.slice(0, 1)}</span>}
            <div>
              <h2>{prof.name}</h2>
              <p className="muted small">{nl ? 'Speelt sinds' : 'Playing since'} {new Date(prof.since).toLocaleDateString(nl ? 'nl-BE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
            <div className="pc-rating"><strong>{prof.rating}</strong><span>{t.rating}</span></div>
          </div>
          <div className="pc-stats">
            <div><strong>{prof.peak_rating}</strong><span>{nl ? 'beste rating' : 'best rating'}</span></div>
            <div><strong>{prof.games}</strong><span>{nl ? 'gespeeld' : 'played'}</span></div>
            <div><strong>{prof.games ? Math.round((100 * prof.wins) / prof.games) : 0}%</strong><span>{nl ? 'gewonnen' : 'won'}</span></div>
            <div><strong>{avgLanes === null ? '—' : avgLanes.toFixed(1)}</strong><span>{nl ? 'gem. knikkers binnen' : 'avg. marbles home'}</span></div>
            <div><strong>{avgRounds === null ? '—' : avgRounds.toFixed(1)}</strong><span>{nl ? 'gem. rondes' : 'avg. rounds'}</span></div>
            <div><strong>{fmtTime(avgSec === null ? null : Math.round(avgSec))}</strong><span>{nl ? 'gem. speelduur' : 'avg. game time'}</span></div>
          </div>
          {series.length > 2 && <Spark values={series} />}
          <h3>{nl ? 'Laatste spellen' : 'Recent games'}</h3>
          {!done.length ? <p className="muted small">{nl ? 'Nog geen uitgespeelde spellen met rating.' : 'No rated games yet.'}</p> : (
            <div className="pc-table-wrap">
              <table className="pc-table">
                <thead>
                  <tr>
                    <th>{nl ? 'Wanneer' : 'When'}</th>
                    <th>{nl ? 'Knikkers binnen op het einde' : 'Marbles home at the end'}</th>
                    <th>{nl ? 'Rondes' : 'Rounds'}</th>
                    <th>{nl ? 'Tijd' : 'Time'}</th>
                    <th>{nl ? 'Uitslag' : 'Result'}</th>
                  </tr>
                </thead>
                <tbody>
                  {done.map((g) => (
                    <tr key={g.match_id} className={g.won ? 'won' : 'lost'}>
                      <td>
                        <span className="pc-date">{g.finished_at ? new Date(g.finished_at).toLocaleDateString(nl ? 'nl-BE' : 'en-GB', { day: 'numeric', month: 'short' }) : '—'}</span>
                        <span className="muted small"> {g.finished_at ? new Date(g.finished_at).toLocaleTimeString(nl ? 'nl-BE' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                        <div className="muted small">{g.source === 'online' ? 'online' : nl ? 'oefenen' : 'practice'} · {t.modes[g.mode as 'training'] ?? g.mode}</div>
                      </td>
                      <td>
                        <div className="pc-players">
                          {(g.players ?? []).map((p, i) => (
                            <span key={i} className={`pc-player ${p.me ? 'me' : ''} ${g.winner !== null && i % 2 === g.winner ? 'win-team' : ''}`} style={{ ['--c' as string]: COLOR_HEX[i] }}>
                              <span className="dot" />
                              <span className="pc-pname">{p.name}</span>
                              <b>{g.lanes ? g.lanes[i] : '?'}</b>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{g.rounds ?? '—'}</td>
                      <td>{fmtTime(g.seconds)}</td>
                      <td>
                        <span className={`pc-result ${g.won ? 'w' : 'l'}`}>{g.won ? (nl ? 'gewonnen' : 'won') : (nl ? 'verloren' : 'lost')}</span>
                        <span className={`pc-delta ${g.delta >= 0 ? 'up' : 'down'}`}>{g.delta >= 0 ? `+${g.delta}` : g.delta}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>}
      </div>
    </div>
  );
}

/** Klein lijntje met het verloop van de rating. */
function Spark({ values }: { values: number[] }) {
  const w = 520, h = 70, pad = 6;
  const lo = Math.min(...values), hi = Math.max(...values), span = Math.max(hi - lo, 20);
  const pts = values.map((v, i) => [pad + (i * (w - 2 * pad)) / (values.length - 1), h - pad - ((v - lo) / span) * (h - 2 * pad)]);
  return (
    <svg className="pc-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={4} />
    </svg>
  );
}

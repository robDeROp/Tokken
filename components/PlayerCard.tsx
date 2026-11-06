'use client';
// Spelerkaart: rating, statistieken, ratingverloop en de laatste spellen (eindstand per ploeg).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

/** Kleine ronde knikker in de kleur van een stoel. */
export function Marble({ c, size = 14 }: { c: number; size?: number }) {
  return <span className="mini-marble" style={{ ['--c' as string]: COLOR_HEX[c], width: size, height: size }} aria-hidden="true" />;
}

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
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avgSec = mean(done.map((g) => g.seconds ?? 0).filter((x) => x > 0));
  const avgRounds = mean(done.map((g) => g.rounds ?? 0).filter((x) => x > 0));
  const avgLanes = mean(done.filter((g) => g.lanes && g.seat !== null).map((g) => g.lanes![g.seat!]));
  const dateFmt = (iso: string | null, withTime = false) => !iso ? '—' : new Date(iso).toLocaleString(nl ? 'nl-BE' : 'en-GB',
    withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' });

  return (
    <div className="overlay" onClick={onClose}>
      <div className="player-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={prof?.name ?? ''}>
        <button className="pc-close" aria-label={nl ? 'Sluiten' : 'Close'} onClick={onClose}>×</button>
        {err ? <p>{nl ? 'Kon de statistieken niet laden.' : 'Could not load the stats.'}</p> : !prof || !games ? <p className="muted">{t.loading}</p> : <>
          <header className="pc-head">
            {prof.avatar_url ? <img src={prof.avatar_url} alt="" className="pc-avatar" referrerPolicy="no-referrer" /> : <span className="pc-avatar pc-initial">{prof.name.slice(0, 1)}</span>}
            <div className="pc-who">
              <h2>{prof.name}</h2>
              <p>{nl ? 'Speelt sinds' : 'Playing since'} {new Date(prof.since).toLocaleDateString(nl ? 'nl-BE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
            <div className="pc-hero">
              <span className="pc-hero-label">{t.rating}</span>
              <strong>{prof.rating}</strong>
              {done[0] && <span className={`pc-hero-delta ${done[0].delta >= 0 ? 'up' : 'down'}`}>{done[0].delta >= 0 ? `+${done[0].delta}` : `−${Math.abs(done[0].delta)}`} {nl ? 'in het laatste spel' : 'in the last game'}</span>}
            </div>
          </header>

          <div className="pc-stats">
            <Stat value={String(prof.peak_rating)} label={nl ? 'beste rating' : 'best rating'} />
            <Stat value={`${prof.wins} / ${prof.games}`} label={nl ? 'gewonnen' : 'won'} sub={prof.games ? `${Math.round((100 * prof.wins) / prof.games)}%` : undefined} />
            <Stat value={avgLanes === null ? '—' : avgLanes.toFixed(1)} label={nl ? 'knikkers binnen (gem.)' : 'marbles home (avg.)'} sub={nl ? 'van de 4' : 'out of 4'} />
            <Stat value={avgRounds === null ? '—' : avgRounds.toFixed(1)} label={nl ? 'rondes per spel' : 'rounds per game'} />
            <Stat value={fmtTime(avgSec === null ? null : Math.round(avgSec))} label={nl ? 'speelduur (gem.)' : 'game time (avg.)'} />
          </div>

          {done.length >= 2 && (
            <section className="pc-section">
              <h3>{nl ? 'Ratingverloop' : 'Rating over time'} <span>{nl ? `laatste ${done.length} spellen` : `last ${done.length} games`}</span></h3>
              <RatingChart games={done.slice().reverse()} nl={nl} dateFmt={dateFmt} />
            </section>
          )}

          <section className="pc-section">
            <h3>{nl ? 'Laatste spellen' : 'Recent games'}</h3>
            {!done.length ? <p className="muted small">{nl ? 'Nog geen uitgespeelde spellen met rating.' : 'No rated games yet.'}</p> : (
              <div className="pc-table-wrap">
                <table className="pc-table">
                  <thead>
                    <tr>
                      <th>{nl ? 'Wanneer' : 'When'}</th>
                      <th>{nl ? 'Jouw ploeg' : 'Your team'}</th>
                      <th className="c">{nl ? 'Binnen' : 'Home'}</th>
                      <th>{nl ? 'Tegenstanders' : 'Opponents'}</th>
                      <th className="r">{nl ? 'Rondes' : 'Rounds'}</th>
                      <th className="r">{nl ? 'Tijd' : 'Time'}</th>
                      <th className="r">{nl ? 'Uitslag' : 'Result'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {done.map((g) => {
                      const me = g.seat ?? 0;
                      const mine = [me, (me + 2) % 4], theirs = [(me + 1) % 4, (me + 3) % 4];
                      const sum = (xs: number[]) => (g.lanes ? xs.reduce((a, x) => a + g.lanes![x], 0) : null);
                      const side = (xs: number[]) => (
                        <div className="pc-side">
                          {xs.map((i) => {
                            const p = g.players?.[i];
                            return (
                              <span key={i} className={`pc-p ${p?.me ? 'me' : ''}`}>
                                <Marble c={i} />
                                <span className="pc-pname">{p?.name ?? '—'}</span>
                                <span className="pc-n" title={nl ? 'knikkers binnen' : 'marbles home'}>{g.lanes ? g.lanes[i] : '–'}</span>
                              </span>
                            );
                          })}
                        </div>
                      );
                      return (
                        <tr key={g.match_id}>
                          <td>
                            <div className="pc-date">{dateFmt(g.finished_at, true)}</div>
                            <div className="pc-meta">{g.source === 'online' ? 'online' : nl ? 'oefenen' : 'practice'} · {t.modes[g.mode as 'training'] ?? g.mode}</div>
                          </td>
                          <td>{side(mine)}</td>
                          <td className="c"><span className={`pc-score ${g.won ? 'w' : 'l'}`}>{sum(mine) ?? '–'}<i>–</i>{sum(theirs) ?? '–'}</span></td>
                          <td>{side(theirs)}</td>
                          <td className="r num">{g.rounds ?? '—'}</td>
                          <td className="r num">{fmtTime(g.seconds)}</td>
                          <td className="r">
                            <span className={`pc-badge ${g.won ? 'w' : 'l'}`}>{g.won ? (nl ? '✓ gewonnen' : '✓ won') : (nl ? '✕ verloren' : '✕ lost')}</span>
                            <div className={`pc-delta ${g.delta >= 0 ? 'up' : 'down'}`}>{g.delta >= 0 ? `+${g.delta}` : g.delta} → {g.rating_after}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>}
      </div>
    </div>
  );
}

function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return <div className="pc-stat"><strong>{value}</strong>{sub && <em>{sub}</em>}<span>{label}</span></div>;
}

/** Ratingverloop: één lijn, punt per spel (vol = gewonnen, ring = verloren), start op 1000, hover voor details. */
function RatingChart({ games, nl, dateFmt }: { games: Game[]; nl: boolean; dateFmt: (iso: string | null, t?: boolean) => string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 190, L = 46, R = 58, T = 16, B = 28;
  const start = games[0].rating_after - games[0].delta;
  const values = [start, ...games.map((g) => g.rating_after)];
  const lo0 = Math.min(...values, 1000), hi0 = Math.max(...values, 1000);
  // nette stappen, hoogstens 5 rasterlijnen
  let step = 25;
  for (const s of [25, 50, 100, 200, 250, 500]) { step = s; if ((Math.ceil((hi0 + 8) / s) - Math.floor((lo0 - 8) / s)) <= 4) break; }
  const lo = Math.floor((lo0 - 8) / step) * step, hi = Math.ceil((hi0 + 8) / step) * step;
  const x = (i: number) => L + (i * (w - L - R)) / (values.length - 1);
  const y = (v: number) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const peakIdx = values.indexOf(Math.max(...values));
  const last = values.length - 1;
  const every = Math.max(1, Math.ceil(values.length / 8));
  const hv = hover === null ? null : games[hover - 1];
  return (
    <div className="pc-chart" ref={wrap} onMouseLeave={() => setHover(null)}>
      <svg width={w} height={H} role="img" aria-label={nl ? 'Ratingverloop' : 'Rating over time'}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} className="grid" />
            <text x={L - 8} y={y(v)} className="ylab">{v}</text>
          </g>
        ))}
        {lo <= 1000 && hi >= 1000 && <>
          <line x1={L} x2={w - R} y1={y(1000)} y2={y(1000)} className="ref" />
          <text x={w - R + 6} y={y(1000)} className="reflab">start</text>
        </>}
        {values.map((_, i) => (i % every === 0 || i === last) && (
          <text key={i} x={x(i)} y={H - 8} className="xlab">{i === 0 ? (nl ? 'begin' : 'start') : `${nl ? 'spel' : 'game'} ${i}`}</text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="cross" />}
        <path d={path} className="line" />
        {games.map((g, k) => {
          const i = k + 1;
          return <circle key={g.match_id} cx={x(i)} cy={y(values[i])} r={hover === i ? 6.5 : 5} className={`pt ${g.won ? 'w' : 'l'}`} />;
        })}
        {/* selectieve labels: beste en huidige rating */}
        {peakIdx !== last && <text x={x(peakIdx)} y={y(values[peakIdx]) - 11} className="vlab">{nl ? 'beste' : 'best'} {values[peakIdx]}</text>}
        <text x={x(last) + 10} y={y(values[last])} className="vlab end">{values[last]}</text>
        {/* hover-vlakken, breder dan de punten */}
        {games.map((g, k) => {
          const i = k + 1, half = (w - L - R) / (values.length - 1) / 2;
          return <rect key={`h${g.match_id}`} x={x(i) - half} y={T} width={half * 2} height={H - T - B} className="hit" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} />;
        })}
      </svg>
      {hv && hover !== null && (
        <div className="pc-tip" style={{ left: Math.min(Math.max(x(hover), 110), w - 110), top: Math.max(y(values[hover]) - 12, 0) }}>
          <div className="pc-tip-h">{nl ? 'Spel' : 'Game'} {hover} · {dateFmt(hv.finished_at, true)}</div>
          <div><b className={hv.won ? 'w' : 'l'}>{hv.won ? (nl ? 'gewonnen' : 'won') : (nl ? 'verloren' : 'lost')}</b> {hv.delta >= 0 ? `+${hv.delta}` : hv.delta} → <b>{hv.rating_after}</b></div>
          <div className="pc-tip-m">{nl ? 'tegen' : 'vs'} {[1, 3].map((o) => hv.players?.[((hv.seat ?? 0) + o) % 4]?.name).filter(Boolean).join(' & ')}</div>
        </div>
      )}
    </div>
  );
}

'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { COLORS, TRACK, START, ENTRY, type Color, type Piece, type Pos, type CenterCard, type LastMove, type Card } from '@/lib/engine';
import { trackXY, laneXY, kotXY, stickXY, trackLabelXY, laneLabelXY, pathXY, rot, type XY } from '@/lib/board';
import { rankLabel, SUIT } from './CardFace';
import type { Lang } from '@/lib/i18n';

export const COLOR_HEX = ['#f6c90e', '#2563eb', '#ea580c', '#059669'];
export const COLOR_DARK = ['#8a6d00', '#1e3a8a', '#7c2d12', '#064e3b'];
export const COLOR_LIGHT = ['#fff3b0', '#bfdbfe', '#fed7aa', '#a7f3d0'];

export type HoleRef = { pos: Pos; laneColor?: Color };
export const holeKey = (pos: Pos, laneColor?: Color) =>
  pos.t === 'track' ? `t${pos.i}` : pos.t === 'lane' ? `l${laneColor}-${pos.k}` : 'kot';

interface Props {
  pieces: Piece[];
  viewer: Color;
  turn: Color | null;
  sticks: number[];
  names: (string | null)[];
  center: CenterCard[];
  laidCard: Card | null;
  last: LastMove | null;
  lang: Lang;
  highlightPieces?: Set<number>;
  highlightHoles?: Set<string>;
  selectedPiece?: number | null;
  ghosts?: { from: Pos; color: Color }[];
  onPiece?: (id: number) => void;
  onHole?: (h: HoleRef) => void;
}

const STEP_MS = 75;
const cardRot = (id: number) => ((id * 47) % 25) - 12;
const samePos = (a: Pos, b: Pos) => a.t === b.t && (a.t !== 'track' || a.i === (b as { i: number }).i) && (a.t !== 'lane' || a.k === (b as { k: number }).k);

export default function Board(p: Props) {
  const q = (4 - p.viewer) % 4;
  const V = (xy: XY): XY => rot(xy, q);

  const kotSlots = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of COLORS) {
      let s = 0;
      for (const pc of p.pieces) if (pc.color === c && pc.pos.t === 'kot') m.set(pc.id, s++);
    }
    return m;
  }, [p.pieces]);

  const restXY = (pc: Piece): XY => {
    if (pc.pos.t === 'track') return trackXY(pc.pos.i);
    if (pc.pos.t === 'lane') return laneXY(pc.color, pc.pos.k);
    return kotXY(pc.color, kotSlots.get(pc.id) ?? 0);
  };

  // ---- animatie: knikkers rollen vakje per vakje ----
  const prev = useRef<Piece[] | null>(null);
  const anims = useRef(new Map<number, { pts: XY[]; t0: number }>());
  const [, setTick] = useState(0);
  const [killDelay, setKillDelay] = useState(0);
  useEffect(() => {
    const before = prev.current;
    prev.current = p.pieces;
    if (!before) return;
    const now = performance.now();
    let longest = 0;
    for (const pc of p.pieces) {
      const old = before[pc.id];
      if (!old || samePos(old.pos, pc.pos)) continue;
      const pts = pathXY(old.pos, pc.pos, pc.color, ENTRY(pc.color));
      if (pts.length > 1) {
        anims.current.set(pc.id, { pts: [restXYOf(old, before), ...pts], t0: now });
        longest = Math.max(longest, pts.length * STEP_MS);
      }
    }
    setKillDelay(longest);
    if (anims.current.size === 0) return;
    let raf = 0;
    const loop = () => {
      const t = performance.now();
      for (const [id, a] of anims.current) if (t - a.t0 > (a.pts.length - 1) * STEP_MS) anims.current.delete(id);
      setTick((x) => x + 1);
      if (anims.current.size) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.pieces]);

  const pieceXY = (pc: Piece): { xy: XY; hop: number; animating: boolean } => {
    const a = anims.current.get(pc.id);
    if (a) {
      const t = (performance.now() - a.t0) / STEP_MS;
      const k = Math.min(Math.floor(t), a.pts.length - 2);
      const f = Math.min(1, t - k);
      const [x0, y0] = a.pts[k], [x1, y1] = a.pts[k + 1];
      return { xy: V([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]), hop: Math.sin(Math.PI * f), animating: true };
    }
    return { xy: V(restXY(pc)), hop: 0, animating: false };
  };

  const lastTo = new Set<string>();
  if (p.last) for (const m of p.last.moves) lastTo.add(holeKey(m.to, p.pieces[m.piece]?.color));

  const visibleCenter = p.center.slice(-5);
  const hl = p.highlightHoles ?? new Set<string>();
  const hp = p.highlightPieces ?? new Set<number>();

  const hole = (x: number, y: number, color: Color | null, key: string, onClick?: () => void) => (
    <g key={key}>
      <circle cx={x} cy={y} r={17.5} fill="url(#rim)" />
      <circle cx={x} cy={y} r={15} fill={color === null ? 'url(#pit)' : `url(#paint${color})`} />
      {color !== null && <circle cx={x} cy={y} r={15} fill="url(#pitShade)" />}
      {lastTo.has(key) && <circle cx={x} cy={y} r={22} className="last-ring" />}
      {hl.has(key) && <circle cx={x} cy={y} r={21} className="dest-ring" />}
      {onClick && <circle cx={x} cy={y} r={23} fill="transparent" className="hit" data-hole={key} onClick={onClick} />}
    </g>
  );

  return (
    <svg className="board" viewBox="-520 -520 1040 1040" role="img" aria-label="Tokken bord">
      <defs>
        <linearGradient id="woodBase" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d9a874" />
          <stop offset="50%" stopColor="#c99561" />
          <stop offset="100%" stopColor="#b98152" />
        </linearGradient>
        <filter id="grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.12" numOctaves="4" seed="11" result="t" />
          <feColorMatrix in="t" type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.26  0 0 0 0 0.12  0 0 0 0.42 0" result="g" />
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="f" />
          <feColorMatrix in="f" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.22  0 0 0 0 0.1  0 0 0 0.25 0" result="fib" />
          <feMerge result="m"><feMergeNode in="g" /><feMergeNode in="fib" /></feMerge>
          <feComposite in="m" in2="SourceGraphic" operator="in" result="mm" />
          <feBlend in="SourceGraphic" in2="mm" mode="multiply" />
        </filter>
        <radialGradient id="vignette" cx="50%" cy="45%" r="70%">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#3b1f0a" stopOpacity="0.28" />
        </radialGradient>
        <radialGradient id="rim" cx="50%" cy="58%" r="55%">
          <stop offset="70%" stopColor="#7a4a22" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#f1cfa3" stopOpacity="0.35" />
        </radialGradient>
        <radialGradient id="pit" cx="50%" cy="62%" r="62%">
          <stop offset="0%" stopColor="#a87346" />
          <stop offset="65%" stopColor="#8d5b31" />
          <stop offset="100%" stopColor="#4e2c10" />
        </radialGradient>
        <radialGradient id="pitShade" cx="50%" cy="65%" r="60%">
          <stop offset="55%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.5" />
        </radialGradient>
        {COLORS.map((c) => (
          <radialGradient key={`p${c}`} id={`paint${c}`} cx="50%" cy="55%" r="60%">
            <stop offset="0%" stopColor={COLOR_HEX[c]} stopOpacity="0.75" />
            <stop offset="100%" stopColor={COLOR_DARK[c]} stopOpacity="0.9" />
          </radialGradient>
        ))}
        {COLORS.map((c) => (
          <radialGradient key={`m${c}`} id={`m${c}`} cx="38%" cy="32%" r="72%">
            <stop offset="0%" stopColor={COLOR_LIGHT[c]} />
            <stop offset="35%" stopColor={COLOR_HEX[c]} />
            <stop offset="88%" stopColor={COLOR_DARK[c]} />
            <stop offset="100%" stopColor="#000" stopOpacity="0.6" />
          </radialGradient>
        ))}
        <radialGradient id="shade" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2b1606" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#2b1606" stopOpacity="0" />
        </radialGradient>
        <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#2b1606" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* het houten bord */}
      <rect x="-514" y="-514" width="1028" height="1028" rx="22" fill="url(#woodBase)" filter="url(#grain)" />
      <rect x="-514" y="-514" width="1028" height="1028" rx="22" fill="url(#vignette)" />
      <rect x="-511" y="-511" width="1022" height="1022" rx="20" fill="none" stroke="#f3d3a8" strokeOpacity="0.45" strokeWidth="2" />
      <rect x="-514" y="-514" width="1028" height="1028" rx="22" fill="none" stroke="#7a4a22" strokeOpacity="0.5" strokeWidth="2" />

      {/* parcours */}
      {Array.from({ length: TRACK }, (_, i) => {
        const [x, y] = V(trackXY(i));
        const own = i % 18 === 0 ? ((i / 18) as Color) : null;
        const [lx, ly] = V(trackLabelXY(i));
        return (
          <g key={`t${i}`}>
            {hole(x, y, own, holeKey({ t: 'track', i }), () => p.onHole?.({ pos: { t: 'track', i } }))}
            <text x={lx} y={ly} className="num">{(i % 18) + 1}</text>
          </g>
        );
      })}

      {COLORS.map((c) => (
        <g key={`c${c}`}>
          {[0, 1, 2, 3].map((k) => {
            const [x, y] = V(laneXY(c, k));
            const [lx, ly] = V(laneLabelXY(c, k));
            return (
              <g key={k}>
                {hole(x, y, c, holeKey({ t: 'lane', k }, c), () => p.onHole?.({ pos: { t: 'lane', k }, laneColor: c }))}
                <text x={lx} y={ly} className="num">{17 + k}</text>
              </g>
            );
          })}
          {[0, 1, 2, 3].map((s) => { const [x, y] = V(kotXY(c, s)); return hole(x, y, c, `k${c}-${s}`); })}
          {[0, 1].map((s) => {
            const [x, y] = V(stickXY(c, s));
            const has = (p.sticks[c] ?? 0) > s;
            return (
              <g key={`s${s}`}>
                <circle cx={x} cy={y} r={6} fill="#4e2c10" />
                {has && <rect x={x - 3.5} y={y - 30} width={7} height={34} rx={3} className="stick" />}
              </g>
            );
          })}
          {p.names[c] && (() => {
            const [x, y] = V(rot([-248, 437], c));
            const horiz = Math.abs(y) > Math.abs(x);
            const name = p.names[c]!;
            const w = Math.min(190, 30 + name.length * 11);
            const tx = horiz ? x : x - Math.sign(x) * (w / 2 + 26);
            const ty = horiz ? y + Math.sign(y) * 44 : y;
            const now = p.turn === c;
            return (
              <g className={`nametag ${now ? "now" : ""}`} transform={`translate(${tx} ${ty})`}>
                <rect x={-w / 2} y={-15} width={w} height={30} rx={15} fill={now ? COLOR_HEX[c] : 'rgba(255,248,238,0.82)'} stroke={COLOR_DARK[c]} strokeOpacity={now ? 0.9 : 0.35} strokeWidth={2} />
                <circle cx={-w / 2 + 15} cy={0} r={6} fill={now ? '#fff' : COLOR_HEX[c]} />
                <text x={-w / 2 + 27} y={1} className="tag-text" fill={now ? (c === 0 ? '#3a2c00' : '#fff') : '#2b1d10'}>{name}</text>
              </g>
            );
          })()}
        </g>
      ))}

      {/* kaarten in het midden */}
      <g className="pile">
        {visibleCenter.map((cc, idx) => {
          const id = cc.card?.id ?? idx * 13 + 5;
          const red = cc.card && (cc.card.suit === 'H' || cc.card.suit === 'D');
          return (
            <g key={`${idx}-${id}`} transform={`rotate(${cardRot(id + idx)}) translate(${(idx - visibleCenter.length / 2) * 7}, ${(idx % 2) * 3})`} filter="url(#cardShadow)">
              <rect x={-44} y={-62} width={88} height={124} rx={10} className={cc.hidden ? 'card-back' : 'card-front'} />
              {cc.hidden && <rect x={-36} y={-54} width={72} height={108} rx={6} className="card-back-inner" />}
              {!cc.hidden && cc.card && (
                <>
                  <text x={-28} y={-38} className={`card-idx ${red ? 'red' : ''}`}>{rankLabel(cc.card.rank, p.lang)}</text>
                  <text x={0} y={16} className={`card-suit ${red ? 'red' : ''}`}>{cc.card.rank === 'JK' ? '★' : SUIT[cc.card.suit]}</text>
                </>
              )}
            </g>
          );
        })}
        {p.laidCard && (
          <g transform="rotate(4)" filter="url(#cardShadow)">
            <rect x={-48} y={-66} width={96} height={132} rx={11} className="card-front laid" />
            <text x={-30} y={-40} className={`card-idx ${p.laidCard.suit === 'H' || p.laidCard.suit === 'D' ? 'red' : ''}`}>{rankLabel(p.laidCard.rank, p.lang)}</text>
            <text x={0} y={18} className={`card-suit ${p.laidCard.suit === 'H' || p.laidCard.suit === 'D' ? 'red' : ''}`}>{p.laidCard.rank === 'JK' ? '★' : SUIT[p.laidCard.suit]}</text>
          </g>
        )}
      </g>

      {/* waar een pion stond tijdens het splitsen van een 7 */}
      {p.ghosts?.map((g, i) => {
        if (g.from.t === 'kot') return null;
        const [x, y] = g.from.t === 'track' ? V(trackXY(g.from.i)) : V(laneXY(g.color, g.from.k));
        return <circle key={i} cx={x} cy={y} r={14} className="ghost" stroke={COLOR_HEX[g.color]} />;
      })}

      {/* knikkers */}
      {p.pieces.map((pc) => {
        const { xy: [x, y], hop, animating } = pieceXY(pc);
        const sel = p.selectedPiece === pc.id;
        const onStart = pc.pos.t === 'track' && pc.pos.i === START(pc.color);
        const lift = hop * 9;
        return (
          <g key={pc.id} data-piece={pc.id} className={`marble ${hp.has(pc.id) ? 'can' : ''} ${sel ? 'sel' : ''} ${animating ? 'rolling' : ''}`}
            style={{ transform: `translate(${x}px, ${y}px)`, transitionDelay: pc.pos.t === 'kot' && killDelay ? `${killDelay}ms` : undefined }}
            onClick={() => p.onPiece?.(pc.id)}>
            {(sel || hp.has(pc.id)) && <circle r={24} className="ring" />}
            {onStart && <circle r={22} className="safe" stroke={COLOR_HEX[pc.color]} />}
            <ellipse cx={3 + lift * 0.3} cy={7 + lift * 0.4} rx={18 - lift * 0.4} ry={15 - lift * 0.4} fill="url(#shade)" opacity={1 - hop * 0.4} />
            <g transform={`translate(0 ${-lift})`}>
              <circle r={17} fill={`url(#m${pc.color})`} />
              <ellipse cx={-6} cy={-7} rx={6.5} ry={4} fill="#fff" opacity={0.85} transform="rotate(-35 -6 -7)" />
              <circle cx={6} cy={8} r={2.2} fill="#fff" opacity={0.35} />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function restXYOf(pc: Piece, all: Piece[]): XY {
  if (pc.pos.t === 'track') return trackXY(pc.pos.i);
  if (pc.pos.t === 'lane') return laneXY(pc.color, pc.pos.k);
  let s = 0;
  for (const o of all) { if (o.id === pc.id) break; if (o.color === pc.color && o.pos.t === 'kot') s++; }
  return kotXY(pc.color, s);
}

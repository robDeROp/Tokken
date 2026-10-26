'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { COLORS, TRACK, START, type Color, type Piece, type Pos, type CenterCard, type LastMove, type Card } from '@/lib/engine';
import { trackXY, laneXY, kotXY, stickXY, trackLabelXY, laneLabelXY, rot, planMove, dealTiming, DEAL_CARDS, SHUFFLE_MS, type XY } from '@/lib/board';
import { getSpeed, onSpeedChange, type Speed } from '@/lib/prefs';
import { installUnlock, playMove, playWin, playYourTurn, playDeal } from '@/lib/sound';
import { rankLabel, SUIT } from './CardFace';
import type { Lang } from '@/lib/i18n';

export const COLOR_HEX = ['#f5cf2e', '#1d5fd6', '#e2560c', '#0c7a4b'];
export const COLOR_DARK = ['#9c7d00', '#0b2f77', '#8a2e00', '#03452a'];

export type HoleRef = { pos: Pos; laneColor?: Color };
export const holeKey = (pos: Pos, laneColor?: Color) =>
  pos.t === 'track' ? `t${pos.i}` : pos.t === 'lane' ? `l${laneColor}-${pos.k}` : 'kot';

interface Props {
  pieces: Piece[];
  viewer: Color;
  turn: Color | null;
  turnLabel: string;
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
  /** oplopend nummer van de laatste zet; een nieuw nummer start animatie + geluid */
  moveKey?: number;
  winner?: number | null;
  /** jouw stoel (voor het belletje als je aan de beurt komt) */
  mySeat?: Color | null;
  /** nieuwe ronde: kaarten uitdelen vanaf het midden (beginnend links van de deler) */
  deal?: { round: number; dealer: Color } | null;
}

type Fx = { id: number; kind: 'ripple' | 'splinter' | 'home' | 'confetti' | 'dust' | 'spark' | 'deal' | 'deck'; x: number; y: number; color: Color; delay: number; r?: number; dx?: number; dy?: number; dur?: number };
let fxId = 0;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function cardRot(id: number) {
  return ((id * 47) % 31) - 15;
}

export default function Board(p: Props) {
  const q = (4 - p.viewer) % 4;
  // Leave a narrow wooden margin so the outer labels stay inside the board.
  const V = (xy: XY): XY => rot([xy[0] * 0.93, xy[1] * 0.93], q);

  const kotSlots = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of COLORS) {
      let s = 0;
      for (const pc of p.pieces) if (pc.color === c && pc.pos.t === 'kot') m.set(pc.id, s++);
    }
    return m;
  }, [p.pieces]);

  const pieceXY = (pc: Piece): XY => {
    if (pc.pos.t === 'track') return V(trackXY(pc.pos.i));
    if (pc.pos.t === 'lane') return V(laneXY(pc.color, pc.pos.k));
    return V(kotXY(pc.color, kotSlots.get(pc.id) ?? 0));
  };

  // ---------- animaties en geluid ----------
  const els = useRef(new Map<number, SVGGElement>());
  const inner = useRef(new Map<number, SVGGElement>());
  const lastCard = useRef<SVGGElement>(null);
  const prevXY = useRef<Map<number, XY> | null>(null);
  const prevPieces = useRef<Piece[] | null>(null);
  const prevKey = useRef<number | undefined>(undefined);
  const prevWinner = useRef(p.winner ?? null);
  const prevTurn = useRef(p.turn);
  const [fx, setFx] = useState<Fx[]>([]);
  const speed = useRef<Speed>('normal');
  useEffect(() => { installUnlock(); speed.current = getSpeed(); return onSpeedChange((v) => { speed.current = v; }); }, []);

  const addFx = (items: Omit<Fx, 'id'>[], life: number) => {
    if (!items.length) return;
    const withId = items.map((f) => ({ ...f, id: ++fxId }));
    setFx((cur) => [...cur, ...withId]);
    const ids = new Set(withId.map((f) => f.id));
    setTimeout(() => setFx((cur) => cur.filter((f) => !ids.has(f.id))), life);
  };

  // uitdelen
  const dealt = useRef<number | null>(null);
  useEffect(() => {
    const d = p.deal;
    if (!d || dealt.current === d.round) return;
    dealt.current = d.round;
    const { gap, fly } = dealTiming(speed.current);
    playDeal(DEAL_CARDS, gap, SHUFFLE_MS);
    if (reducedMotion()) return;
    const items: Omit<Fx, 'id'>[] = [{ kind: 'deck', x: 0, y: 0, color: 0, delay: 0, dur: SHUFFLE_MS + DEAL_CARDS * gap + fly }];
    for (let k = 0; k < DEAL_CARDS; k++) {
      const c = ((d.dealer + 1 + (k % 4)) % 4) as Color;
      const [tx, ty] = V(rot([-235 + (Math.floor(k / 4) - 3) * 9, 392], c));
      items.push({ kind: 'deal', x: 0, y: 0, color: c, delay: SHUFFLE_MS + k * gap, dur: fly, dx: tx, dy: ty, r: (c % 2 ? 90 : 0) + (Math.random() * 30 - 15) + 360 });
    }
    addFx(items, SHUFFLE_MS + DEAL_CARDS * gap + fly + 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.deal?.round]);

  useLayoutEffect(() => {
    const now = new Map(p.pieces.map((pc) => [pc.id, pieceXY(pc)] as [number, XY]));
    const before = prevXY.current, beforePieces = prevPieces.current;
    prevXY.current = now; prevPieces.current = p.pieces;
    const isNew = p.moveKey !== undefined && prevKey.current !== undefined && p.moveKey > prevKey.current && !!p.last;
    if (p.moveKey !== undefined) prevKey.current = p.moveKey;
    if (!before) return;
    const still = reducedMotion();
    const handled = new Set<number>();
    const items: Omit<Fx, 'id'>[] = [];

    if (isNew && p.last) {
      const slotsPrev = new Map<number, number>();
      if (beforePieces) for (const c of COLORS) { let k = 0; for (const pc of beforePieces) if (pc.color === c && pc.pos.t === 'kot') slotsPrev.set(pc.id, k++); }
      const plan = planMove(p.last, p.pieces, beforePieces, (id) => kotSlots.get(id) ?? 0, (id) => slotsPrev.get(id) ?? 0, speed.current);
      playMove(p.last, plan, p.mySeat ?? null);
      if (!still) {
        // kaart vliegt vanaf de speler naar het midden
        if (lastCard.current && p.last.kind !== 'freeExit') {
          const [sx, sy] = V(rot([0, 330], p.last.by));
          lastCard.current.animate([
            { transform: `translate(${sx}px, ${sy}px) scale(.55) rotate(${p.last.by % 2 ? 90 : -25}deg)`, opacity: 0.4 },
            { transform: 'translate(0px, 0px) scale(1.06) rotate(0deg)', opacity: 1, offset: 0.8 },
            { transform: 'translate(0px, 0px) scale(1) rotate(0deg)', opacity: 1 },
          ], { duration: 260, easing: 'cubic-bezier(.2,.8,.3,1)' });
        }
        for (const s of plan.segs) {
          const el = els.current.get(s.piece), inn = inner.current.get(s.piece);
          const was = before.get(s.piece), is = now.get(s.piece);
          if (!el || !was || !is) continue;
          handled.add(s.piece);
          if (Math.hypot(was[0] - is[0], was[1] - is[1]) < 1) continue; // al zo getoond (7 splitsen)
          const pts = s.pts.map(V);
          pts[0] = was; pts[pts.length - 1] = is;
          let frames: Keyframe[];
          if (s.kind === 'exit' || s.kind === 'swap') {
            const mx = (pts[0][0] + is[0]) / 2, my = (pts[0][1] + is[1]) / 2;
            const lift = s.kind === 'exit' ? 0.82 : 0.9; // boog richting het midden
            frames = [{ transform: `translate(${pts[0][0]}px, ${pts[0][1]}px)` }, { transform: `translate(${mx * lift}px, ${my * lift}px)` }, { transform: `translate(${is[0]}px, ${is[1]}px)` }];
            inn?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.32)' }, { transform: 'scale(1)' }], { duration: s.dur, delay: s.delay, easing: 'ease-in-out' });
          } else if (plan.hop) {
            // gaatje per gaatje huppen: elke sprong apart versneld/vertraagd, en even optillen
            frames = pts.map(([x, y]) => ({ transform: `translate(${x}px, ${y}px)`, easing: 'cubic-bezier(.45,0,.55,1)' }));
            const n = pts.length - 1, lift: Keyframe[] = [];
            for (let k = 0; k < n; k++) {
              lift.push({ transform: 'scale(1)', offset: k / n });
              lift.push({ transform: 'scale(1.2)', offset: (k + 0.5) / n });
            }
            lift.push({ transform: 'scale(1)', offset: 1 });
            inn?.animate(lift, { duration: s.dur, delay: s.delay });
            for (let k = 1; k < n; k++) items.push({ kind: 'ripple', x: pts[k][0], y: pts[k][1], color: s.color, delay: s.delay + (k * s.dur) / n, r: 0.65 });
          } else {
            frames = pts.map(([x, y]) => ({ transform: `translate(${x}px, ${y}px)` }));
          }
          el.animate(frames, { duration: s.dur, delay: s.delay, easing: s.kind === 'exit' || s.kind === 'swap' ? 'cubic-bezier(.35,0,.25,1)' : plan.hop ? 'linear' : 'cubic-bezier(.3,.05,.45,1)', fill: 'backwards' });
          inn?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14, .86)', offset: 0.35 }, { transform: 'scale(.95, 1.05)', offset: 0.7 }, { transform: 'scale(1)' }],
            { duration: 220, delay: s.delay + s.dur });
          items.push({ kind: s.kind === 'home' ? 'home' : 'ripple', x: is[0], y: is[1], color: s.color, delay: s.delay + s.dur });
          if (s.kind === 'home') for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2 - Math.PI / 2, d = 30 + (k % 2) * 8;
            items.push({ kind: 'spark', x: is[0] + Math.cos(a) * d, y: is[1] + Math.sin(a) * d, color: s.color, delay: s.delay + s.dur + 80 + k * 45 });
          }
          if (s.kind === 'exit') items.push({ kind: 'dust', x: pts[0][0], y: pts[0][1], color: s.color, delay: s.delay });
        }
        for (const k of plan.kills) {
          const el = els.current.get(k.piece), inn = inner.current.get(k.piece);
          const was = before.get(k.piece), is = now.get(k.piece);
          if (!el || !was || !is) continue;
          handled.add(k.piece);
          if (Math.hypot(was[0] - is[0], was[1] - is[1]) < 1) continue;
          const mx = (was[0] + is[0]) / 2 * 1.12, my = (was[1] + is[1]) / 2 * 1.12;
          el.animate([{ transform: `translate(${was[0]}px, ${was[1]}px)` }, { transform: `translate(${mx}px, ${my}px)`, offset: 0.45 }, { transform: `translate(${is[0]}px, ${is[1]}px)` }],
            { duration: plan.killMs, delay: k.delay, easing: 'cubic-bezier(.2,.6,.35,1)', fill: 'backwards' });
          inn?.animate([{ transform: 'scale(1) rotate(0deg)' }, { transform: 'scale(1.35) rotate(300deg)', offset: 0.45 }, { transform: 'scale(1) rotate(620deg)' }], { duration: plan.killMs, delay: k.delay, easing: 'ease-out' });
          const by = p.last.by as Color;
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2 + Math.random() * 0.5, d = 34 + Math.random() * 26;
            items.push({ kind: 'splinter', x: was[0], y: was[1], color: i % 3 ? by : k.color, delay: k.delay, dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: (a * 180) / Math.PI });
          }
          items.push({ kind: 'ripple', x: was[0], y: was[1], color: by, delay: k.delay, r: 1.6 });
        }
      }
    }
    // overige verplaatsingen (7 splitsen, herladen): kort glijden
    if (!still) for (const [id, is] of now) {
      if (handled.has(id)) continue;
      const was = before.get(id);
      if (!was || Math.hypot(was[0] - is[0], was[1] - is[1]) < 1) continue;
      els.current.get(id)?.animate([{ transform: `translate(${was[0]}px, ${was[1]}px)` }, { transform: `translate(${is[0]}px, ${is[1]}px)` }], { duration: 170, easing: 'ease-out' });
    }

    // winst
    const w = p.winner ?? null;
    if (w !== null && prevWinner.current === null) {
      playWin(p.mySeat == null ? true : p.mySeat % 2 === w);
      if (!still) for (let i = 0; i < 46; i++) {
        const c = ((w + (i % 2) * 2) % 4) as Color;
        items.push({ kind: 'confetti', x: -480 + Math.random() * 960, y: -560, color: c, delay: Math.random() * 900, dy: 1050 + Math.random() * 120, dx: (Math.random() - 0.5) * 160, r: 0.6 + Math.random() * 0.6 });
      }
    }
    prevWinner.current = w;
    // jouw beurt
    if (p.mySeat != null && p.turn === p.mySeat && prevTurn.current !== p.mySeat && prevTurn.current !== null && w === null) {
      const delay = isNew ? 380 : 0;
      setTimeout(playYourTurn, delay);
    }
    prevTurn.current = p.turn;
    addFx(items, 2600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.pieces, p.moveKey, p.winner, p.turn, q]);

  const lastTo = new Set<string>();
  if (p.last) for (const m of p.last.moves) lastTo.add(holeKey(m.to, p.pieces[m.piece]?.color));

  const visibleCenter = p.center.slice(-6);
  const hl = p.highlightHoles ?? new Set<string>();
  const hp = p.highlightPieces ?? new Set<number>();

  return (
    <svg className="board" viewBox="-520 -520 1040 1040" role="img" aria-label="Tokken bord">
      <defs>
        <linearGradient id="boardWood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d5ad7b" />
          <stop offset="0.48" stopColor="#c99a65" />
          <stop offset="1" stopColor="#b98550" />
        </linearGradient>
        <linearGradient id="boardEdge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#855a37" />
          <stop offset="0.15" stopColor="#edcf9f" />
          <stop offset="0.5" stopColor="#a46d41" />
          <stop offset="0.88" stopColor="#d9b17b" />
          <stop offset="1" stopColor="#755033" />
        </linearGradient>
        <pattern id="woodGrain" width="320" height="116" patternUnits="userSpaceOnUse">
          <path d="M-40 20 C36 15 92 29 160 20 S280 14 355 24 M-40 82 C48 73 102 91 180 81 S277 75 350 85"
            fill="none" stroke="#744a2c" strokeOpacity=".045" strokeWidth="1.5" />
          <path d="M-40 25 C36 20 92 34 160 25 S280 19 355 29 M-40 87 C48 78 102 96 180 86 S277 80 350 90"
            fill="none" stroke="#fff0d1" strokeOpacity=".055" strokeWidth="1" />
        </pattern>
        <radialGradient id="hole" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#8a5a2f" />
          <stop offset="70%" stopColor="#a36f3f" />
          <stop offset="100%" stopColor="#6b4220" />
        </radialGradient>
        {COLORS.map((c) => (
          <radialGradient key={c} id={`m${c}`} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="18%" stopColor={COLOR_HEX[c]} />
            <stop offset="85%" stopColor={COLOR_DARK[c]} />
            <stop offset="100%" stopColor={COLOR_DARK[c]} />
          </radialGradient>
        ))}
        {COLORS.map((c) => (
          <radialGradient key={c} id={`h${c}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={COLOR_DARK[c]} stopOpacity="0.55" />
            <stop offset="100%" stopColor={COLOR_HEX[c]} stopOpacity="0.5" />
          </radialGradient>
        ))}
        <radialGradient id="pit" cx="50%" cy="64%" r="58%">
          <stop offset="0%" stopColor="#000" stopOpacity="0" />
          <stop offset="72%" stopColor="#000" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
        </radialGradient>
        <radialGradient id="shade" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect x="-519" y="-519" width="1038" height="1038" rx="24" fill="#65452f" />
      <rect x="-515" y="-515" width="1030" height="1030" rx="20" fill="url(#boardEdge)" />
      <rect x="-506" y="-506" width="1012" height="1012" rx="15" fill="url(#boardWood)" />
      <rect x="-506" y="-506" width="1012" height="1012" rx="15" fill="url(#woodGrain)" />
      <rect x="-506" y="-506" width="1012" height="1012" rx="15" fill="none" stroke="#684629" strokeOpacity=".23" strokeWidth="2" />

      {/* gaatjes van het parcours */}
      {Array.from({ length: TRACK }, (_, i) => {
        const [x, y] = V(trackXY(i));
        const own = i % 18 === 0 ? ((i / 18) as Color) : null;
        const key = holeKey({ t: 'track', i });
        const [lx, ly] = V(trackLabelXY(i));
        return (
          <g key={key}>
            <circle cx={x} cy={y} r={17} fill="url(#hole)" />
            {own !== null && <circle cx={x} cy={y} r={17} fill={`url(#h${own})`} />}
            <circle cx={x} cy={y} r={17} fill="url(#pit)" />
            <path d={`M ${x - 11} ${y - 7} A 13 13 0 0 1 ${x + 11} ${y - 7}`} className="hole-arch" />
            {lastTo.has(key) && <circle cx={x} cy={y} r={22} className="last-ring" />}
            {hl.has(key) && <circle cx={x} cy={y} r={21} className="dest-ring" />}
            <circle cx={x} cy={y} r={23} fill="transparent" className="hit" data-hole={key}
              onClick={() => p.onHole?.({ pos: { t: 'track', i } })} />
            <text x={lx} y={ly} className={`num ${(i % 18) + 1 >= 10 ? 'num-wide' : ''}`}>{(i % 18) + 1}</text>
          </g>
        );
      })}

      {/* huisjes 17-20, kot en stokjes */}
      {COLORS.map((c) => (
        <g key={`c${c}`}>
          {[0, 1, 2, 3].map((k) => {
            const [x, y] = V(laneXY(c, k));
            const [lx, ly] = V(laneLabelXY(c, k));
            const key = holeKey({ t: 'lane', k }, c);
            return (
              <g key={k}>
                <circle cx={x} cy={y} r={17} fill="url(#hole)" />
                <circle cx={x} cy={y} r={17} fill={`url(#h${c})`} />
                <circle cx={x} cy={y} r={17} fill="url(#pit)" />
                <path d={`M ${x - 11} ${y - 7} A 13 13 0 0 1 ${x + 11} ${y - 7}`} className="hole-arch" />
                {lastTo.has(key) && <circle cx={x} cy={y} r={22} className="last-ring" />}
                {hl.has(key) && <circle cx={x} cy={y} r={21} className="dest-ring" />}
                <circle cx={x} cy={y} r={22} fill="transparent" className="hit" data-hole={key}
                  onClick={() => p.onHole?.({ pos: { t: 'lane', k }, laneColor: c })} />
                <text x={lx} y={ly} className="num num-wide">{17 + k}</text>
              </g>
            );
          })}
          {[0, 1, 2, 3].map((s) => {
            const [x, y] = V(kotXY(c, s));
            return <g key={`k${s}`}><circle cx={x} cy={y} r={17} fill="url(#hole)" /><circle cx={x} cy={y} r={17} fill={`url(#h${c})`} /><circle cx={x} cy={y} r={17} fill="url(#pit)" /><path d={`M ${x - 11} ${y - 7} A 13 13 0 0 1 ${x + 11} ${y - 7}`} className="hole-arch" /></g>;
          })}
          {[0, 1].map((s) => {
            const [x, y] = V(stickXY(c, s));
            const has = (p.sticks[c] ?? 0) > s;
            return (
              <g key={`s${s}`}>
                <circle cx={x} cy={y} r={6} fill="#5a3818" />
                {has && <rect x={x - 3} y={y - 26} width={6} height={30} rx={2.5} className="stick" />}
              </g>
            );
          })}
          {p.turn === c && (() => {
            const [x, y] = V(kotXY(c, 0)), [x2, y2] = V(kotXY(c, 3));
            const cx = (x + x2) / 2, cy = (y + y2) / 2;
            const horiz = Math.abs(y - y2) < 1;
            return <rect className="turn-glow" x={cx - (horiz ? 100 : 30)} y={cy - (horiz ? 30 : 100)} width={horiz ? 200 : 60} height={horiz ? 60 : 200} rx={30} stroke={COLOR_HEX[c]} />;
          })()}
          {p.names[c] && (() => {
            const [x, y] = V(rot([-268, 448], c));
            const horiz = Math.abs(y) > Math.abs(x);
            const tx = horiz ? x : x - Math.sign(x) * 46;
            const ty = horiz ? y + Math.sign(y) * 44 : y;
            const anchor = horiz ? 'middle' : x < 0 ? 'start' : 'end';
            return <text x={tx} y={ty} textAnchor={anchor} className={`seat-name ${p.turn === c ? 'active-seat' : ''}`} fill={COLOR_DARK[c]}>{p.names[c]}</text>;
          })()}
        </g>
      ))}

      <g className="rdr-engraving" transform="translate(0 -160)" aria-label="Rob De Rop Digital">
        <g transform="translate(-42 -20) scale(.84)" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 44 6 H 22 A 12 12 0 0 0 22 30 H 44 M 27 30 L 8 54 M 44 6 H 68 A 24 24 0 0 1 68 54 H 44 M 44 6 V54" />
        </g>
        <text x="0" y="50" textAnchor="middle" className="engraving-name">ROB DE ROP</text>
        <text x="0" y="68" textAnchor="middle" className="engraving-sub">DIGITAL · DILBEEK</text>
      </g>

      {/* kaarten in het midden */}
      <g className="pile">
        {visibleCenter.map((cc, idx) => {
          const id = cc.card?.id ?? idx * 13 + 5;
          const red = cc.card && (cc.card.suit === 'H' || cc.card.suit === 'D');
          return (
            <g key={idx} ref={idx === visibleCenter.length - 1 ? lastCard : undefined}><g transform={`rotate(${cardRot(id + idx)}) translate(${(idx - visibleCenter.length / 2) * 6}, 0)`}>
              <rect x={-42} y={-60} width={84} height={120} rx={8} className={cc.hidden ? 'card-back' : 'card-front'} />
              {!cc.hidden && cc.card && (
                <>
                  <text x={-30} y={-36} className={`card-idx ${red ? 'red' : ''}`}>{rankLabel(cc.card.rank, p.lang)}</text>
                  <text x={0} y={18} className={`card-suit ${red ? 'red' : ''}`}>{cc.card.rank === 'JK' ? '★' : SUIT[cc.card.suit]}</text>
                </>
              )}
            </g></g>
          );
        })}
        {p.laidCard && (
          <g transform="translate(0, 0) rotate(4)">
            <rect x={-46} y={-64} width={92} height={128} rx={9} className="card-front laid" />
            <text x={-32} y={-38} className={`card-idx ${p.laidCard.suit === 'H' || p.laidCard.suit === 'D' ? 'red' : ''}`}>{rankLabel(p.laidCard.rank, p.lang)}</text>
            <text x={0} y={20} className={`card-suit ${p.laidCard.suit === 'H' || p.laidCard.suit === 'D' ? 'red' : ''}`}>{p.laidCard.rank === 'JK' ? '★' : SUIT[p.laidCard.suit]}</text>
          </g>
        )}
      </g>

      {p.turnLabel && (
        <g key={`turn${p.turn}`} className="turn-marker" role="status" aria-label={p.turnLabel} transform="translate(0 142)">
          <rect x="-155" y="-18" width="310" height="36" rx="18" />
          <text x="0" y="1">{p.turnLabel}</text>
        </g>
      )}

      {/* waar een pion stond tijdens het splitsen van een 7 */}
      {p.ghosts?.map((g, i) => {
        if (g.from.t === 'kot') return null;
        const [x, y] = g.from.t === 'track' ? V(trackXY(g.from.i)) : V(laneXY(g.color, g.from.k));
        return <circle key={i} cx={x} cy={y} r={14} className="ghost" stroke={COLOR_HEX[g.color]} />;
      })}

      {/* knikkers */}
      {p.pieces.map((pc) => {
        const [x, y] = pieceXY(pc);
        const sel = p.selectedPiece === pc.id;
        const onStart = pc.pos.t === 'track' && pc.pos.i === START(pc.color);
        return (
          <g key={pc.id} data-piece={pc.id} className={`marble ${hp.has(pc.id) ? 'can' : ''} ${sel ? 'sel' : ''}`}
            ref={(el) => { if (el) els.current.set(pc.id, el); else els.current.delete(pc.id); }}
            style={{ transform: `translate(${x}px, ${y}px)` }}
            onClick={() => p.onPiece?.(pc.id)}>
            {(sel || hp.has(pc.id)) && <circle r={23} className="ring" />}
            <ellipse cx={3} cy={6} rx={19} ry={17} fill="url(#shade)" />
            <g className="mb" ref={(el) => { if (el) inner.current.set(pc.id, el); else inner.current.delete(pc.id); }}>
              <circle r={18} fill={`url(#m${pc.color})`} stroke={COLOR_DARK[pc.color]} strokeWidth={1.2} />
              <ellipse cx={-6} cy={-7} rx={6} ry={4} fill="#fff" opacity={0.75} transform="rotate(-30 -6 -7)" />
            </g>
            {onStart && <circle r={21} className="safe" stroke={COLOR_HEX[pc.color]} />}
          </g>
        );
      })}

      {/* effecten: rimpels, splinters, huisje-gloed, confetti */}
      <g className="fx" aria-hidden="true">
        {fx.map((f) => {
          const st = { animationDelay: `${f.delay}ms` } as React.CSSProperties;
          if (f.kind === 'ripple') return <circle key={f.id} cx={f.x} cy={f.y} r={20} className="fx-ripple" style={{ ...st, ['--s' as string]: f.r ?? 1 }} />;
          if (f.kind === 'dust') return <circle key={f.id} cx={f.x} cy={f.y} r={16} className="fx-dust" style={st} />;
          if (f.kind === 'home') return <g key={f.id} transform={`translate(${f.x} ${f.y})`}><circle r={22} className="fx-home" stroke={COLOR_HEX[f.color]} style={st} /><circle r={22} className="fx-home late" stroke="#fff3c4" style={{ animationDelay: `${f.delay + 120}ms` }} /></g>;
          if (f.kind === 'deal') return <g key={f.id} className="fx-deal" style={{ ...st, ['--dx' as string]: `${f.dx}px`, ['--dy' as string]: `${f.dy}px`, ['--r' as string]: `${f.r}deg`, ['--dur' as string]: `${f.dur}ms` }}><rect x={-24} y={-34} width={48} height={68} rx={6} className="card-back" /></g>;
          if (f.kind === 'deck') return <g key={f.id} className="fx-deck" style={{ ['--dur' as string]: `${f.dur}ms` }}>{[0, 1, 2, 3].map((i) => <rect key={i} x={-28 + i * 1.5} y={-40 - i * 2.5} width={56} height={80} rx={7} className="card-back" />)}</g>;
          if (f.kind === 'spark') return <path key={f.id} d={`M ${f.x} ${f.y - 7} L ${f.x + 2} ${f.y - 2} L ${f.x + 7} ${f.y} L ${f.x + 2} ${f.y + 2} L ${f.x} ${f.y + 7} L ${f.x - 2} ${f.y + 2} L ${f.x - 7} ${f.y} L ${f.x - 2} ${f.y - 2} Z`} className="fx-spark" style={st} />;
          if (f.kind === 'splinter') return <g key={f.id} transform={`translate(${f.x} ${f.y})`}><rect x={-2} y={-7} width={4} height={13} rx={2} className="fx-splinter" fill={COLOR_HEX[f.color]} style={{ ...st, ['--dx' as string]: `${f.dx}px`, ['--dy' as string]: `${f.dy}px`, ['--r' as string]: `${f.r}deg` }} /></g>;
          return <circle key={f.id} cx={f.x} cy={f.y} r={9 * (f.r ?? 1)} className="fx-confetti" fill={`url(#m${f.color})`} style={{ ...st, ['--dx' as string]: `${f.dx}px`, ['--dy' as string]: `${f.dy}px` }} />;
        })}
      </g>
    </svg>
  );
}

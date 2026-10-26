'use client';
import { useMemo } from 'react';
import { COLORS, TRACK, START, type Color, type Piece, type Pos, type CenterCard, type LastMove, type Card } from '@/lib/engine';
import { trackXY, laneXY, kotXY, stickXY, trackLabelXY, laneLabelXY, rot, type XY } from '@/lib/board';
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

function cardRot(id: number) {
  return ((id * 47) % 31) - 15;
}

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

  const pieceXY = (pc: Piece): XY => {
    if (pc.pos.t === 'track') return V(trackXY(pc.pos.i));
    if (pc.pos.t === 'lane') return V(laneXY(pc.color, pc.pos.k));
    return V(kotXY(pc.color, kotSlots.get(pc.id) ?? 0));
  };

  const lastTo = new Set<string>();
  if (p.last) for (const m of p.last.moves) lastTo.add(holeKey(m.to, p.pieces[m.piece]?.color));

  const visibleCenter = p.center.slice(-6);
  const hl = p.highlightHoles ?? new Set<string>();
  const hp = p.highlightPieces ?? new Set<number>();

  return (
    <svg className="board" viewBox="-520 -520 1040 1040" role="img" aria-label="Tokken bord">
      <defs>
        <filter id="mdf" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9 0.35" numOctaves="3" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.3  0 0 0 0 0.16  0 0 0 0.55 0" result="fib" />
          <feComposite in="fib" in2="SourceGraphic" operator="in" result="fib2" />
          <feBlend in="SourceGraphic" in2="fib2" mode="multiply" />
        </filter>
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

      <rect x="-515" y="-515" width="1030" height="1030" rx="6" fill="#c8955f" filter="url(#mdf)" />
      <rect x="-515" y="-515" width="1030" height="1030" rx="6" fill="none" stroke="#a87743" strokeWidth="3" />

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
            {lastTo.has(key) && <circle cx={x} cy={y} r={22} className="last-ring" />}
            {hl.has(key) && <circle cx={x} cy={y} r={21} className="dest-ring" />}
            <circle cx={x} cy={y} r={23} fill="transparent" className="hit" data-hole={key}
              onClick={() => p.onHole?.({ pos: { t: 'track', i } })} />
            <text x={lx} y={ly} className="num">{(i % 18) + 1}</text>
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
                {lastTo.has(key) && <circle cx={x} cy={y} r={22} className="last-ring" />}
                {hl.has(key) && <circle cx={x} cy={y} r={21} className="dest-ring" />}
                <circle cx={x} cy={y} r={22} fill="transparent" className="hit" data-hole={key}
                  onClick={() => p.onHole?.({ pos: { t: 'lane', k }, laneColor: c })} />
                <text x={lx} y={ly} className="num">{17 + k}</text>
              </g>
            );
          })}
          {[0, 1, 2, 3].map((s) => {
            const [x, y] = V(kotXY(c, s));
            return <g key={`k${s}`}><circle cx={x} cy={y} r={17} fill="url(#hole)" /><circle cx={x} cy={y} r={17} fill={`url(#h${c})`} /><circle cx={x} cy={y} r={17} fill="url(#pit)" /></g>;
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
            const tx = horiz ? x : x - Math.sign(x) * 30;
            const ty = horiz ? y + Math.sign(y) * 44 : y;
            const anchor = horiz ? 'middle' : x < 0 ? 'start' : 'end';
            return <text x={tx} y={ty} textAnchor={anchor} className="seat-name" fill={COLOR_DARK[c]}>{p.names[c]}</text>;
          })()}
        </g>
      ))}

      {/* kaarten in het midden */}
      <g className="pile">
        {visibleCenter.map((cc, idx) => {
          const id = cc.card?.id ?? idx * 13 + 5;
          const red = cc.card && (cc.card.suit === 'H' || cc.card.suit === 'D');
          return (
            <g key={idx} transform={`rotate(${cardRot(id + idx)}) translate(${(idx - visibleCenter.length / 2) * 6}, 0)`}>
              <rect x={-42} y={-60} width={84} height={120} rx={8} className={cc.hidden ? 'card-back' : 'card-front'} />
              {!cc.hidden && cc.card && (
                <>
                  <text x={-30} y={-36} className={`card-idx ${red ? 'red' : ''}`}>{rankLabel(cc.card.rank, p.lang)}</text>
                  <text x={0} y={18} className={`card-suit ${red ? 'red' : ''}`}>{cc.card.rank === 'JK' ? '★' : SUIT[cc.card.suit]}</text>
                </>
              )}
            </g>
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
            style={{ transform: `translate(${x}px, ${y}px)` }}
            onClick={() => p.onPiece?.(pc.id)}>
            {(sel || hp.has(pc.id)) && <circle r={23} className="ring" />}
            <ellipse cx={3} cy={6} rx={19} ry={17} fill="url(#shade)" />
            <circle r={18} fill={`url(#m${pc.color})`} stroke={COLOR_DARK[pc.color]} strokeWidth={1.2} />
            <ellipse cx={-6} cy={-7} rx={6} ry={4} fill="#fff" opacity={0.75} transform="rotate(-30 -6 -7)" />
            {onStart && <circle r={21} className="safe" stroke={COLOR_HEX[pc.color]} />}
          </g>
        );
      })}
    </svg>
  );
}

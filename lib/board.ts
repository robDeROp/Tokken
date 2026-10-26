// Geometrie van het bord, opgemeten uit de foto van het echte MDF-bord
// (gaatjes automatisch gedetecteerd, perspectief rechtgezet, de vier kwarten gemiddeld).
// Coördinaten in een vak van -520..520; geel zit onderaan, de andere kleuren zijn 90° gedraaid (wijzerzin).
import { SEG, TRACK, ENTRY, type Color, type Pos, type Piece, type LastMove } from './engine';

export type XY = [number, number];

// Stuk van geel: vakje 1..18 (1 = gele startplaats, 16 = ingang van blauw's huisje)
const SEG_BASE: XY[] = [
  [-94.8, 428.7], [-99.1, 385.9], [-109.2, 343.3], [-122.9, 302.2], [-143.0, 264.0], [-166.5, 228.3],
  [-195.5, 196.3], [-228.1, 168.1], [-263.5, 144.5], [-302.1, 124.2], [-343.1, 109.4], [-386.5, 100.9],
  [-428.9, 94.6], [-468.8, 84.0], [-469.0, 42.8], [-469.4, 1.0], [-469.6, -40.8], [-469.1, -82.7],
];
const LANE_BASE: XY[] = [[0, 425.1], [0, 383.1], [0, 339.9], [0, 300.7]];
const KOT_BASE: XY[] = [[-186.0, 436.8], [-228.8, 435.5], [-269.8, 436.8], [-310.5, 437.0]];
const STICK_BASE: XY[] = [[-394.7, 436.0], [-439.9, 436.5]];

export function rot([x, y]: XY, q: number): XY {
  let p: XY = [x, y];
  for (let i = 0; i < ((q % 4) + 4) % 4; i++) p = [-p[1], p[0]];
  return p;
}

export const trackXY = (i: number): XY => rot(SEG_BASE[((i % TRACK) + TRACK) % TRACK % SEG], Math.floor((((i % TRACK) + TRACK) % TRACK) / SEG));
export const laneXY = (c: Color, k: number): XY => rot(LANE_BASE[k], c);
export const kotXY = (c: Color, s: number): XY => rot(KOT_BASE[s], c);
export const stickXY = (c: Color, s: number): XY => rot(STICK_BASE[s], c);

export function posXY(pos: Pos, color: Color, kotSlot: number): XY {
  if (pos.t === 'track') return trackXY(pos.i);
  if (pos.t === 'lane') return laneXY(color, pos.k);
  return kotXY(color, kotSlot);
}

/** Plek voor het handgeschreven nummertje: loodrecht op het parcours, aan de buitenkant. */
export function trackLabelXY(i: number): XY {
  const [x, y] = trackXY(i);
  const [ax, ay] = trackXY(i - 1), [bx, by] = trackXY(i + 1);
  let nx = -(by - ay), ny = bx - ax;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len; ny /= len;
  if (nx * x + ny * y < 0) { nx = -nx; ny = -ny; }
  return [x + nx * 27, y + ny * 27];
}
export function laneLabelXY(c: Color, k: number): XY {
  const [x, y] = laneXY(c, k);
  const o = rot([27, 0], c);
  return [x + o[0], y + o[1]];
}

/** Tussenpunten voor de animatie van een zet (vakje per vakje). */
export function pathXY(from: Pos, to: Pos, color: Color, entry: number): XY[] {
  if (from.t === 'track' && to.t === 'track') {
    const fwd = (to.i - from.i + TRACK) % TRACK;
    const back = (from.i - to.i + TRACK) % TRACK;
    if (fwd <= 25) return Array.from({ length: fwd }, (_, k) => trackXY(from.i + k + 1));
    if (back <= 4) return Array.from({ length: back }, (_, k) => trackXY(from.i - k - 1));
  }
  if (from.t === 'track' && to.t === 'lane') {
    const d = (entry - from.i + TRACK) % TRACK;
    if (d <= 25) {
      const pts: XY[] = Array.from({ length: d }, (_, k) => trackXY(from.i + k + 1));
      for (let k = 0; k <= to.k; k++) pts.push(laneXY(color, k));
      return pts;
    }
  }
  if (from.t === 'lane' && to.t === 'lane') {
    const pts: XY[] = [];
    for (let k = from.k + 1; k <= to.k; k++) pts.push(laneXY(color, k));
    return pts;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Draaiboek van een zet: wanneer welke knikker langs welke gaatjes rolt.
// Het bord (animatie) en het geluid gebruiken exact dezelfde tijden.

export type Speed = 'fast' | 'normal' | 'calm' | 'slow';
// per snelheid: één gaatje, min/max rol, kaart, uitkomen, wissel (boer), geslagen terug naar het kot
const TIMING: Record<Speed, { hole: number; min: number; max: number; card: number; exit: number; swap: number; kill: number }> = {
  fast:   { hole: 30,  min: 160, max: 550,  card: 90,  exit: 240, swap: 300, kill: 300 },
  normal: { hole: 52,  min: 240, max: 950,  card: 150, exit: 330, swap: 420, kill: 420 },
  calm:   { hole: 150, min: 300, max: 3200, card: 200, exit: 460, swap: 560, kill: 520 },
  slow:   { hole: 240, min: 400, max: 5200, card: 260, exit: 620, swap: 720, kill: 650 },
};
export const hops = (s: Speed) => s === 'calm' || s === 'slow';

export type SegKind = 'roll' | 'exit' | 'swap' | 'home' | 'back';
export interface Seg { piece: number; color: Color; pts: XY[]; delay: number; dur: number; kind: SegKind; holes: number }
export interface KillFx { piece: number; color: Color; from: XY | null; at: XY; delay: number }
export interface Plan { segs: Seg[]; kills: KillFx[]; total: number; killMs: number; hop: boolean }

/**
 * @param prev  stand vóór de zet (voor de vertrekplek van geslagen knikkers), mag null zijn
 * @param slotNow   kotvakje van een knikker die nu in het kot staat (geslagen)
 * @param slotPrev  kotvakje waar een knikker vóór de zet stond (uitkomen)
 */
export function planMove(last: LastMove, pieces: Piece[], prev: Piece[] | null, slotNow: (id: number) => number, slotPrev: (id: number) => number, speed: Speed = 'normal'): Plan {
  const T = TIMING[speed];
  const CARD_MS = T.card;
  const segDuration = (holes: number, kind: SegKind) =>
    kind === 'exit' ? T.exit : kind === 'swap' ? T.swap : Math.max(T.min, Math.min(T.max, holes * T.hole));
  const segs: Seg[] = [];
  let t = CARD_MS;
  const color = (id: number) => (pieces[id]?.color ?? 0) as Color;
  const isSwap = !!last.swap;
  for (const m of last.moves) {
    const c = color(m.piece);
    let kind: SegKind; let pts: XY[];
    if (m.from.t === 'kot') {
      kind = 'exit';
      pts = [kotXY(c, Math.min(3, slotPrev(m.piece))), posXY(m.to, c, 0)];
    } else if (isSwap) {
      kind = 'swap';
      pts = [posXY(m.from, c, 0), posXY(m.to, c, 0)];
    } else {
      const path = pathXY(m.from, m.to, c, ENTRY(c));
      pts = [posXY(m.from, c, 0), ...(path.length ? path : [posXY(m.to, c, 0)])];
      const backwards = m.from.t === 'track' && m.to.t === 'track' && (m.from.i - m.to.i + TRACK) % TRACK <= 4 && (m.to.i - m.from.i + TRACK) % TRACK > 25;
      kind = m.to.t === 'lane' ? 'home' : backwards ? 'back' : 'roll';
    }
    const holes = Math.max(1, pts.length - 1);
    const dur = segDuration(holes, kind);
    segs.push({ piece: m.piece, color: c, pts, delay: isSwap ? CARD_MS : t, dur, kind, holes });
    if (!isSwap) t += dur + 40;
  }
  if (isSwap) t = CARD_MS + segDuration(1, 'swap');
  const kills: KillFx[] = [];
  const lastSeg = segs[segs.length - 1];
  for (const id of last.kills) {
    const c = color(id);
    const was = prev?.find((x) => x.id === id)?.pos;
    const from = was && was.t !== 'kot' ? posXY(was, c, 0) : lastSeg ? lastSeg.pts[lastSeg.pts.length - 1] : null;
    kills.push({ piece: id, color: c, from, at: kotXY(c, Math.min(3, slotNow(id))), delay: t - 30 });
  }
  const total = t + (kills.length ? T.kill : 0);
  return { segs, kills, total, killMs: T.kill, hop: hops(speed) };
}

/** Hoe lang de animatie van een zet duurt (om de computer zolang te laten wachten). */
export function moveDuration(last: LastMove | null, pieces: Piece[], speed: Speed): number {
  if (!last) return 0;
  return planMove(last, pieces, null, () => 0, () => 0, speed).total;
}

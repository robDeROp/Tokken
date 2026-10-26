// Geometrie van het bord, opgemeten uit de foto van het echte MDF-bord
// (gaatjes automatisch gedetecteerd, perspectief rechtgezet, de vier kwarten gemiddeld).
// Coördinaten in een vak van -520..520; geel zit onderaan, de andere kleuren zijn 90° gedraaid (wijzerzin).
import { SEG, TRACK, type Color, type Pos } from './engine';

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

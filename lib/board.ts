// Geometrie van het bord, nagemaakt van het echte MDF-bord.
// Coördinaten in een vak van -520..520; geel zit onderaan, de andere kleuren zijn 90° gedraaid (wijzerzin).
import { SEG, type Color, type Pos } from './engine';

export type XY = [number, number];

// Stuk van geel: vakje 1..18
const SEG_BASE: XY[] = (() => {
  const pts: XY[] = [[-90, 430], [-90, 385]];
  const a: XY = [-90, 385], b: XY = [-340, 90];
  for (let s = 1; s <= 8; s++) pts.push([a[0] + ((b[0] - a[0]) * s) / 9, a[1] + ((b[1] - a[1]) * s) / 9]);
  pts.push([-340, 90], [-385, 90], [-430, 90], [-475, 90], [-475, 45], [-475, 0], [-475, -45], [-475, -90]);
  return pts;
})();
const LANE_BASE: XY[] = [[0, 430], [0, 385], [0, 340], [0, 295]];
const KOT_BASE: XY[] = [[-200, 448], [-245, 448], [-290, 448], [-335, 448]];
const STICK_BASE: XY[] = [[-415, 448], [-450, 448]];

export function rot([x, y]: XY, q: number): XY {
  let p: XY = [x, y];
  for (let i = 0; i < ((q % 4) + 4) % 4; i++) p = [-p[1], p[0]];
  return p;
}

export const trackXY = (i: number): XY => rot(SEG_BASE[i % SEG], Math.floor(i / SEG));
export const laneXY = (c: Color, k: number): XY => rot(LANE_BASE[k], c);
export const kotXY = (c: Color, s: number): XY => rot(KOT_BASE[s], c);
export const stickXY = (c: Color, s: number): XY => rot(STICK_BASE[s], c);

export function posXY(pos: Pos, color: Color, kotSlot: number): XY {
  if (pos.t === 'track') return trackXY(pos.i);
  if (pos.t === 'lane') return laneXY(color, pos.k);
  return kotXY(color, kotSlot);
}

/** Plek voor het handgeschreven nummertje naast een vakje. */
export function trackLabelXY(i: number): XY {
  const [x, y] = trackXY(i);
  const n = i % SEG;
  const q = Math.floor(i / SEG);
  // in geel-coördinaten: zet het label "buiten" het parcours
  let off: XY;
  if (n <= 1) off = [-30, 0];
  else if (n <= 9) off = [-22, 20];
  else if (n <= 13) off = [0, 30];
  else off = [-32, 0];
  const o = rot(off, q);
  return [x + o[0], y + o[1]];
}
export function laneLabelXY(c: Color, k: number): XY {
  const [x, y] = laneXY(c, k);
  const o = rot([28, 0], c);
  return [x + o[0], y + o[1]];
}

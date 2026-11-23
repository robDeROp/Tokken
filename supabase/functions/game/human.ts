// Hoe echte spelers kiezen: kenmerken van een zet + een geleerd voorkeursmodel (uit move_log, zie
// scripts/ai-train/humanmodel.ts). Gebruikt door de menselijke computers en bij het vooruitdenken
// ("wat zou een mens hier doen?").
import { START, teamOf, progress, type State, type Color, type Rank } from './engine.ts';
import type { Cand } from './ai.ts';
import { HUMAN_MODEL } from './human-weights.ts';

export const MOVE_FEATURES = [
  'waarde', 'slaatTegenstander', 'slaatPloegmaat', 'komtBuiten', 'naarHuisje', 'binnenHuisje', 'voorsteVooruit',
  'verlaatEigen1', 'dureKaart', 'zeven', 'eenAfgooien', 'allesAfgooien', 'boerWissel', 'vierAchteruit', 'vijfAnder', 'koningSlaatOnderweg',
] as const;

const VALUABLE: Rank[] = ['A', 'K', '7', 'J', '5', 'JK'];
const logit = (p: number) => { const q = Math.min(Math.max(p, 1e-3), 1 - 1e-3); return Math.log(q / (1 - q)); };

/** Kenmerken van één kandidaat-zet (value = winstkans volgens het netwerk na de zet). */
export function moveFeatures(st: State, c: Color, cd: Cand, value: number): number[] {
  const f = new Array(MOVE_FEATURES.length).fill(0);
  f[0] = logit(value);
  const a = cd.a;
  const before = st.pieces, after = cd.view.pieces;
  for (const p of before) {
    const q = after[p.id];
    if (p.pos.t !== 'kot' && q.pos.t === 'kot') { if (teamOf(p.color) === teamOf(c)) f[2]++; else f[1]++; }
  }
  if (a.type === 'discardOne') { f[10] = 1; return f; }
  if (a.type === 'discardAll') { f[11] = 1; return f; }
  if (a.type !== 'play') return f;
  const rank = st.hands[c].find((h) => h.id === a.card)?.rank;
  const mv = a.move;
  if (rank && VALUABLE.includes(rank)) f[8] = 1;
  if (mv.kind === 'out') f[3] = 1;
  if (mv.kind === 'seven') f[9] = 1;
  if (mv.kind === 'swap') f[12] = 1;
  if (rank === '4') f[13] = 1;
  if (rank === 'K' && f[1] > 0 && mv.kind === 'step') f[15] = 1;
  const moved = mv.kind === 'seven' ? mv.steps.map((s) => s.piece) : mv.kind === 'step' || mv.kind === 'swap' ? [mv.piece] : [];
  for (const id of moved) {
    const p = before[id], q = after[id];
    if (!p) continue;
    if (rank === '5' && teamOf(p.color) !== teamOf(c)) f[14] = 1;
    if (p.pos.t === 'track' && q.pos.t === 'lane') f[4]++;
    if (p.pos.t === 'lane' && q.pos.t === 'lane') f[5]++;
    if (p.pos.t === 'track' && p.pos.i === START(p.color)) f[7] = 1;
    if (p.pos.t === 'track') f[6] = Math.max(f[6], (progress(p) + 18) / 90);
  }
  return f;
}

export interface HumanModel { features: readonly string[]; w: number[] }

/** Kans per kandidaat dat een mens hem kiest (softmax van het voorkeursmodel). temp > 1 = losser. */
export function humanProbs(st: State, c: Color, cands: Cand[], values: number[], model: HumanModel | null = HUMAN_MODEL, temp = 1, adj?: number[]): number[] {
  if (!model) { const best = values.indexOf(Math.max(...values)); return values.map((_, i) => (i === best ? 1 : 0)); }
  const s = cands.map((cd, i) => moveFeatures(st, c, cd, values[i]).reduce((acc, v, k) => acc + v * (model.w[k] ?? 0), 0) / temp + (adj?.[i] ?? 0));
  const mx = Math.max(...s);
  const e = s.map((x) => Math.exp(x - mx));
  const z = e.reduce((x, y) => x + y, 0);
  return e.map((x) => x / z);
}

export function sampleIndex(p: number[], rng: () => number): number {
  let r = rng();
  for (let i = 0; i < p.length; i++) { r -= p[i]; if (r <= 0) return i; }
  return p.length - 1;
}

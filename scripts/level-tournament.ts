// Niveau A tegen niveau B: node --experimental-strip-types scripts/level-tournament.ts A B [spellen]
import { newGame, applyAction, botActionLevel, teamOf, type Color, type BotLevel } from '../lib/engine.ts';
function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const A = Number(process.argv[2]) as BotLevel, B = Number(process.argv[3]) as BotLevel, n = Number(process.argv[4] || 300);
let winsA = 0;
for (let g = 0; g < n; g++) {
  const rng = mulberry(7919 * g + 13);
  const st = newGame('training', rng);
  const teamA = g % 2;
  let guard = 0;
  while (st.winner === null && guard++ < 6000) {
    const c = st.turn as Color;
    applyAction(st, c, botActionLevel(st, c, teamOf(c) === teamA ? A : B, rng));
  }
  if (st.winner === teamA) winsA++;
}
const p = winsA / n;
console.log(JSON.stringify({ A, B, n, winRateA: p, eloDiff: Math.round(400 * Math.log10(p / (1 - p))) }));

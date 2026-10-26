// Toernooi: nieuwe computerspeler tegen de oude. Gebruik: node --experimental-strip-types scripts/ai-tournament.ts [spellen]
import { newGame, applyAction, botAction, botActionSimple, teamOf, AI, type Color } from '../lib/engine.ts';

function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function tournament(n: number, seed = 1) {
  let newWins = 0, moves = 0;
  const t0 = Date.now();
  for (let g = 0; g < n; g++) {
    const rng = mulberry(seed * 100003 + g);
    const st = newGame('training', rng);
    const newTeam = g % 2; // wisselen van ploeg
    let guard = 0;
    while (st.winner === null && guard++ < 6000) {
      const c = st.turn as Color;
      const a = teamOf(c) === newTeam ? botAction(st, c, rng) : botActionSimple(st, c, rng);
      applyAction(st, c, a);
    }
    if (st.winner === newTeam) newWins++;
    moves += st.moveNo;
  }
  return { winRate: newWins / n, avgMoves: Math.round(moves / n), ms: Date.now() - t0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = Number(process.argv[2] || 300);
  const overrides = process.argv[3] ? JSON.parse(process.argv[3]) : {};
  Object.assign(AI, overrides);
  console.log(JSON.stringify(AI), tournament(n));
}

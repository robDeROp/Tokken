// Trainingsdata maken: spellen spelen en per zet de stand erna + wie uiteindelijk won bewaren.
// node --experimental-strip-types scripts/ai-train/gen.ts <spellen> <seed> <uit.bin> [net.json]
import { writeFileSync, readFileSync } from 'node:fs';
import { newGame, applyAction, botActionLevel, teamOf, needsFreeExit, type Color, type Action, type State } from '../../lib/engine.ts';
import { candidates, viewAfter, features, chooseAction, N_FEATURES, type Net } from '../../lib/ai.ts';

import { mulberry } from './util.ts';

const games = Number(process.argv[2] || 100), seed = Number(process.argv[3] || 1), out = process.argv[4] || '/tmp/data.bin';
const net: Net | null = process.argv[5] ? JSON.parse(readFileSync(process.argv[5], 'utf8')) : null;
const KEEP = Number(process.env.KEEP || 0.3);   // aandeel zetten dat we bewaren
const EPS = Number(process.env.EPS || 0.06);    // af en toe iets willekeurigs (verkennen)

type Pol = { kind: 'lvl'; level: 3 | 4 | 5 } | { kind: 'ai'; temp: number };
function pickPolicy(rng: () => number): Pol {
  const r = rng();
  if (net && r < 0.6) return { kind: 'ai', temp: rng() < 0.5 ? 0 : 0.3 };
  const l = [3, 4, 5, 5][Math.floor(rng() * 4)] as 3 | 4 | 5;
  return { kind: 'lvl', level: l };
}

function act(st: State, c: Color, pol: Pol, rng: () => number): Action {
  const hand = st.hands[c];
  if (needsFreeExit(st.pieces, c, st.sticks[c], st.freeExitDone, hand)) return botActionLevel(st, c, 5, rng);
  if (pol.kind === 'ai' || rng() < EPS) {
    const cands = candidates(st, c, rng, 60);
    if (!cands.length) return { type: 'discardAll' };
    if (pol.kind === 'lvl') return cands[Math.floor(rng() * cands.length)].a;
    return chooseAction(cands, c, pol.temp, rng, net, st.pieces);
  }
  const a = botActionLevel(st, c, pol.level, rng);
  // de bestaande bots gooien altijd alles af: soms één kaart, zodat het netwerk het verschil leert
  if (a.type === 'discardAll' && hand.length > 1 && rng() < 0.5) {
    return { type: 'discardOne', card: hand[Math.floor(rng() * hand.length)].id };
  }
  return a;
}

const rows: Float32Array[] = [];
const t0 = Date.now();
let wins = [0, 0];
for (let g = 0; g < games; g++) {
  const rng = mulberry(seed * 1000003 + g * 7919);
  const st = newGame(rng() < 0.5 ? 'training' : 'pro', rng);
  const pols = [0, 1, 2, 3].map(() => pickPolicy(rng));
  const pending: { f: Float32Array; team: number }[] = [];
  let guard = 0;
  while (st.winner === null && guard++ < 8000) {
    const c = st.turn as Color;
    const a = act(st, c, pols[c], rng);
    if (a.type !== 'freeExit' && rng() < KEEP) {
      const v = viewAfter(st, c, a);
      if (v) pending.push({ f: features(v, c), team: teamOf(c) });
    }
    applyAction(st, c, a);
  }
  if (st.winner === null) continue;
  wins[st.winner]++;
  for (const p of pending) {
    const row = new Float32Array(N_FEATURES + 1);
    row.set(p.f); row[N_FEATURES] = p.team === st.winner ? 1 : 0;
    rows.push(row);
  }
}
const buf = new Float32Array(rows.length * (N_FEATURES + 1));
rows.forEach((r, i) => buf.set(r, i * (N_FEATURES + 1)));
writeFileSync(out, Buffer.from(buf.buffer));
console.log(JSON.stringify({ games, rows: rows.length, sec: Math.round((Date.now() - t0) / 1000), wins }));

// Leert hoe echte spelers kiezen (uit move_log): een voorkeursmodel bovenop de inschatting van het netwerk.
// Per beslissing: kans op kandidaat i ∝ exp(Σ w_k · kenmerk_k(i)). Kenmerk 0 = logit van de winstkans volgens het netwerk,
// de rest beschrijft de zet zelf (slaan, uitkomen, huisje, welke kaart, ...).
// node --experimental-strip-types scripts/ai-train/humanmodel.ts <human_moves.txt> <uit.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { needsFreeExit } from '../../lib/engine.ts';
import { candidates, valueOf } from '../../lib/ai.ts';
import { moveFeatures, MOVE_FEATURES } from '../../lib/human.ts';
import { loadHuman, keyOf } from './human.ts';
import { mulberry } from './util.ts';

const moves = loadHuman(process.argv[2]);
const out = process.argv[3] || '/home/claude/train/human_model.json';
const rng = mulberry(11);

type Dec = { game: string; X: number[][]; y: number };
const decs: Dec[] = [];
const games = readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map((l) => l.split('|')[0]);
moves.forEach((m, n) => {
  if (needsFreeExit(m.st.pieces, m.c, m.st.sticks[m.c], m.st.freeExitDone, m.st.hands[m.c])) return;
  const cands = candidates(m.st, m.c, rng, 3000);
  const seen = new Map<string, number>();
  const X: number[][] = [];
  let y = -1;
  cands.forEach((cd) => {
    const k = keyOf(m.st, m.c, cd.a);
    if (seen.has(k)) return;
    seen.set(k, X.length);
    if (k === m.key) y = X.length;
    X.push(moveFeatures(m.st, m.c, cd, valueOf(cd.view, m.c)));
  });
  if (X.length < 2 || y < 0) return;
  decs.push({ game: games[n], X, y });
});

// splits per spel: 75% leren, 25% testen
const ids = [...new Set(decs.map((d) => d.game))].sort();
const testGames = new Set(ids.filter((_, i) => i % 4 === 3));
const train = decs.filter((d) => !testGames.has(d.game)), test = decs.filter((d) => testGames.has(d.game));
const K = MOVE_FEATURES.length;

function stats(w: number[], set: Dec[]) {
  let ll = 0, top1 = 0;
  for (const d of set) {
    const s = d.X.map((x) => x.reduce((a, v, k) => a + v * w[k], 0));
    const mx = Math.max(...s);
    const z = s.reduce((a, v) => a + Math.exp(v - mx), 0);
    ll += s[d.y] - mx - Math.log(z);
    if (s[d.y] >= mx - 1e-9) top1++;
  }
  return { ll: +(ll / set.length).toFixed(4), top1: +(top1 / set.length).toFixed(3) };
}

function fit(set: Dec[], l2 = 0.02, epochs = 600, onlyValue = false) {
  const w = new Array(K).fill(0); w[0] = 5;
  const m = new Array(K).fill(0), v = new Array(K).fill(0);
  for (let t = 1; t <= epochs; t++) {
    const g = new Array(K).fill(0);
    for (const d of set) {
      const s = d.X.map((x) => x.reduce((a, val, k) => a + val * w[k], 0));
      const mx = Math.max(...s);
      const e = s.map((x) => Math.exp(x - mx)); const z = e.reduce((a, b) => a + b, 0);
      for (let i = 0; i < d.X.length; i++) {
        const p = e[i] / z - (i === d.y ? 1 : 0);
        for (let k = 0; k < K; k++) g[k] += p * d.X[i][k];
      }
    }
    for (let k = 0; k < K; k++) {
      if (onlyValue && k > 0) { g[k] = 0; continue; }
      g[k] = g[k] / set.length + (k > 0 ? l2 * w[k] : 0);
      m[k] = 0.9 * m[k] + 0.1 * g[k]; v[k] = 0.999 * v[k] + 0.001 * g[k] * g[k];
      w[k] -= 0.05 * (m[k] / (1 - 0.9 ** t)) / (Math.sqrt(v[k] / (1 - 0.999 ** t)) + 1e-8);
    }
  }
  return w;
}

const base = fit(train, 0, 400, true);
console.log('beslissingen', decs.length, 'leren', train.length, 'testen', test.length);
console.log('enkel netwerk  ', JSON.stringify({ train: stats(base, train), test: stats(base, test) }), 'w0', base[0].toFixed(2));
let best: { l2: number; w: number[]; ll: number } | null = null;
for (const l2 of [0.003, 0.01, 0.03, 0.1]) {
  const w = fit(train, l2);
  const st = stats(w, test);
  console.log(`l2 ${l2}`.padEnd(15), JSON.stringify({ train: stats(w, train), test: st }));
  if (!best || st.ll > best.ll) best = { l2, w, ll: st.ll };
}
// eindmodel op alle data
const w = fit(decs, best!.l2);
console.log('gewichten', MOVE_FEATURES.map((n, k) => `${n}: ${w[k].toFixed(2)}`).join('  '));
writeFileSync(out, JSON.stringify({ features: MOVE_FEATURES, w: w.map((x) => +x.toFixed(4)), l2: best!.l2, decisions: decs.length }));
console.log('bewaard', out);

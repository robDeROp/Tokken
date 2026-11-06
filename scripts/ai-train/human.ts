// Vergelijkt computers met echte zetten van mensen (uit move_log).
// node --experimental-strip-types scripts/ai-train/human.ts <human_moves.txt> [net.json]
import { readFileSync } from 'node:fs';
import { botActionLevel, needsFreeExit, type State, type Piece, type Color, type Card, type Action, type Pos, type Rank, type BotLevel } from '../../lib/engine.ts';
import { candidates, valueOf, type Net } from '../../lib/ai.ts';
import { mulberry } from './util.ts';

const canon = (x: unknown): string => Array.isArray(x) ? `[${x.map(canon).join(',')}]`
  : x && typeof x === 'object' ? `{${Object.keys(x as object).sort().map((k) => `${k}:${canon((x as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(x);

export interface HMove { st: State; c: Color; action: Action; key: string }
export function loadHuman(path: string): HMove[] {
  const res: HMove[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const f = line.split('|');
    const c = Number(f[2]) as Color;
    const pos = f[5].split(',').map(Number);
    const pieces: Piece[] = pos.map((v, id) => ({ id, color: Math.floor(id / 4) as Color, pos: (v < 0 ? { t: 'kot' } : v >= 100 ? { t: 'lane', k: v - 100 } : { t: 'track', i: v }) as Pos }));
    const hand: Card[] = f[6] ? f[6].split(',').map((s) => { const [id, rank] = s.split(':'); return { id: Number(id), rank: rank as Rank, suit: 'S' }; }) : [];
    const counts = f[9].split(',').map(Number);
    const hands: Card[][] = counts.map((n, x) => x === c ? hand : Array.from({ length: n }, (_, i) => ({ id: 1000 + x * 10 + i, rank: '2' as Rank, suit: 'S' as const })));
    const st = {
      pieces, hands, sticks: f[7].split(',').map(Number), deck: new Array(50).fill(null), center: [], dealer: 0, turn: c, round: 1, laid: null,
      freeExitDone: f[4] === 'true', winner: null, mode: f[3], playedThisRound: f[8].split(',').map((x) => x === '1'), moveNo: Number(f[1]), last: null, log: [],
    } as unknown as State;
    const action = JSON.parse(f[10]) as Action;
    res.push({ st, c, action, key: keyOf(st, c, action) });
  }
  return res;
}
export function keyOf(st: State, c: Color, a: Action): string {
  if (a.type === 'play') return `play:${st.hands[c].find((h) => h.id === a.card)?.rank}:${canon(a.move)}`;
  if (a.type === 'discardOne') return `d1:${st.hands[c].find((h) => h.id === a.card)?.rank}`;
  return a.type;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const moves = loadHuman(process.argv[2]);
  const net: Net | null = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : null;
  const rng = mulberry(3);
  let choice = 0; const agreeLvl = [0, 0, 0, 0, 0, 0];
  let agreeAI = 0, rankSum = 0, found = 0; const temps = [0.05, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1.0, 1.3]; const ll = temps.map(() => 0);
  const regret: number[] = [];
  for (const m of moves) {
    if (needsFreeExit(m.st.pieces, m.c, m.st.sticks[m.c], m.st.freeExitDone, m.st.hands[m.c])) continue;
    const cands = candidates(m.st, m.c, rng, 3000);
    const keys = cands.map((cd) => keyOf(m.st, m.c, cd.a));
    if (new Set(keys).size < 2) continue; // geen echte keuze
    choice++;
    for (let l = 1; l <= 5; l++) if (keyOf(m.st, m.c, botActionLevel(m.st, m.c, l as BotLevel, mulberry(l))) === m.key) agreeLvl[l]++;
    if (!net) continue;
    const idx = keys.indexOf(m.key);
    if (idx < 0) continue;
    found++;
    // per unieke zet (zelfde rang+zet met een andere kaart = dezelfde keuze)
    const uniq = new Map<string, number>();
    cands.forEach((cd, i) => { if (!uniq.has(keys[i])) uniq.set(keys[i], valueOf(cd.view, m.c, net)); });
    const vals = [...uniq.values()]; const mine = uniq.get(m.key)!;
    const best = Math.max(...vals);
    if (mine >= best - 1e-9) agreeAI++;
    rankSum += vals.filter((v) => v > mine + 1e-9).length + 1;
    regret.push(best - mine);
    const lo = (p: number) => { const q = Math.min(Math.max(p, 1e-4), 1 - 1e-4); return Math.log(q / (1 - q)); };
    const lg = vals.map(lo); const lm = lo(mine); const mx = Math.max(...lg);
    temps.forEach((T, i) => { const z = lg.reduce((s, x) => s + Math.exp((x - mx) / T), 0); ll[i] += (lm - mx) / T - Math.log(z); });
  }
  regret.sort((a, b) => a - b);
  const q = (x: number) => +regret[Math.floor(regret.length * x)].toFixed(4);
  console.log("spijt-kwantielen", [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.98].map((x) => `${x}: ${q(x)}`).join("  "), " aandeel 0:", (regret.filter((r) => r < 1e-6).length / regret.length).toFixed(2));
  console.log(JSON.stringify({
    zetten: moves.length, metKeuze: choice, zelfdeAlsRobot: agreeLvl.slice(1).map((x, i) => `L${i + 1}: ${(100 * x / choice).toFixed(0)}%`),
    ...(net ? { gevonden: found, zelfdeAlsAI: `${(100 * agreeAI / found).toFixed(0)}%`, gemRangVanJouwZet: +(rankSum / found).toFixed(2),
      verliesWinstkans: { mediaan: +regret[Math.floor(regret.length / 2)].toFixed(4), p90: +regret[Math.floor(regret.length * 0.9)].toFixed(4) },
      temperatuur: temps.map((T, i) => `${T}: ${(ll[i] / found).toFixed(3)}`) } : {}),
  }));
}

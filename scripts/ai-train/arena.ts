// Ploeg A tegen ploeg B. Spelers: L1..L5 (robots) of ai:<temp>:<slim afgooien 0/1>[:net.json]
// node --experimental-strip-types scripts/ai-train/arena.ts <A> <B> <spellen> [seed]
import { readFileSync } from 'node:fs';
import { newGame, applyAction, botActionLevel, teamOf, type Color, type State, type Action, type BotLevel } from '../../lib/engine.ts';
import { aiAction, type Net } from '../../lib/ai.ts';
import { mulberry } from './util.ts';

type Player = (st: State, c: Color, rng: () => number) => Action;
const nets = new Map<string, Net>();
export function player(spec: string): Player {
  if (spec.startsWith('L')) { const l = Number(spec.slice(1)) as BotLevel; return (st, c, rng) => botActionLevel(st, c, l, rng); }
  const [, temp, smart, think, file] = spec.split(':');
  const path = file || process.env.NET || '/home/claude/train/net.json';
  const th = think && think !== '0' ? { top: Number(think.split('x')[0]), samples: Number(think.split('x')[1]) } : undefined;
  if (!nets.has(path)) nets.set(path, JSON.parse(readFileSync(path, 'utf8')));
  const net = nets.get(path)!;
  const [slip, cost] = temp.split('/').map(Number);
  const persona = { level: 9 as BotLevel, name: 'x', slip, slipCost: cost || 0.015, smartDiscard: smart === '1', think: th };
  return (st, c, rng) => aiAction(st, c, persona, rng, net);
}

export function arena(a: string, b: string, n: number, seed = 1) {
  const pa = player(a), pb = player(b);
  let winsA = 0, moves = 0;
  const teamKills = [0, 0], oppKills = [0, 0], d1 = [0, 0], dAll = [0, 0];
  for (let g = 0; g < n; g++) {
    const rng = mulberry(seed * 7777 + g * 31 + 5);
    const st = newGame(g % 3 ? 'training' : 'pro', rng);
    const teamA = g % 2;
    let guard = 0;
    while (st.winner === null && guard++ < 8000) {
      const c = st.turn as Color;
      const isA = teamOf(c) === teamA ? 0 : 1;
      const act = (isA === 0 ? pa : pb)(st, c, rng);
      applyAction(st, c, act);
      const last = st.last;
      if (act.type === 'discardOne') d1[isA]++;
      if (act.type === 'discardAll') dAll[isA]++;
      if (last && last.by === c && act.type === 'play') for (const k of last.kills) {
        if (teamOf(st.pieces[k].color) === teamOf(c)) teamKills[isA]++; else oppKills[isA]++;
      }
    }
    if (st.winner === teamA) winsA++;
    moves += st.moveNo;
  }
  const p = winsA / n;
  return { A: a, B: b, n, winRateA: +p.toFixed(3), eloDiff: Math.round(400 * Math.log10(Math.max(p, 0.001) / Math.max(1 - p, 0.001))),
    teamKillsPerGame: teamKills.map((x) => +(x / n).toFixed(2)), oppKillsPerGame: oppKills.map((x) => +(x / n).toFixed(2)),
    discardOnePerGame: d1.map((x) => +(x / n).toFixed(1)), discardAllPerGame: dAll.map((x) => +(x / n).toFixed(1)) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(arena(process.argv[2], process.argv[3], Number(process.argv[4] || 100), Number(process.argv[5] || 1))));
}

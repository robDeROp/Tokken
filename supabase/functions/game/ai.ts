// Tokken AI: computers die een stand leren inschatten door zelf heel veel spellen te spelen.
// Een klein neuraal netwerk schat de winstkans van een stand (vanuit de speler die net zette);
// de AI probeert alle zetten en kiest de beste, of (bij de menselijkere AI's) soms de op één na beste.
// Getraind met scripts/ai-train/*. Gewichten in ai-weights.ts. Gedeeld door website en server.
import {
  START, ENTRY, TRACK, COLORS, teamOf, partnerOf, allInLane, teamDone, pieceAtTrack, makeDeck, applyAction,
  handHasMove, needsFreeExit, allMovesForCard, matchMove, progress, hitChance, botActionLevel, asLevel, BOT_LEVEL_NAME,
  type State, type Piece, type Color, type Card, type Rank, type Action, type Team, type BotLevel,
} from './engine.ts';
import { AI_NET } from './ai-weights.ts';

// ---------- wat de AI "ziet" na een zet ----------
/** Stand direct na een zet, met enkel wat de speler zelf mag weten. */
export interface View {
  pieces: Piece[];
  hand: Card[];          // eigen kaarten na de zet
  handCounts: number[];  // aantal kaarten per speler na de zet
  sticks: number[];
  played: boolean[];     // al een kaart gespeeld deze ronde
  deckCount: number;
}

const RANK_GROUP: Record<Rank, number> = { A: 0, K: 1, '7': 2, J: 3, '5': 4, '4': 5, JK: 6, Q: 7, '2': 8, '3': 8, '6': 8, '8': 8, '9': 8, '10': 8 };
export const N_FEATURES = 4 * 11 + 10 + 2;

/** Kenmerken van een stand vanuit speler c (die net gezet heeft). */
export function features(v: View, c: Color): Float32Array {
  const f = new Float32Array(N_FEATURES);
  const P = v.pieces;
  let k = 0;
  for (let r = 0; r < 4; r++) {
    const x = ((c + r) % 4) as Color; // r=0 ik, 1 volgende (tegenstander), 2 ploegmaat, 3 vorige (tegenstander)
    let prog = 0, kot = 0, lane = 0, risk = 0, onStart = 0, blocked = 0, stretch = 0;
    for (const p of P) {
      if (p.color !== x) continue;
      const pr = progress(p);
      prog += pr;
      if (p.pos.t === 'kot') { kot++; continue; }
      if (p.pos.t === 'lane') { lane++; continue; }
      const i = p.pos.i;
      if (START(x) === i) onStart++;
      risk += hitChance(P, p) * (pr + 18);
      const toEntry = (ENTRY(x) - i + TRACK) % TRACK;
      if (toEntry <= 13) stretch++;
      for (let j = 1; j <= Math.min(toEntry, 18); j++) {
        const b = pieceAtTrack(P, (i + j) % TRACK);
        if (b && b.pos.t === 'track' && START(b.color) === b.pos.i && teamOf(b.color) !== teamOf(x)) { blocked++; break; }
      }
    }
    f[k++] = prog / 300;
    f[k++] = kot / 4;
    f[k++] = lane / 4;
    f[k++] = risk / 100;
    f[k++] = onStart;
    f[k++] = blocked / 4;
    f[k++] = stretch / 4;
    f[k++] = allInLane(P, x) ? 1 : 0;
    f[k++] = v.handCounts[x] / 7;
    f[k++] = Math.min(v.sticks[x], 2) / 2;
    f[k++] = v.played[x] ? 1 : 0;
  }
  const groups = new Array(9).fill(0);
  for (const card of v.hand) groups[RANK_GROUP[card.rank]]++;
  for (let g = 0; g < 9; g++) f[k++] = groups[g] / 2;
  f[k++] = groups[0] + groups[1] > 0 ? 1 : 0;
  f[k++] = v.deckCount / 108;
  f[k++] = v.handCounts.reduce((a, b) => a + b, 0) / 28;
  return f;
}

// ---------- het netwerk ----------
export interface Net { mean: number[]; std: number[]; w1: number[][]; b1: number[]; w2: number[]; b2: number }

/** Geschatte winstkans (0..1) voor de ploeg van c. */
export function netValue(net: Net, x: Float32Array): number {
  const H = net.b1.length;
  let out = net.b2;
  for (let h = 0; h < H; h++) {
    const w = net.w1[h];
    let s = net.b1[h];
    for (let i = 0; i < x.length; i++) s += w[i] * ((x[i] - net.mean[i]) / net.std[i]);
    if (s > 0) out += net.w2[h] * s; // ReLU
  }
  return 1 / (1 + Math.exp(-out));
}

export function valueOf(v: View, c: Color, net: Net | null = AI_NET): number {
  const t = teamOf(c);
  if (teamDone(v.pieces, t)) return 1;
  if (teamDone(v.pieces, (1 - t) as Team)) return 0;
  if (!net) return 0.5;
  return netValue(net, features(v, c));
}

// ---------- mogelijke zetten en de stand erna ----------
export interface Cand { a: Action; view: View }

function baseView(st: State): Omit<View, 'pieces' | 'hand'> {
  return {
    handCounts: st.hands.map((h) => h.length),
    sticks: st.sticks.slice(),
    played: COLORS.map((x) => !!st.playedThisRound?.[x]),
    deckCount: st.deck.length,
  };
}

/** Alle geldige acties (behalve gratis buitenkomen) met de stand erna. 7-splitsingen worden beperkt. */
export function candidates(st: State, c: Color, rng: () => number, max7 = 120): Cand[] {
  const hand = st.hands[c];
  const out: Cand[] = [];
  const b = baseView(st);
  const seen = new Set<Rank>();
  for (const card of hand) {
    if (seen.has(card.rank)) continue;
    seen.add(card.rank);
    let moves = allMovesForCard(st.pieces, c, card.rank);
    if (card.rank === '7' && moves.length > max7) {
      // willekeurige steekproef van splitsingen (een mens bekijkt ze ook niet allemaal)
      const pick = moves.slice();
      for (let i = pick.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pick[i], pick[j]] = [pick[j], pick[i]]; }
      moves = pick.slice(0, max7);
    }
    for (const move of moves) {
      const r = matchMove(st.pieces, c, card.rank, move);
      if (!r) continue;
      const handCounts = b.handCounts.slice(); handCounts[c]--;
      const played = b.played.slice(); played[c] = true;
      const sticks = b.sticks.slice(); sticks[c] = 0;
      out.push({ a: { type: 'play', card: card.id, move }, view: { ...b, pieces: r.P, hand: hand.filter((h) => h.id !== card.id), handCounts, played, sticks } });
    }
  }
  if (!handHasMove(st.pieces, c, hand)) {
    const seenD = new Set<Rank>();
    // met je laatste kaart is "alles afgooien" altijd minstens even goed (zelfde hand, en misschien een stokje)
    if (hand.length > 1) for (const card of hand) {
      if (seenD.has(card.rank)) continue;
      seenD.add(card.rank);
      const handCounts = b.handCounts.slice(); handCounts[c]--;
      const played = b.played.slice(); played[c] = true;
      out.push({ a: { type: 'discardOne', card: card.id }, view: { ...b, pieces: st.pieces, hand: hand.filter((h) => h.id !== card.id), handCounts, played } });
    }
    const handCounts = b.handCounts.slice(); handCounts[c] = 0;
    const sticks = b.sticks.slice(); if (!b.played[c]) sticks[c]++;
    out.push({ a: { type: 'discardAll' }, view: { ...b, pieces: st.pieces, hand: [], handCounts, sticks } });
  }
  return out;
}

/** De stand na een actie (voor de trainingsdata), op dezelfde manier berekend als bij het kiezen. */
export function viewAfter(st: State, c: Color, a: Action): View | null {
  const b = baseView(st);
  const hand = st.hands[c];
  if (a.type === 'play') {
    const card = hand.find((h) => h.id === a.card);
    if (!card) return null;
    const r = matchMove(st.pieces, c, card.rank, a.move);
    if (!r) return null;
    const handCounts = b.handCounts.slice(); handCounts[c]--;
    const played = b.played.slice(); played[c] = true;
    const sticks = b.sticks.slice(); sticks[c] = 0;
    return { ...b, pieces: r.P, hand: hand.filter((h) => h.id !== a.card), handCounts, played, sticks };
  }
  if (a.type === 'discardOne') {
    const handCounts = b.handCounts.slice(); handCounts[c]--;
    const played = b.played.slice(); played[c] = true;
    return { ...b, pieces: st.pieces, hand: hand.filter((h) => h.id !== a.card), handCounts, played };
  }
  if (a.type === 'discardAll') {
    const handCounts = b.handCounts.slice(); handCounts[c] = 0;
    const sticks = b.sticks.slice(); if (!b.played[c]) sticks[c]++;
    return { ...b, pieces: st.pieces, hand: [], handCounts, sticks };
  }
  return null;
}

// ---------- vooruitdenken ----------
/** Een mogelijke wereld: de kaarten die ik niet zie, willekeurig verdeeld over de anderen en het pak. */
export function sampleWorld(st: State, c: Color, rng: () => number): State {
  const seen = new Set<number>();
  for (const h of st.hands[c]) seen.add(h.id);
  for (const cc of st.center) if (cc.card) seen.add(cc.card.id);
  const pool = makeDeck().filter((x) => !seen.has(x.id));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  let k = 0;
  const hands = st.hands.map((h, x) => (x === c ? h.slice() : pool.slice(k, (k += h.length))));
  return {
    ...st, pieces: st.pieces.map((p) => ({ ...p, pos: { ...p.pos } })), hands, deck: pool.slice(k, k + st.deck.length),
    center: st.center.slice(), sticks: st.sticks.slice(), playedThisRound: (st.playedThisRound ?? [false, false, false, false]).slice(),
    homeBy: (st.homeBy ?? [0, 0, 0, 0]).slice(),
    log: [], last: null,
  };
}

function viewOfState(st: State, x: Color): View {
  return { pieces: st.pieces, hand: st.hands[x], handCounts: st.hands.map((h) => h.length), sticks: st.sticks,
    played: COLORS.map((y) => !!st.playedThisRound?.[y]), deckCount: st.deck.length };
}

/** Snelle zet voor de anderen in een gedachte wereld: beste zet volgens het netwerk. */
function quickMove(st: State, x: Color, rng: () => number, net: Net | null): Action {
  if (needsFreeExit(st.pieces, x, st.sticks[x], st.freeExitDone, st.hands[x])) {
    return { type: 'freeExit', piece: st.pieces.find((p) => p.color === x && p.pos.t === 'kot')!.id };
  }
  const cands = candidates(st, x, rng, 25).filter((cd) => cd.a.type !== 'discardAll' || st.hands[x].length <= 1);
  if (!cands.length) return { type: 'discardAll' };
  return chooseAction(cands, x, 0, rng, net);
}

function seeded(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Speel na actie a de beurten van de anderen tot ik weer aan de beurt ben; winstkans voor mijn ploeg.
 *  Elke kandidaat wordt in dezelfde gedachte werelden gespeeld (zelfde seed), zodat enkel de zet het verschil maakt. */
function lookahead(st: State, c: Color, a: Action, seed: number, net: Net | null): number {
  const rng = seeded(seed);
  const w = sampleWorld(st, c, rng);
  try { applyAction(w, c, a); } catch { return 0; }
  let last: Color = c;
  for (let guard = 0; guard < 8 && w.winner === null && w.turn !== c; guard++) {
    const x = w.turn;
    try { applyAction(w, x, quickMove(w, x, rng, net)); } catch { break; }
    last = x;
    // gratis buitenkomen telt niet als beurt: dezelfde speler speelt verder
  }
  if (w.winner !== null) return w.winner === teamOf(c) ? 1 : 0;
  const v = valueOf(viewOfState(w, last), last, net);
  return teamOf(last) === teamOf(c) ? v : 1 - v;
}

/** Kunnen mijn kaarten deze ronde nog nut hebben als ik nu niet kan spelen? */
export function waitingPays(st: State, c: Color): boolean {
  const P = st.pieces;
  // Wachten kost je stokje (dat krijg je enkel als alles afgooien je eerste actie van de ronde is);
  // het loont alleen als je ploegmaat je deze ronde nog kan buitenspelen.
  if (P.some((p) => p.color === c && p.pos.t === 'kot') === false) return false;
  const mate = partnerOf(c);
  if (st.hands[mate].length === 0) return false; // ploegmaat is deze ronde al klaar met spelen
  // ploegmaat is klaar en speelt met mijn pionnen: hij kan mij met een aas of koning buitenzetten
  if (allInLane(P, mate)) return true;
  // ploegmaat heeft er 3 binnen en de laatste staat vlak voor zijn huisje
  const his = P.filter((p) => p.color === mate);
  if (his.filter((p) => p.pos.t === 'lane').length < 3) return false;
  const last = his.find((p) => p.pos.t === 'track');
  if (!last || last.pos.t !== 'track') return false;
  return (ENTRY(mate) - last.pos.i + TRACK) % TRACK <= 13;
}

// ---------- persoonlijkheden ----------
export interface Persona {
  level: BotLevel;
  name: string;
  /** kans dat hij niet de beste zet neemt (een mens ziet niet altijd alles) */
  slip: number;
  /** gemiddelde kost van zo'n mindere zet, in winstkans (0.015 = 1,5%); grote missers zijn zeldzaam */
  slipCost: number;
  /** één per één afgooien en kaarten bijhouden voor als je ploegmaat je buitenspeelt */
  smartDiscard: boolean;
  /** vooruitdenken: de beste `top` zetten elk in `samples` mogelijke werelden doorspelen */
  think?: { top: number; samples: number };
}

/** Hoeveel pionnen van de eigen ploeg (buiten de speler zelf geteld als ploeg) deze zet naar hun kot stuurt. */
function teamKills(before: Piece[], after: Piece[], c: Color): number {
  let n = 0;
  for (const p of before) if (teamOf(p.color) === teamOf(c) && p.pos.t !== 'kot' && after[p.id].pos.t === 'kot') n++;
  return n;
}
/** Een mens slaat zijn ploegmaat enkel als het duidelijk loont: straf in winstkans per geslagen eigen pion. */
const TEAM_KILL_PENALTY = 0.04;

/** Kies een actie: meestal de beste; soms (kans `slip`) een mindere zoals een mens die iets over het hoofd ziet.
 *  De kost van die mindere zet volgt de verdeling die we bij echte spelers zagen (vooral kleine foutjes). */
export function chooseAction(cands: Cand[], c: Color, slip: number, rng: () => number, net: Net | null = AI_NET, before?: Piece[], slipCost = 0.015): Action {
  if (cands.length === 1) return cands[0].a;
  const vals = cands.map((cd) => valueOf(cd.view, c, net) - (before ? TEAM_KILL_PENALTY * teamKills(before, cd.view.pieces, c) : 0));
  let best = 0;
  for (let i = 1; i < vals.length; i++) if (vals[i] > vals[best] + 1e-9 || (Math.abs(vals[i] - vals[best]) <= 1e-9 && rng() < 0.5)) best = i;
  if (slip <= 0 || rng() >= slip) return cands[best].a;
  const target = Math.min(-Math.log(1 - rng()) * slipCost, 6 * slipCost); // exponentieel, afgekapt
  let pick = -1, dist = Infinity;
  for (let i = 0; i < vals.length; i++) {
    if (i === best) continue;
    if (before && teamKills(before, cands[i].view.pieces, c) > teamKills(before, cands[best].view.pieces, c)) continue; // zo'n foutje maakt een mens niet
    const d = Math.abs(vals[best] - vals[i] - target);
    if (d < dist) { dist = d; pick = i; }
  }
  return cands[pick < 0 ? best : pick].a;
}

export function aiAction(st: State, c: Color, persona: Persona, rng: () => number = Math.random, net: Net | null = AI_NET): Action {
  const hand = st.hands[c];
  if (needsFreeExit(st.pieces, c, st.sticks[c], st.freeExitDone, hand)) {
    const p = st.pieces.find((x) => x.color === c && x.pos.t === 'kot')!;
    return { type: 'freeExit', piece: p.id };
  }
  let cands = candidates(st, c, rng);
  if (cands.some((cd) => cd.a.type === 'discardAll')) {
    // Vastgelopen. Kaarten bijhouden (één per één afgooien, de laatste als "alles" voor het stokje)
    // loont enkel als ze deze ronde nog iets kunnen doen; anders meteen alles afgooien.
    const wait = persona.smartDiscard && hand.length > 1 && waitingPays(st, c);
    const pick = cands.filter((cd) => (wait ? cd.a.type !== 'discardAll' : cd.a.type !== 'discardOne'));
    if (pick.length) cands = pick;
  }
  if (!cands.length) return { type: 'discardAll' };
  if (persona.think && cands.length > 1) {
    // eerst snel schatten, dan de beste kandidaten echt doordenken
    const scored = cands.map((cd) => ({ cd, v: valueOf(cd.view, c, net) - TEAM_KILL_PENALTY * teamKills(st.pieces, cd.view.pieces, c) }))
      .sort((x, y) => y.v - x.v);
    const top = scored.slice(0, persona.think.top);
    if (top.length > 1) {
      const seeds = Array.from({ length: persona.think.samples }, () => Math.floor(rng() * 2 ** 31));
      for (const t of top) {
        let sum = 0;
        for (const seed of seeds) sum += lookahead(st, c, t.cd.a, seed, net);
        // half de gedachte toekomst, half de eerste indruk
        t.v = 0.5 * t.v + 0.5 * (sum / seeds.length - TEAM_KILL_PENALTY * teamKills(st.pieces, t.cd.view.pieces, c));
      }
      top.sort((x, y) => y.v - x.v);
      return top[0].cd.a;
    }
  }
  return chooseAction(cands, c, persona.slip, rng, net, st.pieces, persona.slipCost);
}

// ---------- alle computers samen ----------
export const AI_PERSONAS: Persona[] = [
  // Jules: los, mist vaker iets en gooit ook vaak alles af zoals veel mensen
  { level: 6, name: BOT_LEVEL_NAME[6].nl, slip: 0.25, slipCost: 0.012, smartDiscard: false },
  // Mia: af en toe een klein foutje (vooral zetten die maar een fractie slechter zijn), afgooien zoals een goede speler
  { level: 7, name: BOT_LEVEL_NAME[7].nl, slip: 0.12, slipCost: 0.008, smartDiscard: true },
  // Staf: altijd de beste zet volgens het netwerk
  { level: 8, name: BOT_LEVEL_NAME[8].nl, slip: 0, slipCost: 0, smartDiscard: true },
  // Bompa Fons: denkt de 6 beste zetten door in 12 mogelijke werelden (de kaarten die hij niet ziet)
  { level: 9, name: BOT_LEVEL_NAME[9].nl, slip: 0, slipCost: 0, smartDiscard: true, think: { top: 6, samples: 12 } },
];
export const personaOf = (level: number): Persona | null => AI_PERSONAS.find((p) => p.level === level) ?? null;

/** Zet van een computer op eender welk niveau (1–5 robots, 6+ AI). */
export function botMove(st: State, c: Color, level: number, rng: () => number = Math.random): Action {
  const persona = personaOf(level);
  if (persona && AI_NET) return aiAction(st, c, persona, rng);
  return botActionLevel(st, c, asLevel(Math.min(level, 5)), rng);
}

// Tokken — spelregels-engine.
// Pure TypeScript zonder imports: wordt gedeeld door de website (Next.js) en de server (Supabase Edge Function / Deno).

export const TRACK = 72; // 4 x 18 vakjes
export const SEG = 18;

export type Color = 0 | 1 | 2 | 3; // 0 geel, 1 blauw, 2 oranje, 3 groen (in wijzerzin)
export const COLORS: Color[] = [0, 1, 2, 3];
export type Team = 0 | 1; // 0 = geel+oranje, 1 = blauw+groen

export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'JK';
export type Suit = 'S' | 'H' | 'D' | 'C' | 'X';
export interface Card { id: number; rank: Rank; suit: Suit }

export type Pos = { t: 'kot' } | { t: 'track'; i: number } | { t: 'lane'; k: number };
export interface Piece { id: number; color: Color; pos: Pos }

export type Mode = 'training' | 'hulp' | 'pro';

export type Move =
  | { kind: 'out'; piece: number }
  | { kind: 'step'; piece: number; to: Pos }
  | { kind: 'swap'; piece: number; target: number }
  | { kind: 'seven'; steps: { piece: number; to: Pos }[] };

export type Action =
  | { type: 'lay'; card: number }
  | { type: 'play'; card: number; move: Move }
  | { type: 'discardOne'; card: number }
  | { type: 'discardAll' }
  | { type: 'freeExit'; piece: number };

export interface CenterCard { card: Card | null; hidden: boolean; by: Color }

export interface MoveTrace { piece: number; from: Pos; to: Pos }
export interface LastMove {
  by: Color;
  kind: 'play' | 'discardOne' | 'discardAll' | 'freeExit';
  rank?: Rank;
  moves: MoveTrace[];
  kills: number[];
  swap?: [number, number];
  count?: number;
  /** Whether an all-cards discard actually earned a stick. */
  earnsStick?: boolean;
}

export interface LogEntry extends LastMove { n: number; round: number }

export interface State {
  pieces: Piece[];
  sticks: number[];
  hands: Card[][];
  deck: Card[];
  center: CenterCard[];
  dealer: Color;
  turn: Color;
  round: number;
  laid: number | null; // kaart die op tafel "plakt" (hulp/pro)
  freeExitDone: boolean;
  winner: Team | null;
  mode: Mode;
  /** Whether this seat played any card in the current hand round. */
  playedThisRound: boolean[];
  moveNo: number;
  last: LastMove | null;
  log: LogEntry[];
}

export type PublicState = Omit<State, 'hands' | 'deck'> & {
  handCounts: number[];
  deckCount: number;
  laidCard: Card | null;
};

// ---------- basis ----------

export const START = (c: Color) => c * SEG;
export const ENTRY = (c: Color) => (((c + 3) % 4) * SEG + 15); // het "16"-vakje vóór je eigen 1
export const teamOf = (c: Color): Team => (c % 2) as Team;
export const partnerOf = (c: Color): Color => ((c + 2) % 4) as Color;
export const nextColor = (c: Color): Color => ((c + 1) % 4) as Color;

export const RANK_VALUE: Record<Rank, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, JK: 25,
};

export function posEq(a: Pos, b: Pos): boolean {
  if (a.t !== b.t) return false;
  if (a.t === 'track') return a.i === (b as { i: number }).i;
  if (a.t === 'lane') return a.k === (b as { k: number }).k;
  return true;
}

/** Nummer zoals op het bord (1..18 per stuk; 17..20 in het huisje). */
export function squareLabel(pos: Pos): string {
  if (pos.t === 'track') return String((pos.i % SEG) + 1);
  if (pos.t === 'lane') return String(17 + pos.k);
  return 'kot';
}

export function makeDeck(): Card[] {
  const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const suits: Suit[] = ['S', 'H', 'D', 'C'];
  const cards: Card[] = [];
  let id = 0;
  for (let d = 0; d < 2; d++) for (const s of suits) for (const r of ranks) cards.push({ id: id++, rank: r, suit: s });
  for (let j = 0; j < 4; j++) cards.push({ id: id++, rank: 'JK', suit: 'X' });
  return cards;
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newGame(mode: Mode, rng: () => number = Math.random): State {
  const pieces: Piece[] = [];
  for (const c of COLORS) for (let n = 0; n < 4; n++) pieces.push({ id: c * 4 + n, color: c, pos: { t: 'kot' } });
  const st: State = {
    pieces,
    sticks: [0, 0, 0, 0],
    hands: [[], [], [], []],
    deck: shuffle(makeDeck(), rng),
    center: [],
    dealer: Math.floor(rng() * 4) as Color,
    turn: 0,
    round: 0,
    laid: null,
    freeExitDone: false,
    winner: null,
    mode,
    playedThisRound: [false, false, false, false],
    moveNo: 0,
    last: null,
    log: [],
  };
  deal(st);
  return st;
}

/** Deel 7 kaarten, één per één, te beginnen links (wijzerzin) van de deler. */
function deal(st: State) {
  st.round += 1;
  st.playedThisRound = [false, false, false, false];
  for (let r = 0; r < 7; r++) {
    for (let s = 1; s <= 4; s++) {
      const seat = ((st.dealer + s) % 4) as Color;
      const card = st.deck.shift();
      if (card) st.hands[seat].push(card);
    }
  }
  st.turn = nextColor(st.dealer);
}

// ---------- bord-hulpjes (werken op een stukken-lijst) ----------

export function pieceAtTrack(P: Piece[], i: number): Piece | undefined {
  return P.find((p) => p.pos.t === 'track' && p.pos.i === i);
}
/** Een pion op zijn EIGEN 1 blokkeert alles, in beide richtingen. */
export function isBlocker(P: Piece[], i: number): boolean {
  const p = pieceAtTrack(P, i);
  return !!p && START(p.color) === i;
}
function laneOcc(P: Piece[], c: Color, k: number): boolean {
  return P.some((p) => p.color === c && p.pos.t === 'lane' && p.pos.k === k);
}
export function allInLane(P: Piece[], c: Color): boolean {
  return P.filter((p) => p.color === c).every((p) => p.pos.t === 'lane');
}
/** Met welke kleur speel je: je eigen, of die van je teammate als je zelf klaar bent. */
export function controlledColor(P: Piece[], c: Color): Color {
  return allInLane(P, c) ? partnerOf(c) : c;
}

interface Target { to: Pos; passed: number[] }

/** Vooruit n stappen. Huisje: exact uitkomen, overspringen mag, landen op eigen pion niet. */
export function forwardTargets(P: Piece[], p: Piece, n: number): Target[] {
  const res: Target[] = [];
  if (p.pos.t === 'lane') {
    const k = p.pos.k + n;
    if (k <= 3 && !laneOcc(P, p.color, k)) res.push({ to: { t: 'lane', k }, passed: [] });
    return res;
  }
  if (p.pos.t !== 'track') return res;
  const i = p.pos.i;
  const passed: number[] = [];
  let blockedAt = Infinity;
  for (let j = 1; j <= n; j++) {
    const sq = (i + j) % TRACK;
    if (isBlocker(P, sq)) { blockedAt = j; break; }
    if (j < n) passed.push(sq);
  }
  if (blockedAt > n) res.push({ to: { t: 'track', i: (i + n) % TRACK }, passed });
  const d = (ENTRY(p.color) - i + TRACK) % TRACK;
  if (d < n && blockedAt > d) {
    const k = n - d - 1;
    if (k <= 3 && !laneOcc(P, p.color, k)) {
      const pp: number[] = [];
      for (let j = 1; j <= d; j++) pp.push((i + j) % TRACK);
      res.push({ to: { t: 'lane', k }, passed: pp });
    }
  }
  return res;
}

/** 4 achteruit: enkel op het parcours, nooit in of uit het huisje. */
function backwardTarget(P: Piece[], p: Piece, n: number): Target | null {
  if (p.pos.t !== 'track') return null;
  const i = p.pos.i;
  for (let j = 1; j <= n; j++) if (isBlocker(P, (i - j + TRACK) % TRACK)) return null;
  return { to: { t: 'track', i: (i - n + TRACK) % TRACK }, passed: [] };
}

function canComeOut(P: Piece[], c: Color): boolean {
  if (!P.some((p) => p.color === c && p.pos.t === 'kot')) return false;
  const occ = pieceAtTrack(P, START(c));
  return !(occ && occ.color === c);
}

/** Verzet een pion; doodt wie er staat (en bij de koning: iedereen onderweg). Muteert P. */
function relocate(P: Piece[], pid: number, to: Pos, killPassed: number[], kills: number[]): MoveTrace {
  const p = P[pid];
  const from = p.pos;
  for (const sq of killPassed) {
    const v = pieceAtTrack(P, sq);
    if (v && v.id !== pid) { v.pos = { t: 'kot' }; kills.push(v.id); }
  }
  if (to.t === 'track') {
    const v = pieceAtTrack(P, to.i);
    if (v && v.id !== pid) { v.pos = { t: 'kot' }; kills.push(v.id); }
  }
  p.pos = to;
  return { piece: pid, from, to };
}

function clonePieces(P: Piece[]): Piece[] {
  return P.map((p) => ({ id: p.id, color: p.color, pos: { ...p.pos } as Pos }));
}

// ---------- zetten per kaart ----------

interface Gen { move: Move; killPassed?: number[] }

/** Alle zetten voor een kaart (behalve de 7, zie sevenNext/allSevenMoves). */
export function movesForRank(P: Piece[], c: Color, rank: Rank): Gen[] {
  const cc = controlledColor(P, c);
  const mine = P.filter((p) => p.color === cc && p.pos.t !== 'kot');
  const out: Gen[] = [];
  const addForward = (list: Piece[], n: number, killAll = false) => {
    for (const p of list) for (const t of forwardTargets(P, p, n)) out.push({ move: { kind: 'step', piece: p.id, to: t.to }, killPassed: killAll ? t.passed : [] });
  };
  if ((rank === 'A' || rank === 'K') && canComeOut(P, cc)) {
    const kp = P.find((p) => p.color === cc && p.pos.t === 'kot')!;
    out.push({ move: { kind: 'out', piece: kp.id } });
  }
  switch (rank) {
    case 'A': addForward(mine, 1); break;
    case 'K': addForward(mine, 13, true); break;
    case '4':
      for (const p of mine) { const t = backwardTarget(P, p, 4); if (t) out.push({ move: { kind: 'step', piece: p.id, to: t.to }, killPassed: [] }); }
      break;
    case '5': {
      const others = P.filter((p) => p.color !== cc && p.pos.t === 'track' && START(p.color) !== p.pos.i);
      addForward(mine, 5);
      addForward(others, 5);
      break;
    }
    case 'J': {
      addForward(mine, 11);
      for (const p of mine) {
        if (p.pos.t !== 'track') continue;
        for (const q of P) {
          if (q.id === p.id || q.pos.t !== 'track' || START(q.color) === q.pos.i) continue;
          out.push({ move: { kind: 'swap', piece: p.id, target: q.id } });
        }
      }
      break;
    }
    case '7': break;
    default: addForward(mine, RANK_VALUE[rank]);
  }
  return out;
}

export interface SevenOption { piece: number; to: Pos; n: number }

/** Mogelijke volgende deelstap van een 7 (zonder te checken of je de 7 kan afmaken). */
function sevenRaw(P: Piece[], c: Color, remaining: number, lastPiece: number | null): SevenOption[] {
  const cc = controlledColor(P, c);
  const res: SevenOption[] = [];
  for (const p of P) {
    if (p.color !== cc || p.pos.t === 'kot' || p.id === lastPiece) continue;
    for (let n = 1; n <= remaining; n++) for (const t of forwardTargets(P, p, n)) res.push({ piece: p.id, to: t.to, n });
  }
  return res;
}

function sevenCompletable(P: Piece[], c: Color, remaining: number, lastPiece: number | null, needsTrack = false): boolean {
  if (remaining === 0) return !needsTrack;
  for (const o of sevenRaw(P, c, remaining, lastPiece)) {
    const Q = clonePieces(P);
    relocate(Q, o.piece, o.to, [], []);
    if (sevenCompletable(Q, c, remaining - o.n, o.piece, needsTrack && P[o.piece].pos.t !== 'track')) return true;
  }
  return false;
}

/** Voer al gezette deelstappen uit; geeft de stand terug of een fout. */
export function applySevenSteps(P0: Piece[], c: Color, steps: { piece: number; to: Pos }[]):
  { P: Piece[]; remaining: number; last: number | null; traces: MoveTrace[]; kills: number[] } | null {
  const P: Piece[] = clonePieces(P0);
  let remaining = 7;
  let last: number | null = null;
  const traces: MoveTrace[] = [];
  const kills: number[] = [];
  for (const s of steps) {
    const opt: SevenOption | undefined = sevenRaw(P, c, remaining, last).find((o) => o.piece === s.piece && posEq(o.to, s.to));
    if (!opt) return null;
    traces.push(relocate(P, opt.piece, opt.to, [], kills));
    remaining -= opt.n;
    last = opt.piece;
  }
  return { P, remaining, last, traces, kills };
}

/** Volgende deelstappen die nog tot een volledige 7 kunnen leiden. */
export function sevenNext(P: Piece[], c: Color, steps: { piece: number; to: Pos }[]): SevenOption[] {
  const r = applySevenSteps(P, c, steps);
  if (!r || r.remaining === 0) return [];
  return sevenRaw(r.P, c, r.remaining, r.last).filter((o) => {
    const Q = clonePieces(r.P);
    relocate(Q, o.piece, o.to, [], []);
    return sevenCompletable(Q, c, r.remaining - o.n, o.piece);
  });
}

export function allSevenMoves(P: Piece[], c: Color, cap = 1500): Move[] {
  const res: Move[] = [];
  const rec = (Q: Piece[], remaining: number, last: number | null, steps: { piece: number; to: Pos }[]) => {
    if (res.length >= cap) return;
    if (remaining === 0) { res.push({ kind: 'seven', steps: steps.slice() }); return; }
    for (const o of sevenRaw(Q, c, remaining, last)) {
      const R = clonePieces(Q);
      relocate(R, o.piece, o.to, [], []);
      steps.push({ piece: o.piece, to: o.to });
      rec(R, remaining - o.n, o.piece, steps);
      steps.pop();
      if (res.length >= cap) return;
    }
  };
  rec(P, 7, null, []);
  return res;
}

export function rankHasMove(P: Piece[], c: Color, rank: Rank): boolean {
  if (rank === '7') return sevenCompletable(P, c, 7, null);
  return movesForRank(P, c, rank).length > 0;
}

/** Older saved games reconstruct this flag from their current-round action log. */
export function playedCardThisRound(st: Pick<State, 'round' | 'log'> & Partial<Pick<State, 'playedThisRound'>>, c: Color): boolean {
  if (st.playedThisRound?.[c] !== undefined) return st.playedThisRound[c];
  return st.log.some((entry) => entry.round === st.round && entry.by === c && entry.kind === 'play');
}

export function handHasMove(P: Piece[], c: Color, hand: Card[]): boolean {
  const seen = new Set<Rank>();
  for (const card of hand) {
    if (seen.has(card.rank)) continue;
    seen.add(card.rank);
    // Alleen schuiven binnen het huisje verplicht je niet om te spelen.
    if (card.rank === '7' ? sevenCompletable(P, c, 7, null, true) :
      movesForRank(P, c, card.rank).some(({ move }) => move.kind === 'out' ||
        (move.kind !== 'seven' && P[move.piece].pos.t === 'track'))) return true;
  }
  return false;
}

/** Gratis buitenkomen na 2 stokjes: enkel als je deze beurt geen aas of koning hebt. */
export function needsFreeExit(P: Piece[], c: Color, sticks: number, freeExitDone: boolean, hand: Card[]): boolean {
  if (sticks < 2 || freeExitDone || hand.length === 0) return false;
  if (hand.some((h) => h.rank === 'A' || h.rank === 'K')) return false;
  if (controlledColor(P, c) !== c) return false;
  return canComeOut(P, c);
}

// ---------- een zet uitvoeren ----------

function matchMove(P: Piece[], c: Color, rank: Rank, move: Move): { traces: MoveTrace[]; kills: number[]; swap?: [number, number]; P: Piece[] } | null {
  if (rank === '7') {
    if (move.kind !== 'seven') return null;
    const r = applySevenSteps(P, c, move.steps);
    if (!r || r.remaining !== 0) return null;
    return { traces: r.traces, kills: r.kills, P: r.P };
  }
  const gens = movesForRank(P, c, rank);
  const Q = clonePieces(P);
  const kills: number[] = [];
  if (move.kind === 'out') {
    const g = gens.find((x) => x.move.kind === 'out');
    const pc = P[move.piece];
    if (!g || !pc || pc.pos.t !== 'kot' || pc.color !== controlledColor(P, c)) return null;
    const tr = relocate(Q, move.piece, { t: 'track', i: START(pc.color) }, [], kills);
    return { traces: [tr], kills, P: Q };
  }
  if (move.kind === 'step') {
    const g = gens.find((x) => x.move.kind === 'step' && x.move.piece === move.piece && posEq(x.move.to, move.to));
    if (!g) return null;
    const tr = relocate(Q, move.piece, move.to, g.killPassed ?? [], kills);
    return { traces: [tr], kills, P: Q };
  }
  if (move.kind === 'swap') {
    const g = gens.find((x) => x.move.kind === 'swap' && x.move.piece === move.piece && x.move.target === move.target);
    if (!g) return null;
    const a = Q[move.piece], b = Q[move.target];
    const pa = a.pos, pb = b.pos;
    a.pos = pb; b.pos = pa;
    return { traces: [{ piece: a.id, from: pa, to: pb }, { piece: b.id, from: pb, to: pa }], kills, swap: [a.id, b.id], P: Q };
  }
  return null;
}

export function teamDone(P: Piece[], t: Team): boolean {
  return P.filter((p) => teamOf(p.color) === t).every((p) => p.pos.t === 'lane');
}

export class RuleError extends Error {}

function pushLog(st: State, lm: LastMove) {
  st.last = lm;
  st.log.push({ ...lm, n: st.moveNo, round: st.round });
  if (st.log.length > 60) st.log.splice(0, st.log.length - 60);
}

/** Past een actie toe op st (muteert). Gooit RuleError met een code bij een ongeldige actie. */
export function applyAction(st: State, c: Color, a: Action): void {
  if (st.winner !== null) throw new RuleError('game_over');
  if (st.turn !== c) throw new RuleError('not_your_turn');
  // Fill the new field lazily for games already in progress during an upgrade.
  if (!Array.isArray(st.playedThisRound)) {
    st.playedThisRound = COLORS.map((color) => playedCardThisRound(st, color));
  }
  const hand = st.hands[c];
  const free = needsFreeExit(st.pieces, c, st.sticks[c], st.freeExitDone, hand);
  if (free && a.type !== 'freeExit') throw new RuleError('free_exit_first');
  const findCard = (id: number) => {
    const idx = hand.findIndex((h) => h.id === id);
    if (idx < 0) throw new RuleError('no_such_card');
    return idx;
  };

  switch (a.type) {
    case 'freeExit': {
      if (!free) throw new RuleError('no_free_exit');
      const p = st.pieces[a.piece];
      if (!p || p.color !== c || p.pos.t !== 'kot') throw new RuleError('illegal_move');
      const kills: number[] = [];
      const tr = relocate(st.pieces, p.id, { t: 'track', i: START(c) }, [], kills);
      st.sticks[c] = 0;
      st.freeExitDone = true;
      pushLog(st, { by: c, kind: 'freeExit', moves: [tr], kills });
      st.moveNo++;
      return; // beurt gaat verder: nu nog een kaart spelen
    }
    case 'lay': {
      findCard(a.card);
      st.laid = a.card;
      st.moveNo++;
      return;
    }
    case 'play': {
      const idx = findCard(a.card);
      const card = hand[idx];
      const r = matchMove(st.pieces, c, card.rank, a.move);
      if (!r) throw new RuleError('illegal_move');
      st.pieces = r.P;
      hand.splice(idx, 1);
      st.center.push({ card, hidden: false, by: c });
      st.playedThisRound[c] = true;
      st.sticks[c] = 0;
      pushLog(st, { by: c, kind: 'play', rank: card.rank, moves: r.traces, kills: r.kills, swap: r.swap });
      if (teamDone(st.pieces, teamOf(c))) st.winner = teamOf(c);
      else if (teamDone(st.pieces, (1 - teamOf(c)) as Team)) st.winner = (1 - teamOf(c)) as Team;
      endTurn(st);
      return;
    }
    case 'discardOne': {
      const idx = findCard(a.card);
      if (handHasMove(st.pieces, c, hand)) throw new RuleError('must_play');
      const [card] = hand.splice(idx, 1);
      st.center.push({ card, hidden: false, by: c });
      pushLog(st, { by: c, kind: 'discardOne', rank: card.rank, moves: [], kills: [] });
      endTurn(st);
      return;
    }
    case 'discardAll': {
      if (hand.length === 0) throw new RuleError('no_cards');
      if (handHasMove(st.pieces, c, hand)) throw new RuleError('must_play');
      const n = hand.length;
      for (const card of hand) st.center.push({ card, hidden: true, by: c });
      st.hands[c] = [];
      const earnsStick = !playedCardThisRound(st, c);
      if (earnsStick) st.sticks[c] += 1;
      pushLog(st, { by: c, kind: 'discardAll', moves: [], kills: [], count: n, earnsStick });
      endTurn(st);
      return;
    }
  }
  throw new RuleError('bad_action');
}

function endTurn(st: State) {
  st.laid = null;
  st.freeExitDone = false;
  st.moveNo++;
  if (st.winner !== null) return;
  for (let s = 1; s <= 4; s++) {
    const seat = ((st.turn + s) % 4) as Color;
    if (st.hands[seat].length > 0) { st.turn = seat; return; }
  }
  // Ronde voorbij: gespeelde kaarten onderaan het pak (niet schudden), deler schuift door.
  for (const cc of st.center) if (cc.card) st.deck.push(cc.card);
  st.center = [];
  st.dealer = nextColor(st.dealer);
  deal(st);
}

export function publicView(st: State): PublicState {
  const { hands, deck, ...rest } = st;
  const laidCard = st.laid !== null ? hands[st.turn].find((h) => h.id === st.laid) ?? null : null;
  return {
    ...rest,
    center: st.center.map((cc) => (cc.hidden ? { card: null, hidden: true, by: cc.by } : cc)),
    handCounts: hands.map((h) => h.length),
    deckCount: deck.length,
    laidCard,
  };
}

// ---------- computerspeler ----------

function progress(p: Piece): number {
  if (p.pos.t === 'kot') return -18;
  if (p.pos.t === 'lane') return 76 + p.pos.k * 2;
  const d = (p.pos.i - START(p.color) + TRACK) % TRACK;
  let v = d <= 69 ? d : d - 72;
  if (d === 0) v += 2; // veilig op eigen 1
  return v;
}

function evaluate(P: Piece[], t: Team): number {
  let s = 0;
  for (const p of P) s += (teamOf(p.color) === t ? 1 : -0.9) * progress(p);
  if (teamDone(P, t)) s += 10000;
  return s;
}

export function allMovesForCard(P: Piece[], c: Color, rank: Rank): Move[] {
  if (rank === '7') return allSevenMoves(P, c);
  return movesForRank(P, c, rank).map((g) => g.move);
}

// --- tactische evaluatie ---
// Kans dat een tegenstander die d vakjes achter je staat je met één kaart raakt (hand van ~4 kaarten:
// ~27% kans per kaartsoort). Kaarten die raken: precies d, de koning (slaat alles onderweg tot 13),
// de 7 (splitsen, tot 7) en de joker (25).
const PER_RANK = 0.27;
const HIT: number[] = (() => {
  const h: number[] = [];
  for (let d = 0; d <= 25; d++) {
    let ranks = 0;
    if (d >= 1 && d <= 13 && d !== 4 && d !== 7) ranks++;   // de kaart met die waarde (4 gaat achteruit)
    if (d >= 1 && d <= 13) ranks++;                          // koning: landen of voorbijsteken
    if (d >= 1 && d <= 7) ranks++;                           // 7 splitsen
    if (d === 25) ranks++;                                   // joker
    h.push(ranks ? 1 - Math.pow(1 - PER_RANK, ranks) : 0);
  }
  return h;
})();
export const AI = { risk: 0.45, threat: 0, block: 3, keep: 4, plan: 0.3, planTop: 6 }; // afgesteld via scripts/ai-tournament.ts (74% winst tegen de oude)

function pathBlocked(P: Piece[], from: number, d: number): boolean {
  for (let j = 1; j < d; j++) if (isBlocker(P, (from + j) % TRACK)) return true;
  return false;
}

/** Kans dat pion v (op het parcours) vóór zijn volgende beurt geslagen wordt door een tegenstander. */
function hitChance(P: Piece[], v: Piece): number {
  if (v.pos.t !== 'track' || START(v.color) === v.pos.i) return 0; // huisje en eigen 1 zijn veilig
  const i = v.pos.i;
  let miss = 1;
  for (const a of P) {
    if (teamOf(a.color) === teamOf(v.color)) continue;
    if (a.pos.t === 'kot') continue;
    if (a.pos.t !== 'track') continue;
    const d = (i - a.pos.i + TRACK) % TRACK;
    // a moet langs zijn eigen ingang? dan gaat hij het huisje in i.p.v. verder (kan ook rondgaan; halve kans)
    if (d >= 1 && d <= 25 && HIT[d] > 0 && !pathBlocked(P, a.pos.i, d)) {
      const toEntry = (ENTRY(a.color) - a.pos.i + TRACK) % TRACK;
      miss *= 1 - HIT[d] * (toEntry < d ? 0.6 : 1);
    }
    const back = (a.pos.i - i + TRACK) % TRACK;
    if (back === 4 && !pathBlocked(P, i, 4)) miss *= 1 - PER_RANK;      // 4 achteruit
  }
  // op de 1 van een tegenstander die nog in zijn kot zit: aas of koning = eruit en slaan
  for (const c of COLORS) {
    if (teamOf(c) === teamOf(v.color) || START(c) !== i) continue;
    if (P.some((p) => p.color === c && p.pos.t === 'kot')) miss *= 1 - (1 - Math.pow(1 - PER_RANK, 2));
  }
  return 1 - miss;
}

/** Waarde van een stand voor ploeg t (hoger = beter). */
function evaluateTactical(P: Piece[], t: Team, W: typeof AI = AI): number {
  if (teamDone(P, t)) return 100000;
  if (teamDone(P, (1 - t) as Team)) return -100000;
  let s = 0;
  for (const p of P) {
    const sign = teamOf(p.color) === t ? 1 : -0.95;
    const prog = progress(p);
    let v = prog;
    if (p.pos.t === 'track') {
      // risico: verwachte achteruitgang als hij geslagen wordt (terug naar kot = -18)
      v -= W.risk * hitChance(P, p) * (prog + 18);
      // geblokkeerd door een pion van de andere ploeg op zijn eigen 1, tussen hem en zijn huisje
      const toEntry = (ENTRY(p.color) - p.pos.i + TRACK) % TRACK;
      for (let j = 1; j <= Math.min(toEntry, 18); j++) {
        const b = pieceAtTrack(P, (p.pos.i + j) % TRACK);
        if (b && b.pos.t === 'track' && START(b.color) === b.pos.i && teamOf(b.color) !== teamOf(p.color)) { v -= W.block; break; }
      }
    }
    s += sign * v;
  }
  // dreiging: onze pionen die vlak achter een tegenstander staan (die moet vluchten)
  if (W.threat) for (const a of P) {
    if (a.pos.t !== 'track') continue;
    for (const v of P) {
      if (v.pos.t !== 'track' || teamOf(v.color) === teamOf(a.color) || START(v.color) === v.pos.i) continue;
      const d = (v.pos.i - a.pos.i + TRACK) % TRACK;
      if (d >= 1 && d <= 13) s += (teamOf(a.color) === t ? 1 : -1) * W.threat * HIT[d] * (progress(v) + 18) * 0.3;
    }
  }
  return s;
}

/** Hoeveel een kaart waard is om bij te houden (voorkeur om "goedkope" kaarten eerst te spelen). */
function keepValue(P: Piece[], c: Color, rank: Rank): number {
  const cc = controlledColor(P, c);
  const inKot = P.filter((p) => p.color === cc && p.pos.t === 'kot').length;
  switch (rank) {
    case 'A': case 'K': return inKot ? 2.5 : 1;
    case '7': return 2;
    case '5': case 'J': return 1.5;
    case '4': return 1;
    case 'JK': return 1.5;
    default: return 0;
  }
}

export function botAction(st: State, c: Color, rng: () => number = Math.random, opts: Partial<typeof AI> = {}): Action {
  const W = { ...AI, ...opts };
  const hand = st.hands[c];
  if (needsFreeExit(st.pieces, c, st.sticks[c], st.freeExitDone, hand)) {
    const p = st.pieces.find((x) => x.color === c && x.pos.t === 'kot')!;
    return { type: 'freeExit', piece: p.id };
  }
  if (!handHasMove(st.pieces, c, hand)) return { type: 'discardAll' };
  const t = teamOf(c);
  const cands: { a: Action; s: number; P: Piece[]; card: Card }[] = [];
  const seen = new Set<Rank>();
  for (const card of hand) {
    if (seen.has(card.rank)) continue;
    seen.add(card.rank);
    const keep = W.keep * keepValue(st.pieces, c, card.rank);
    for (const move of allMovesForCard(st.pieces, c, card.rank)) {
      const r = matchMove(st.pieces, c, card.rank, move);
      if (!r) continue;
      const s = evaluateTactical(r.P, t, W) - keep + rng() * 0.2;
      cands.push({ a: { type: 'play', card: card.id, move }, s, P: r.P, card });
    }
  }
  if (!cands.length) return discardChoice(st, c);
  cands.sort((x, y) => y.s - x.s);
  if (W.plan > 0 && hand.length > 1) {
    // vooruitkijken: wat kan ik volgende beurt nog met de overgebleven kaarten?
    for (const cd of cands.slice(0, W.planTop)) {
      const base = evaluateTactical(cd.P, t, W);
      let follow = -Infinity;
      const seen2 = new Set<Rank>();
      for (const card of hand) {
        if (card.id === cd.card.id || seen2.has(card.rank) || card.rank === '7') continue;
        seen2.add(card.rank);
        for (const move of allMovesForCard(cd.P, c, card.rank)) {
          const r = matchMove(cd.P, c, card.rank, move);
          if (r) follow = Math.max(follow, evaluateTactical(r.P, t, W) - base);
        }
      }
      if (follow === -Infinity) follow = hand.some((h) => h.id !== cd.card.id && h.rank === '7') ? 0 : -8;
      cd.s += W.plan * follow;
    }
    cands.sort((x, y) => y.s - x.s);
  }
  return cands[0].a;
}

function discardChoice(st: State, c: Color): Action {
  const hand = st.hands[c];
  const P = st.pieces;
  const cc = controlledColor(P, c);
  const onBoard = P.some((p) => p.color === cc && p.pos.t !== 'kot');
  if (onBoard) {
    // gooi de minst nuttige kaart weg, hou de 5 en boer
    const order: Rank[] = ['2', '3', '6', '8', '9', '10', 'Q', 'JK', '4', '7', 'A', 'K', 'J', '5'];
    const sorted = hand.slice().sort((a, b) => order.indexOf(a.rank) - order.indexOf(b.rank));
    return { type: 'discardOne', card: sorted[0].id };
  }
  return { type: 'discardAll' };
}

/** De vorige, eenvoudige computerspeler (ter vergelijking in de tests). */
export function botActionSimple(st: State, c: Color, rng: () => number = Math.random): Action {
  const hand = st.hands[c];
  if (needsFreeExit(st.pieces, c, st.sticks[c], st.freeExitDone, hand)) {
    const p = st.pieces.find((x) => x.color === c && x.pos.t === 'kot')!;
    return { type: 'freeExit', piece: p.id };
  }
  if (!handHasMove(st.pieces, c, hand)) return { type: 'discardAll' };
  const t = teamOf(c);
  let best: { a: Action; s: number } | null = null;
  const seen = new Set<Rank>();
  for (const card of hand) {
    if (seen.has(card.rank)) continue;
    seen.add(card.rank);
    for (const move of allMovesForCard(st.pieces, c, card.rank)) {
      const r = matchMove(st.pieces, c, card.rank, move);
      if (!r) continue;
      // kleine voorkeur om waardevolle kaarten (5, boer, 7, aas, koning) te sparen
      const keep = ['5', 'J', '7', 'A', 'K'].includes(card.rank) ? 1.5 : 0;
      const s = evaluate(r.P, t) - keep + rng() * 0.5;
      if (!best || s > best.s) best = { a: { type: 'play', card: card.id, move }, s };
    }
  }
  if (best) return best.a;
  const P = st.pieces;
  const cc = controlledColor(P, c);
  const onBoard = P.some((p) => p.color === cc && p.pos.t !== 'kot');
  if (onBoard) {
    // gooi de minst nuttige kaart weg, hou de 5 en boer
    const order: Rank[] = ['2', '3', '6', '8', '9', '10', 'Q', 'JK', '4', '7', 'A', 'K', 'J', '5'];
    const sorted = hand.slice().sort((a, b) => order.indexOf(a.rank) - order.indexOf(b.rank));
    return { type: 'discardOne', card: sorted[0].id };
  }
  return { type: 'discardAll' };
}

// ---------- niveaus ----------
export type BotLevel = 1 | 2 | 3 | 4;
export const BOT_LEVELS: BotLevel[] = [1, 2, 3, 4];
export const BOT_LEVEL_NAME: Record<BotLevel, { nl: string; en: string }> = {
  1: { nl: 'Beginner', en: 'Beginner' },
  2: { nl: 'Gemiddeld', en: 'Average' },
  3: { nl: 'Sterk', en: 'Strong' },
  4: { nl: 'Expert', en: 'Expert' },
};
/** Vaste Elo per niveau (geijkt met scripts/ai-tournament.ts; Gemiddeld = 1000 = startrating). */
export const BOT_RATING: Record<BotLevel, number> = { 1: 800, 2: 1000, 3: 1150, 4: 1200 };
export const asLevel = (x: unknown): BotLevel => ([1, 2, 3, 4].includes(Number(x)) ? Number(x) : 4) as BotLevel;

/** Alle geldige speelzetten (voor de beginner die soms zomaar iets doet). */
function legalPlays(st: State, c: Color): Action[] {
  const res: Action[] = [];
  const seen = new Set<Rank>();
  for (const card of st.hands[c]) {
    if (seen.has(card.rank)) continue;
    seen.add(card.rank);
    for (const move of allMovesForCard(st.pieces, c, card.rank).slice(0, 60)) {
      if (matchMove(st.pieces, c, card.rank, move)) res.push({ type: 'play', card: card.id, move });
    }
  }
  return res;
}

/** De computer op een bepaald niveau. */
export function botActionLevel(st: State, c: Color, level: BotLevel = 4, rng: () => number = Math.random): Action {
  if (level === 1) {
    const hand = st.hands[c];
    if (!needsFreeExit(st.pieces, c, st.sticks[c], st.freeExitDone, hand) && handHasMove(st.pieces, c, hand) && rng() < 0.5) {
      const plays = legalPlays(st, c);
      if (plays.length) return plays[Math.floor(rng() * plays.length)];
    }
    return botActionSimple(st, c, rng);
  }
  if (level === 2) return botActionSimple(st, c, rng);
  if (level === 3) return botAction(st, c, rng, { plan: 0, keep: 2.5 });
  return botAction(st, c, rng);
}

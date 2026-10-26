import assert from 'node:assert/strict';
import {
  newGame, applyAction, botAction, movesForRank, sevenNext, applySevenSteps, forwardTargets, START, ENTRY, TRACK,
  type State, type Piece, type Color, type Pos, RuleError, handHasMove, needsFreeExit, teamDone,
} from '../lib/engine.ts';

let passed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; } catch (e) { console.error('FAIL', name); throw e; }
}

function emptyPieces(): Piece[] {
  const P: Piece[] = [];
  for (const c of [0, 1, 2, 3] as Color[]) for (let n = 0; n < 4; n++) P.push({ id: c * 4 + n, color: c, pos: { t: 'kot' } });
  return P;
}
const tr = (i: number): Pos => ({ t: 'track', i });
const ln = (k: number): Pos => ({ t: 'lane', k });
// vakje "n" in het stuk van kleur seg (1..18)
const sq = (seg: number, n: number) => seg * 18 + n - 1;

test('geometrie: entry is 16 van het vorige stuk', () => {
  assert.equal(ENTRY(0), sq(3, 16));
  assert.equal(ENTRY(1), sq(0, 16));
});

test('4 achteruit van je 1 landt op 15, niet in huisje', () => {
  const P = emptyPieces();
  P[0].pos = tr(START(0));
  const m = movesForRank(P, 0, '4');
  assert.equal(m.length, 1);
  assert.deepEqual((m[0].move as any).to, tr(sq(3, 15)));
});

test('van 15: 3 -> 18, 5 -> 20, 6 -> verder rond', () => {
  const P = emptyPieces();
  P[0].pos = tr(sq(3, 15));
  const t3 = forwardTargets(P, P[0], 3).map((t) => t.to);
  assert.ok(t3.some((p) => p.t === 'lane' && p.k === 1));
  assert.ok(t3.some((p) => p.t === 'track'));
  const t5 = forwardTargets(P, P[0], 5).map((t) => t.to);
  assert.ok(t5.some((p) => p.t === 'lane' && p.k === 3));
  const t6 = forwardTargets(P, P[0], 6).map((t) => t.to);
  assert.equal(t6.length, 1);
  assert.equal(t6[0].t, 'track');
});

test('huisje: overspringen mag, landen niet (14 + 5 -> 19 over 17)', () => {
  const P = emptyPieces();
  P[0].pos = tr(sq(3, 14));
  P[1].pos = ln(0);
  const t5 = forwardTargets(P, P[0], 5).map((t) => t.to);
  assert.ok(t5.some((p) => p.t === 'lane' && p.k === 2));
  const t3 = forwardTargets(P, P[0], 3).map((t) => t.to);
  assert.ok(!t3.some((p) => p.t === 'lane'));
});

test('geen 4 achteruit uit het huisje', () => {
  const P = emptyPieces();
  P[0].pos = ln(0);
  assert.equal(movesForRank(P, 0, '4').length, 0);
  assert.equal(movesForRank(P, 0, '3').length, 1); // 17 -> 20
});

test('blokkade: niemand voorbij iemand op zijn eigen 1 (beide richtingen)', () => {
  const P = emptyPieces();
  P[4].pos = tr(START(1)); // blauw op blauwe 1
  P[0].pos = tr(START(1) - 2);
  assert.equal(movesForRank(P, 0, '3').length, 0);
  assert.equal(movesForRank(P, 0, '2').length, 0); // landen mag ook niet
  P[0].pos = tr(START(1) + 2);
  assert.equal(movesForRank(P, 0, '4').length, 0);
  // blauw op gele 1 is niet veilig
  const Q = emptyPieces();
  Q[4].pos = tr(START(0));
  Q[0].pos = tr(START(0) - 2);
  assert.equal(movesForRank(Q, 0, '3').length, 1);
});

test('buitenkomen doodt een ander op je 1, niet als je eigen pion er staat', () => {
  const P = emptyPieces();
  P[4].pos = tr(START(0));
  assert.ok(movesForRank(P, 0, 'A').some((g) => g.move.kind === 'out'));
  P[4].pos = { t: 'kot' };
  P[0].pos = tr(START(0));
  assert.ok(!movesForRank(P, 0, 'K').some((g) => g.move.kind === 'out'));
});

test('koning doodt iedereen onderweg; geblokkeerd door 1', () => {
  const st = newGame('training', mulberry(1));
  st.pieces = emptyPieces();
  st.pieces[0].pos = tr(5);
  st.pieces[4].pos = tr(8);
  st.pieces[2].pos = tr(10); // eigen pion
  st.pieces[8].pos = tr(18); // landt op 5+13
  st.turn = 0;
  st.hands[0] = [{ id: 999, rank: 'K', suit: 'S' }, { id: 998, rank: '2', suit: 'S' }];
  applyAction(st, 0, { type: 'play', card: 999, move: { kind: 'step', piece: 0, to: tr(18) } });
  assert.equal(st.pieces[4].pos.t, 'kot');
  assert.equal(st.pieces[2].pos.t, 'kot');
  assert.equal(st.pieces[8].pos.t, 'kot');
  assert.deepEqual(st.pieces[0].pos, tr(18));
});

test('7 splitsen: voorbeeld met tussenlanding', () => {
  // gele op 16 (eigen entry) en op 5, blauw op 7
  const P = emptyPieces();
  P[0].pos = tr(ENTRY(0));
  P[1].pos = tr(4);
  P[4].pos = tr(6);
  const r = applySevenSteps(P, 0, [
    { piece: 1, to: tr(6) },  // doodt blauw
    { piece: 0, to: ln(0) },  // 1 stap binnen
    { piece: 1, to: tr(10) }, // rest (4)
  ]);
  assert.ok(r);
  assert.equal(r!.remaining, 0);
  assert.deepEqual(r!.kills, [4]);
  // zelfde pion twee keer na elkaar mag niet
  assert.equal(applySevenSteps(P, 0, [{ piece: 1, to: tr(6) }, { piece: 1, to: tr(11) }]), null);
});

test('7 met één pion: enkel 7 rechtdoor', () => {
  const P = emptyPieces();
  P[0].pos = tr(3);
  const n = sevenNext(P, 0, []);
  assert.equal(n.length, 1);
  assert.deepEqual(n[0].to, tr(10));
});

test('5 op tegenstander, niet op iemand op zijn 1; boer wissel', () => {
  const P = emptyPieces();
  P[0].pos = tr(20);
  P[4].pos = tr(START(1));
  P[5].pos = tr(30);
  const m5 = movesForRank(P, 0, '5');
  assert.ok(m5.some((g) => g.move.kind === 'step' && g.move.piece === 5));
  assert.ok(!m5.some((g) => g.move.kind === 'step' && g.move.piece === 4));
  const mj = movesForRank(P, 0, 'J');
  assert.ok(mj.some((g) => g.move.kind === 'swap' && g.move.target === 5));
  assert.ok(!mj.some((g) => g.move.kind === 'swap' && g.move.target === 4));
});

test('5 duwt tegenstander voorbij zijn huisje of teammate erin', () => {
  const P = emptyPieces();
  P[4].pos = tr(ENTRY(1) - 1); // blauw net voor zijn huis
  P[0].pos = tr(40);
  const tos = movesForRank(P, 0, '5').filter((g) => g.move.kind === 'step' && g.move.piece === 4).map((g) => (g.move as any).to.t);
  assert.deepEqual(tos.sort(), ['lane', 'track']);
});

test('klaar: speel met pionnen van teammate', () => {
  const P = emptyPieces();
  for (let n = 0; n < 4; n++) P[n].pos = ln(n);
  P[8].pos = tr(START(2) + 3);
  const m = movesForRank(P, 0, '2');
  assert.equal(m.length, 1);
  assert.equal((m[0].move as any).piece, 8);
});

test('stokjes: alles afgooien geeft stokje, 2 stokjes = gratis buiten en dan kaart', () => {
  const st = newGame('pro', mulberry(3));
  st.pieces = emptyPieces();
  st.turn = 0;
  st.hands[0] = [{ id: 900, rank: '2', suit: 'S' }, { id: 901, rank: '3', suit: 'S' }];
  st.sticks[0] = 1;
  assert.throws(() => applyAction(st, 0, { type: 'play', card: 900, move: { kind: 'step', piece: 0, to: tr(2) } }), RuleError);
  applyAction(st, 0, { type: 'discardAll' });
  assert.equal(st.sticks[0], 2);
  st.turn = 0;
  st.hands[0] = [{ id: 902, rank: '2', suit: 'S' }];
  assert.ok(needsFreeExit(st.pieces, 0, st.sticks[0], st.freeExitDone, st.hands[0]));
  assert.throws(() => applyAction(st, 0, { type: 'discardAll' }), /free_exit_first/);
  applyAction(st, 0, { type: 'freeExit', piece: 0 });
  assert.equal(st.sticks[0], 0);
  assert.equal(st.turn, 0);
  applyAction(st, 0, { type: 'play', card: 902, move: { kind: 'step', piece: 0, to: tr(2) } });
});

test('na drie kaartzetten alles afgooien geeft geen stokje', () => {
  const st = newGame('pro', mulberry(31));
  st.pieces = emptyPieces();
  st.pieces[4].pos = tr(START(1)); // blokkeert de gele pion als die de ronde passeert
  st.turn = 0;
  st.hands[0] = [
    { id: 900, rank: 'A', suit: 'S' },
    { id: 901, rank: '2', suit: 'S' },
    { id: 902, rank: '3', suit: 'S' },
    { id: 903, rank: 'JK', suit: 'X' },
  ];
  applyAction(st, 0, { type: 'play', card: 900, move: { kind: 'out', piece: 0 } });
  st.turn = 0;
  applyAction(st, 0, { type: 'play', card: 901, move: { kind: 'step', piece: 0, to: tr(2) } });
  st.turn = 0;
  applyAction(st, 0, { type: 'play', card: 902, move: { kind: 'step', piece: 0, to: tr(5) } });
  st.turn = 0;
  assert.equal(handHasMove(st.pieces, 0, st.hands[0]), false);
  applyAction(st, 0, { type: 'discardAll' });
  assert.equal(st.sticks[0], 0);
  assert.equal(st.log.at(-1)?.kind, 'discardAll');
  assert.equal((st.log.at(-1) as { earnsStick?: boolean }).earnsStick, false);
});

test('gestarte partij reconstrueert rondegeschiedenis', () => {
  const st = newGame('training', mulberry(32));
  st.pieces = emptyPieces(); st.pieces[0].pos = tr(5); st.pieces[4].pos = tr(START(1)); st.turn = 0;
  st.hands[0] = [{ id: 901, rank: 'JK', suit: 'X' }];
  st.log.push({ by: 0, kind: 'play', round: st.round, n: 1, rank: '3', moves: [], kills: [] });
  delete (st as Partial<State>).playedThisRound;
  applyAction(st, 0, { type: 'discardAll' });
  assert.equal(st.sticks[0], 0);
  assert.equal(st.playedThisRound[0], true);
});

test('kaartselectie is omkeerbaar tot de knikker verplaatst (pro)', () => {
  const st = newGame('pro', mulberry(4));
  st.pieces = emptyPieces();
  st.pieces[0].pos = tr(10);
  st.turn = 0;
  st.hands[0] = [{ id: 900, rank: '2', suit: 'S' }, { id: 901, rank: '3', suit: 'S' }];
  applyAction(st, 0, { type: 'lay', card: 900 });
  applyAction(st, 0, { type: 'lay', card: 901 });
  applyAction(st, 0, { type: 'play', card: 901, move: { kind: 'step', piece: 0, to: tr(13) } });
  assert.equal(st.hands[0].some((c) => c.id === 900), true);
  assert.deepEqual(st.pieces[0].pos, tr(13));
});

test('moet spelen als het kan', () => {
  const st = newGame('pro', mulberry(5));
  st.pieces = emptyPieces();
  st.pieces[0].pos = tr(10);
  st.turn = 0;
  st.hands[0] = [{ id: 900, rank: '2', suit: 'S' }];
  assert.throws(() => applyAction(st, 0, { type: 'discardOne', card: 900 }), /must_play/);
  assert.ok(handHasMove(st.pieces, 0, st.hands[0]));
});

test('alleen in huisje schuiven mag toch alles afgooien voor stokje', () => {
  for (const rank of ['2', '3'] as const) {
    const st = newGame('pro', mulberry(70));
    st.pieces = emptyPieces();
    st.pieces[0].pos = ln(0);
    st.turn = 0;
    st.hands[0] = [{ id: 900, rank, suit: 'S' }];
    assert.ok(movesForRank(st.pieces, 0, rank).length > 0);
    assert.equal(handHasMove(st.pieces, 0, st.hands[0]), false);
    applyAction(st, 0, { type: 'discardAll' });
    assert.equal(st.sticks[0], 1);
  }
});

test('huisjezet mag vrijwillig, ingang vanaf parcours verplicht spelen', () => {
  const st = newGame('training', mulberry(71));
  st.pieces = emptyPieces(); st.turn = 0;
  st.pieces[0].pos = ln(0);
  st.hands[0] = [{ id: 900, rank: '2', suit: 'S' }];
  applyAction(st, 0, { type: 'play', card: 900, move: { kind: 'step', piece: 0, to: ln(2) } });
  assert.deepEqual(st.pieces[0].pos, ln(2));
  const P = emptyPieces(); P[0].pos = tr(ENTRY(0));
  assert.equal(handHasMove(P, 0, [{ id: 900, rank: '2', suit: 'S' }]), true);
});

test('5 kan spelen met andere kleur, ook als eigen knikkers in kot zitten', () => {
  const P = emptyPieces(); P[4].pos = tr(25);
  assert.ok(handHasMove(P, 0, [{ id: 900, rank: '5', suit: 'S' }]));
  P[4].pos = tr(START(1));
  assert.equal(handHasMove(P, 0, [{ id: 900, rank: '5', suit: 'S' }]), false);
});

test('7 alleen binnen huisjes telt niet; 7 met parcours wel', () => {
  const P = emptyPieces(); P[0].pos = ln(0); P[1].pos = ln(1); P[2].pos = ln(2);
  const hand = [{ id: 900, rank: '7' as const, suit: 'S' as const }];
  assert.equal(handHasMove(P, 0, hand), false);
  P[3].pos = tr(4);
  assert.ok(handHasMove(P, 0, hand));
});

test('gratis buiten en kaart hebben unieke lognummers', () => {
  const st = newGame('training', mulberry(72));
  st.pieces = emptyPieces(); st.turn = 0; st.sticks[0] = 2;
  st.hands[0] = [{ id: 900, rank: '2', suit: 'S' }];
  applyAction(st, 0, { type: 'freeExit', piece: 0 });
  applyAction(st, 0, { type: 'play', card: 900, move: { kind: 'step', piece: 0, to: tr(2) } });
  assert.equal(new Set(st.log.map((e) => e.n)).size, st.log.length);
});

// --- simulatie van volledige spellen met computerspelers ---
function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function checkInvariants(st: State) {
  const seenTrack = new Set<number>();
  const seenLane = new Set<string>();
  for (const p of st.pieces) {
    if (p.pos.t === 'track') { assert.ok(!seenTrack.has(p.pos.i), 'dubbel op vakje'); seenTrack.add(p.pos.i); assert.ok(p.pos.i >= 0 && p.pos.i < TRACK); }
    if (p.pos.t === 'lane') { const k = p.color + ':' + p.pos.k; assert.ok(!seenLane.has(k)); seenLane.add(k); }
  }
  const total = st.hands.flat().length + st.deck.length + st.center.length;
  assert.equal(total, 108, 'kaarten kwijt');
}

test('100 volledige computerspellen', () => {
  let totalMoves = 0;
  let wins = [0, 0];
  const t0 = Date.now();
  for (let g = 0; g < 100; g++) {
    const rng = mulberry(g + 11);
    const st = newGame(g % 2 ? 'pro' : 'training', rng);
    let guard = 0;
    while (st.winner === null && guard++ < 5000) {
      const c = st.turn;
      const a = botAction(st, c, rng);
      applyAction(st, c, a);
      checkInvariants(st);
    }
    assert.notEqual(st.winner, null, 'spel eindigde niet');
    assert.ok(teamDone(st.pieces, st.winner!));
    wins[st.winner!]++;
    totalMoves += st.moveNo;
  }
  console.log(`  100 spellen, gem. ${Math.round(totalMoves / 100)} acties, winst ${wins}, ${Date.now() - t0}ms`);
});

console.log(`${passed} tests OK`);

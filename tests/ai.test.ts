import assert from 'node:assert/strict';
import { newGame, applyAction, botSeatName, type Piece, type Color, type State, type Card } from '../lib/engine.ts';
import { botMove, aiAction, AI_PERSONAS, personaOf } from '../lib/ai.ts';
import { AI_NET } from '../lib/ai-weights.ts';
import { mulberry } from '../scripts/ai-train/util.ts';

let passed = 0;
function test(name: string, fn: () => void) { try { fn(); passed++; } catch (e) { console.error('FAIL', name); throw e; } }

test('gewichten geladen', () => { assert.ok(AI_NET && AI_NET.w1.length > 0); });

test('AI-niveaus 6–9 spelen volledige spellen zonder ongeldige zetten (gemengd met robots)', () => {
  const t0 = Date.now();
  for (let g = 0; g < 6; g++) {
    const rng = mulberry(77 + g);
    const st = newGame(g % 2 ? 'pro' : 'training', rng);
    const lv = [[6, 9, 7, 8], [9, 5, 9, 3], [8, 2, 7, 6]][g % 3];
    let guard = 0;
    while (st.winner === null && guard++ < 8000) { const c = st.turn; applyAction(st, c, botMove(st, c, lv[c], rng)); }
    assert.notEqual(st.winner, null);
  }
  console.log(`  6 AI-spellen in ${Date.now() - t0}ms`);
});

function stuckState(handRanks: string[]): State {
  const st = newGame('training', mulberry(5));
  // ik (geel) zit helemaal in mijn kot zonder aas of koning; mijn ploegmaat (oranje) heeft er 3 binnen
  st.pieces = st.pieces.map((p): Piece => ({ ...p, pos: { t: 'kot' } }));
  st.pieces[8].pos = { t: 'lane', k: 3 }; st.pieces[9].pos = { t: 'lane', k: 2 }; st.pieces[10].pos = { t: 'lane', k: 1 };
  st.pieces[11].pos = { t: 'track', i: 30 };
  st.pieces[4].pos = { t: 'track', i: 50 }; st.pieces[12].pos = { t: 'track', i: 60 };
  st.hands[0] = handRanks.map((r, i) => ({ id: 200 + i, rank: r, suit: 'S' } as Card));
  st.turn = 0 as Color; st.playedThisRound = [false, false, false, false];
  return st;
}

test('slim afgooien: niet alles weggooien zolang je ploegmaat je nog kan buitenspelen', () => {
  const st = stuckState(['2', '3', '6', '9', 'Q']);
  for (const p of AI_PERSONAS.filter((x) => x.smartDiscard)) {
    const a = aiAction(st, 0, p, mulberry(1));
    assert.equal(a.type, 'discardOne', `${p.name} gooide alles af`);
  }
});

test('slim afgooien: met je laatste kaart alles afgooien (voor het stokje)', () => {
  const st = stuckState(['9']);
  const a = aiAction(st, 0, personaOf(9)!, mulberry(1));
  assert.equal(a.type, 'discardAll');
});

test('namen aan tafel: robots naar hun stoel, AI naar persoonlijkheid, dubbel = met nummer', () => {
  assert.equal(botSeatName('Robot Rik', 3), 'Robot Rik');
  assert.equal(botSeatName('Robot Rik', 9), 'Bompa Fons');
  assert.equal(botSeatName('Robot Bert', 7, ['Mia']), 'Mia 2');
});

console.log(`${passed} AI-tests OK`);

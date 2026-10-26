// Pro-modus: geen hints. De test berekent zelf een geldige zet met de engine en klikt die,
// en controleert dat foute zetten en "gelegd is gelegd" geweigerd worden.
// Gebruik: node --experimental-strip-types tests/e2e-pro.mjs [beurten] [url] [modus]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { allMovesForCard, rankHasMove, needsFreeExit, START } from '../lib/engine.ts';

const turns = Number(process.argv[2] || 40);
const base = process.argv[3] || 'http://localhost:3100';
const mode = process.argv[4] || 'pro';
const out = process.env.SHOTS || '/tmp/';

const holeKey = (pos, color) => (pos.t === 'track' ? `t${pos.i}` : `l${color}-${pos.k}`);

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const pageErrors = [];
p.on('pageerror', (e) => pageErrors.push(e.message));
await p.goto(`${base}/oefenen?mode=${mode}`, { waitUntil: 'networkidle' });

const st = () => p.evaluate(() => window.__tokken);
const clickHole = async (key) => {
  const el = await p.$(`[data-hole="${key}"]`);
  const bb = await el.boundingBox();
  await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
};
const clickPiece = async (id) => {
  const el = await p.$(`[data-piece="${id}"]`);
  const bb = await el.boundingBox();
  await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
};
const clickCard = (id) => p.click(`.hand .pcard >> nth=${id}`);
const errText = async () => (await p.$('.status .err')) ? p.$eval('.status .err', (e) => e.innerText) : '';
const cardIndex = async (s, cardId) => {
  const hand = s.hands[0].slice();
  const order = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'JK'];
  hand.sort((a, b) => order.indexOf(a.rank) - order.indexOf(b.rank) || a.suit.localeCompare(b.suit));
  return hand.findIndex((h) => h.id === cardId);
};

const stats = { turns: 0, plays: 0, discards: 0, freeExits: 0, illegalRefused: 0, laidRefused: 0, sevens: 0, swaps: 0, problems: [] };

for (let turn = 0; turn < turns; turn++) {
  await p.waitForFunction(() => (window.__tokken && window.__tokken.turn === 0) || window.__tokken?.winner != null, null, { timeout: 60000 });
  let s = await st();
  if (s.winner != null) break;
  stats.turns++;
  const moveNo = s.moveNo;

  if (needsFreeExit(s.pieces, 0, s.sticks[0], s.freeExitDone, s.hands[0])) {
    const kp = s.pieces.find((x) => x.color === 0 && x.pos.t === 'kot');
    await clickPiece(kp.id);
    await p.waitForTimeout(150);
    stats.freeExits++;
    s = await st();
  }

  // vind een geldige kaart + zet
  let chosen = null;
  for (const c of s.hands[0]) {
    if (!rankHasMove(s.pieces, 0, c.rank)) continue;
    const ms = allMovesForCard(s.pieces, 0, c.rank);
    if (ms.length) { chosen = { card: c, move: ms[Math.floor(Math.random() * ms.length)] }; break; }
  }

  if (!chosen) {
    if (!(await p.$('text=Ik kan niet spelen'))) {
      await p.screenshot({ path: `${out}pro-nobutton.png` });
      console.log('no button; hand', JSON.stringify(s.hands[0].map((h) => h.rank)), 'sticks', s.sticks, 'freeDone', s.freeExitDone, 'laid', s.laid, 'status', await p.$eval('.status', (e) => e.innerText));
    }
    if (await p.$('text=Ik kan niet spelen')) await p.click('text=Ik kan niet spelen');
    await clickCard(0);
    await p.click('text=Gooi deze kaart weg');
    stats.discards++;
  } else {
    const idx = await cardIndex(s, chosen.card.id);
    await clickCard(idx);
    await p.waitForTimeout(120);
    // gelegd is gelegd: een andere kaart kiezen moet geweigerd worden
    const other = s.hands[0].find((h) => h.id !== chosen.card.id && h.rank !== chosen.card.rank);
    if (other) {
      await clickCard(await cardIndex(s, other.id));
      await p.waitForTimeout(80);
      if ((await errText()).includes('Gelegd')) stats.laidRefused++;
      else stats.problems.push(`turn ${turn}: laid card not enforced`);
    }
    // een foute zet proberen: een pion op een willekeurig fout vakje zetten
    const m = chosen.move;
    if (m.kind === 'step') {
      await clickPiece(m.piece);
      const bad = (m.to.t === 'track' ? (m.to.i + 1) % 72 : 50);
      const legalTos = allMovesForCard(s.pieces, 0, chosen.card.rank).filter((x) => x.kind === 'step' && x.piece === m.piece && x.to.t === 'track').map((x) => x.to.i);
      if (!legalTos.includes(bad) && !s.pieces.some((x) => x.pos.t === 'track' && x.pos.i === bad)) {
        await clickHole(`t${bad}`);
        await p.waitForTimeout(80);
        if ((await errText()).includes('mag niet')) stats.illegalRefused++;
        else stats.problems.push(`turn ${turn}: illegal not refused`);
        if ((await st()).moveNo !== moveNo + 1) stats.problems.push(`turn ${turn}: illegal move changed state`);
      }
      // de geldige zet
      const color = s.pieces[m.piece].color;
      await clickHole(holeKey(m.to, color)); // valt op de pion als daar iemand staat
    } else if (m.kind === 'out') {
      await clickPiece(m.piece);
    } else if (m.kind === 'swap') {
      await clickPiece(m.piece);
      await clickPiece(m.target);
      stats.swaps++;
    } else if (m.kind === 'seven') {
      let cur = s.pieces.map((x) => ({ ...x, pos: { ...x.pos } }));
      for (const step of m.steps) {
        await clickPiece(step.piece);
        await clickHole(holeKey(step.to, cur[step.piece].color));
        await p.waitForTimeout(80);
        cur[step.piece].pos = step.to;
      }
      stats.sevens++;
    }
    await p.waitForTimeout(150);
    const after = await st();
    if (after.moveNo <= moveNo + 1 && after.turn === 0 && after.winner == null) {
      stats.problems.push(`turn ${turn}: move ${JSON.stringify(m)} with ${chosen.card.rank} did not go through; err="${await errText()}"`);
      await p.screenshot({ path: `${out}pro-problem-${turn}.png` });
      break;
    }
    stats.plays++;
  }
  if (turn === 12) await p.screenshot({ path: `${out}pro-mid.png` });
}
await p.screenshot({ path: `${out}pro-end.png` });
console.log(JSON.stringify(stats, null, 1), 'pageErrors:', pageErrors);
await b.close();
process.exit(stats.problems.length || pageErrors.length ? 1 : 0);

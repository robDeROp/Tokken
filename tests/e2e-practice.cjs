// Speelt automatisch een aantal beurten in de oefenmodus door echt te klikken.
// Gebruik: node tests/e2e-practice.cjs [training|hulp|pro] [beurten] [url]
const { chromium } = require('playwright');
const mode = process.argv[2] || 'training';
const turns = Number(process.argv[3] || 25);
const base = process.argv[4] || 'http://localhost:3100';
const out = process.env.SHOTS || '/tmp/';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${base}/oefenen?mode=${mode}`, { waitUntil: 'networkidle' });
  const stats = { turns: 0, plays: 0, discards: 0, stuck: 0, errorsShown: [] };
  const clickCenter = async (el) => { const bb = await el.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); };
  const logText = () => p.$eval('.log', (e) => e.innerText);
  const myTurn = async () => !!(await p.$('.status.mine'));

  for (let turn = 0; turn < turns; turn++) {
    await p.waitForFunction(() => document.querySelector('.status.mine') || document.querySelector('.overlay .win'), null, { timeout: 60000 });
    if (await p.$('.overlay .win')) { console.log('game over'); break; }
    stats.turns++;
    const before = await logText();
    const progressed = async () => !(await myTurn()) || (await logText()) !== before;

    // free exit with 2 sticks
    const hint0 = await p.$eval('.status .hint', (e) => e.innerText).catch(() => '');
    if (hint0.includes('stokjes')) {
      const kot = await p.$$('.marble.can');
      await kot[0].click();
      await p.waitForTimeout(200);
    }

    const playable = await p.$$('.hand .pcard:not(.dim)');
    if (mode === 'training' && playable.length === 0) {
      await p.click('text=Ik kan niet spelen');
      await (await p.$('.hand .pcard')).click();
      await p.click('text=Alles afgooien');
      stats.discards++;
      await p.waitForTimeout(150);
      continue;
    }
    await playable[0].click();
    await p.waitForTimeout(150);
    let ok = false;
    for (let guard = 0; guard < 12; guard++) {
      if (await progressed()) { ok = true; break; }
      const sel = await p.$('.marble.sel');
      const dests = await p.$$('.dest-ring');
      if (sel && dests.length) { await clickCenter(dests[0]); await p.waitForTimeout(150); continue; }
      const targets = await p.$$('.marble.can:not(.sel)');
      if (sel && targets.length) { await targets[0].click(); await p.waitForTimeout(150); continue; }
      const can = await p.$$('.marble.can');
      if (can.length) { await can[0].click(); await p.waitForTimeout(150); continue; }
      break;
    }
    if (!ok && !(await progressed())) {
      stats.stuck++;
      const hint = await p.$eval('.status .hint', (e) => e.innerText).catch(() => '');
      console.log('stuck:', hint);
      await p.screenshot({ path: `${out}stuck-${turn}.png` });
      // probeer te ontsnappen: andere kaart
      break;
    }
    stats.plays++;
    const err = await p.$('.status .err');
    if (err) stats.errorsShown.push(await err.innerText());
    if (turn === 10) await p.screenshot({ path: `${out}mid-${mode}.png` });
  }
  await p.screenshot({ path: `${out}end-${mode}.png` });
  console.log(mode, JSON.stringify(stats), 'pageErrors:', errors);
  await b.close();
  process.exit(errors.length || stats.stuck ? 1 : 0);
})();

'use client';
// Geluiden voor Tokken, volledig gesynthetiseerd (geen bestanden, dus direct en klein):
// glazen knikkers op een houten bord, kaarten op tafel, houten stokjes, een marimba voor de winst.
// Eén gedeelde AudioContext; browsers laten audio pas toe na een klik of toets,
// dus we ontgrendelen bij de eerste interactie, waar die ook gebeurt.
import type { LastMove } from './engine';
import type { Plan } from './board';
import { currentTheme } from './themes';

const KEY = 'tokken-sound';
let ctx: AudioContext | null = null;
let out: AudioNode | null = null;
let wet: AudioNode | null = null; // galm (voor marimba en fanfare)
let noise: AudioBuffer | null = null;
let unlockInstalled = false;
const listeners = new Set<(on: boolean) => void>();

export function soundEnabled(): boolean {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}

export function setSoundEnabled(on: boolean) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* privévenster */ }
  if (on) { void unlock(); }
  listeners.forEach((l) => l(on));
}

export function onSoundChange(l: (on: boolean) => void) { listeners.add(l); return () => { listeners.delete(l); }; }

function context(): AudioContext | null {
  if (ctx) return ctx;
  const AC = typeof window !== 'undefined'
    ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    : undefined;
  if (!AC) return null;
  try {
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.12;
    const master = ctx.createGain(); master.gain.value = 0.85;
    master.connect(comp); comp.connect(ctx.destination);
    out = master;
    // kleine kamergalm: zelfgemaakte impulsrespons (ruis die uitsterft)
    const len = Math.floor(ctx.sampleRate * 1.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    const wg = ctx.createGain(); wg.gain.value = 0.32;
    conv.connect(wg); wg.connect(master);
    wet = conv;
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
  return ctx;
}

async function unlock() {
  const c = context();
  if (!c) return;
  if (c.state !== 'running') { try { await c.resume(); } catch { /* volgende klik */ } }
  // iOS: een stille buffer binnen de klik zet de audio echt open
  try {
    const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, c.sampleRate); s.connect(c.destination); s.start();
  } catch { /* ok */ }
}

/** Ontgrendel de audio bij de eerste klik/tik/toets op de pagina. */
export function installUnlock() {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  const h = () => { if (soundEnabled()) void unlock(); };
  for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, h, { capture: true, passive: true });
}

function ready(): AudioContext | null {
  if (!soundEnabled()) return null;
  const c = context();
  return c && c.state === 'running' ? c : null;
}

// ---------- bouwstenen ----------

const env = (c: AudioContext, at: number, peak: number, attack: number, decay: number) => {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  return g;
};

function noiseBurst(c: AudioContext, at: number, dur: number, vol: number, type: BiquadFilterType, freq: number, q = 1) {
  const s = c.createBufferSource(); s.buffer = noise!;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = env(c, at, vol, 0.002, dur);
  s.connect(f); f.connect(g); g.connect(out!);
  s.start(at, Math.random() * 0.5, dur + 0.05);
}

function partials(c: AudioContext, at: number, vol: number, list: readonly (readonly [number, number, number])[], type: OscillatorType = 'sine', send = 0) {
  for (const [f, a, d] of list) {
    const o = c.createOscillator(); o.type = type; o.frequency.value = f;
    const g = env(c, at, vol * a, 0.002, d);
    o.connect(g); g.connect(out!);
    if (send && wet) { const sg = c.createGain(); sg.gain.value = send; g.connect(sg); sg.connect(wet); }
    o.start(at); o.stop(at + d + 0.03);
  }
}

/** De "tok": glas dat in een houten putje valt. */
function tok(c: AudioContext, at: number, vol: number, pitch = 1) {
  noiseBurst(c, at, 0.01, vol * 0.5, 'highpass', 2600);
  partials(c, at, vol, [[190 * pitch, 1, 0.11], [430 * pitch, 0.55, 0.07], [1180 * pitch, 0.22, 0.035], [2650 * pitch, 0.1, 0.02]]);
}

/** Tikje bij het passeren van een gaatje. */
function tick(c: AudioContext, at: number, vol: number) {
  const p = 0.9 + Math.random() * 0.2;
  noiseBurst(c, at, 0.006, vol * 0.6, 'bandpass', 3200 * p, 2);
  partials(c, at, vol, [[620 * p, 0.6, 0.025], [1500 * p, 0.3, 0.015]]);
}

/** Rollend glas over hout. */
function rollBed(c: AudioContext, at: number, dur: number, vol: number) {
  const s = c.createBufferSource(); s.buffer = noise!;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = 1.2;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + Math.min(0.06, dur * 0.3));
  g.gain.setValueAtTime(vol, at + dur * 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  s.connect(bp); bp.connect(g); g.connect(out!);
  s.start(at, Math.random() * 0.3, dur + 0.05);
}

/** Opgetild worden (uit het kot): korte stijgende "plop". */
function plop(c: AudioContext, at: number, vol: number) {
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(170, at); o.frequency.exponentialRampToValueAtTime(420, at + 0.07);
  const g = env(c, at, vol, 0.004, 0.08);
  o.connect(g); g.connect(out!); o.start(at); o.stop(at + 0.12);
}

/** Glas tegen glas: helder "klak". */
function clack(c: AudioContext, at: number, vol: number) {
  noiseBurst(c, at, 0.012, vol * 0.7, 'highpass', 3500);
  partials(c, at, vol, [[3150, 0.8, 0.09], [4720, 0.5, 0.06], [6900, 0.25, 0.04], [1650, 0.3, 0.05]]);
}

/** Kaart die over de tafel schuift en neerkomt. */
function swish(c: AudioContext, at: number, vol: number) {
  const s = c.createBufferSource(); s.buffer = noise!;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(5200, at); bp.frequency.exponentialRampToValueAtTime(1500, at + 0.12);
  const g = env(c, at, vol, 0.03, 0.1);
  s.connect(bp); bp.connect(g); g.connect(out!);
  s.start(at, Math.random() * 0.5, 0.2);
  noiseBurst(c, at + 0.12, 0.03, vol * 0.6, 'lowpass', 900); // tap op tafel
}

/** Houten stokje: twee droge klopjes. */
function knock(c: AudioContext, at: number, vol: number) {
  for (const [dt, p] of [[0, 1], [0.085, 1.12]] as const) {
    noiseBurst(c, at + dt, 0.03, vol * 0.8, 'bandpass', 1700 * p, 6);
    partials(c, at + dt, vol * 0.7, [[880 * p, 1, 0.05], [2100 * p, 0.4, 0.03]]);
  }
}

/** Marimba-noot (hout!). */
function marimba(c: AudioContext, at: number, freq: number, vol: number, ring = 0.5) {
  partials(c, at, vol, [[freq, 1, ring], [freq * 4, 0.25, 0.12], [freq * 10, 0.06, 0.04]], 'sine', 0.8);
}

// ---------- gebeurtenissen ----------

/** Speel een zet af, precies gelijk met de animatie op het bord. */
/** @param me jouw kleur (null = toeschouwer): bepaalt het juich- of jammergeluid bij slaan */
export function playMove(last: LastMove | null, plan: Plan | null, me: number | null = null) {
  if (currentTheme() === 'retro') { retroMove(last, plan, me); return; }
  const c = ready();
  if (!c || !last) return;
  const t0 = c.currentTime + 0.02;
  const ms = (x: number) => t0 + x / 1000;

  if (last.kind === 'play') swish(c, t0, 0.22);
  else if (last.kind === 'discardOne') swish(c, t0, 0.14);
  else if (last.kind === 'discardAll') {
    for (let i = 0; i < 4; i++) swish(c, t0 + i * 0.07, 0.13);
    if (last.earnsStick) knock(c, t0 + 0.4, 0.5);
  }
  if (!plan) return;

  for (const s of plan.segs) {
    const start = ms(s.delay), end = ms(s.delay + s.dur);
    const p = 0.95 + Math.random() * 0.1;
    if (s.kind === 'exit' || s.kind === 'swap') {
      plop(c, start, s.kind === 'exit' ? 0.3 : 0.2);
      tok(c, end, 0.7, p);
      tok(c, end + 0.06, 0.15, p * 1.05);
      continue;
    }
    if (plan.hop) {
      // traag: de knikker hupt van gaatje naar gaatje, elk gaatje een houten "tok"
      for (let k = 1; k < s.holes; k++) tok(c, start + (k * s.dur) / s.holes / 1000, 0.42, p * (0.97 + Math.random() * 0.06));
    } else {
      rollBed(c, start, s.dur / 1000, 0.09);
      for (let k = 1; k < s.holes; k++) tick(c, start + (k * s.dur) / s.holes / 1000, 0.08);
    }
    if (s.kind === 'home') {
      tok(c, end, 0.6, 0.8 * p);
      const mine = me !== null && s.color === me;
      marimba(c, end + 0.04, 523.25, mine ? 0.18 : 0.13);
      marimba(c, end + 0.12, 783.99, mine ? 0.16 : 0.11);
      if (mine) { marimba(c, end + 0.2, 1046.5, 0.12, 0.9); shimmer(c, end + 0.22, 0.05); }
    } else {
      tok(c, end, 0.62, p);
      tok(c, end + 0.065, 0.14, p * 1.04); // klein nahuppen
    }
  }
  plan.kills.forEach((k, i) => {
    const at = ms(k.delay);
    clack(c, at, 0.42);
    whoosh(c, at + 0.08, plan.killMs / 1000);                           // door de lucht
    const land = at + 0.08 + plan.killMs / 1000;
    tok(c, land, 0.34, 0.85);
    tok(c, land + (plan.killMs * 0.2) / 1000, 0.12, 0.9);                // nastuiteren in het kot
    tok(c, land + (plan.killMs * 0.38) / 1000, 0.05, 0.95);
    if (me === null || i > 0) return;
    const team = (x: number) => x % 2;
    if (k.color === me) sad(c, at + 0.12, 1);                       // jij bent geslagen
    else if (last.by === me) cheer(c, at + 0.06, plan.kills.length); // jij slaat iemand
    else if (team(k.color) === team(me) && team(last.by) !== team(me)) sad(c, at + 0.12, 0.55); // je maat
    else if (team(last.by) === team(me) && team(k.color) !== team(me)) cheer(c, at + 0.06, 1, 0.6); // je maat slaat
  });
}

/** Jij slaat iemand: helder "ka-tsjing" op marimba + houtblok, sterker bij meerdere tegelijk. */
function cheer(c: AudioContext, at: number, n: number, vol = 1) {
  knock(c, at, 0.35 * vol);
  [783.99, 1046.5, 1318.5].forEach((f, i) => marimba(c, at + 0.07 + i * 0.065, f, 0.17 * vol, 0.5));
  if (n > 1) [1568, 2093].forEach((f, i) => marimba(c, at + 0.3 + i * 0.07, f, 0.13 * vol, 0.6));
  shimmer(c, at + 0.25, 0.05 * vol);
}

/** Jij bent geslagen: houten "bonk" en een dalende, klagende glijtoon. */
function sad(c: AudioContext, at: number, vol: number) {
  partials(c, at, 0.5 * vol, [[110, 1, 0.25], [247, 0.4, 0.12]]);
  const o = c.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(392, at + 0.12);
  o.frequency.exponentialRampToValueAtTime(330, at + 0.4);
  o.frequency.setValueAtTime(311, at + 0.45);
  o.frequency.exponentialRampToValueAtTime(196, at + 1.05);
  const vib = c.createOscillator(); vib.frequency.value = 5.5;
  const vg = c.createGain(); vg.gain.value = 6;
  vib.connect(vg); vg.connect(o.frequency);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at + 0.12);
  g.gain.exponentialRampToValueAtTime(0.11 * vol, at + 0.18);
  g.gain.setValueAtTime(0.09 * vol, at + 0.42);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 1.15);
  o.connect(lp); lp.connect(g); g.connect(out!);
  if (wet) { const sg = c.createGain(); sg.gain.value = 0.5; g.connect(sg); sg.connect(wet); }
  o.start(at + 0.12); o.stop(at + 1.2); vib.start(at + 0.12); vib.stop(at + 1.2);
}

/** Fijne glinstering (hoge, zachte belletjes). */
function shimmer(c: AudioContext, at: number, vol: number) {
  for (let i = 0; i < 6; i++) {
    const f = 2600 + Math.random() * 2400;
    partials(c, at + i * 0.045 + Math.random() * 0.02, vol, [[f, 1, 0.18]], 'sine', 1);
  }
}

export function playYourTurn() {
  if (currentTheme() === 'retro') { retroTurn(); return; }
  const c = ready();
  if (!c) return;
  const t = c.currentTime + 0.02;
  marimba(c, t, 659.25, 0.09);
  marimba(c, t + 0.09, 987.77, 0.08);
}

/** Einde van het spel: fanfare op marimba met knikkers die in de doos rollen; zachter en dalend bij verlies. */
export function playWin(won = true) {
  if (currentTheme() === 'retro') { retroWin(won); return; }
  const c = ready();
  if (!c) return;
  const t = c.currentTime + 0.05;
  const N = { C4: 261.63, E4: 329.63, G4: 392, A4: 440, Bb4: 466.16, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568 };
  if (!won) {
    // "ah jammer": dalend, warm, met een laatste plonk
    [[N.G5, 0], [N.E5, 0.16], [N.C5, 0.32], [N.A4, 0.52]].forEach(([f, d]) => marimba(c, t + d, f, 0.17, 0.7));
    [N.C4, N.E4, N.A4].forEach((f) => marimba(c, t + 0.9, f, 0.11, 1.4));
    tok(c, t + 1.0, 0.35, 0.8);
    return;
  }
  // 1. snelle opgaande loop over twee octaven
  [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6].forEach((f, i) => marimba(c, t + i * 0.075, f, 0.15, 0.35));
  // 2. "ta-da": twee akkoorden met tremolo (marimba-rol)
  const roll = (at: number, notes: number[], len: number, vol: number) => {
    for (let k = 0; k < len / 0.06; k++) notes.forEach((f, j) => marimba(c, at + k * 0.06 + j * 0.012, f, vol * (1 - k / (len / 0.06)) ** 1.3, 0.25));
  };
  roll(t + 0.5, [N.F5, N.A5, N.C6], 0.3, 0.09);
  roll(t + 0.85, [N.E5, N.G5, N.C6, N.E6], 1.0, 0.1);
  [N.C4, N.G4, N.C5].forEach((f) => marimba(c, t + 0.85, f, 0.16, 1.8));
  // 3. knikkers die in de houten doos rollen
  let at = t + 1.1;
  for (let i = 0; i < 16; i++) {
    at += 0.035 + Math.random() * 0.09 * (1 - i / 20);
    tok(c, at, 0.22 + Math.random() * 0.22, 0.85 + Math.random() * 0.35);
    if (i % 3 === 0) clack(c, at + 0.01, 0.08);
  }
}

export function playClick() {
  const c = ready();
  if (!c) return;
  tick(c, c.currentTime + 0.005, 0.1);
}

/** Uitdelen: eerst schudden (ritsel), dan per kaart een zacht "flits"-je. */
export function playDeal(cards: number, gapMs: number, shuffleMs: number) {
  if (currentTheme() === 'retro') { retroDeal(cards, gapMs, shuffleMs); return; }
  const c = ready();
  if (!c) return;
  const t = c.currentTime + 0.02;
  // schudden: snelle reeks kaartrandjes die over elkaar ritsen
  for (let i = 0; i < 14; i++) {
    const at = t + i * (shuffleMs / 1000 / 16) + Math.random() * 0.006;
    noiseBurst(c, at, 0.012, 0.07 + Math.random() * 0.04, 'bandpass', 3800 + Math.random() * 1500, 1.5);
  }
  noiseBurst(c, t + shuffleMs / 1000 - 0.03, 0.04, 0.12, 'lowpass', 700); // tikje: stapel recht
  // delen
  for (let k = 0; k < cards; k++) {
    const at = t + shuffleMs / 1000 + (k * gapMs) / 1000;
    const s = c.createBufferSource(); s.buffer = noise!;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(4200 + Math.random() * 800, at); bp.frequency.exponentialRampToValueAtTime(1800, at + 0.05);
    const g = env(c, at, 0.05 + Math.random() * 0.02, 0.006, 0.05);
    s.connect(bp); bp.connect(g); g.connect(out!);
    s.start(at, Math.random() * 0.5, 0.08);
  }
}

/** Alle 4 binnen: oplopend marimba-deuntje (hoger en met glinstering als het je eigen ploeg is). */
export function playLaneDone(ours = false) {
  const c = ready();
  if (!c) return;
  const t = c.currentTime + 0.02;
  const notes = ours ? [523.25, 659.25, 783.99, 1046.5] : [392, 493.88, 587.33, 783.99];
  notes.forEach((f, i) => marimba(c, t + i * 0.11, f, (ours ? 0.17 : 0.11) * (i === 3 ? 1.15 : 1), i === 3 ? 0.9 : 0.5));
  knock(c, t + 0.44, ours ? 0.3 : 0.18);
  if (ours) { marimba(c, t + 0.55, 1318.5, 0.12, 1); shimmer(c, t + 0.5, 0.07); }
}

/** Zoef: gefilterde ruis die stijgt en daalt, zoals iets dat door de lucht vliegt. */
function whoosh(c: AudioContext, at: number, dur: number) {
  const s = c.createBufferSource(); s.buffer = noise!;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2;
  bp.frequency.setValueAtTime(500, at);
  bp.frequency.exponentialRampToValueAtTime(1900, at + dur * 0.45);
  bp.frequency.exponentialRampToValueAtTime(600, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.09, at + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  s.connect(bp); bp.connect(g); g.connect(out!);
  s.start(at, Math.random() * 0.3, dur + 0.05);
}

// ---------- Retro arcade: alles klinkt als een oude spelcomputer (blokgolven) ----------
/** Eén 8-bit piepje, eventueel glijdend naar een andere toon. */
function blip(c: AudioContext, at: number, f: number, dur: number, vol = 0.05, type: OscillatorType = 'square', to?: number) {
  const o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.setValueAtTime(vol, at + dur * 0.8);
  g.gain.linearRampToValueAtTime(0.0001, at + dur);
  o.connect(lp); lp.connect(g); g.connect(out!);
  o.start(at); o.stop(at + dur + 0.02);
}
function crunch(c: AudioContext, at: number, dur: number, vol = 0.12) {
  // 8-bit ontploffing: ruis door een "bitcrush"-achtige lage filter
  const s = c.createBufferSource(); s.buffer = noise!; s.playbackRate.value = 0.25;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, at); lp.frequency.exponentialRampToValueAtTime(200, at + dur);
  const g = c.createGain(); g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  s.connect(lp); lp.connect(g); g.connect(out!); s.start(at, Math.random() * 0.3, dur + 0.05);
}
const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12); // MIDI-nummer -> Hz

function retroMove(last: LastMove | null, plan: Plan | null, me: number | null) {
  const c = ready();
  if (!c || !last) return;
  const t0 = c.currentTime + 0.02;
  const ms = (x: number) => t0 + x / 1000;
  if (last.kind === 'play') blip(c, t0, NOTE(84), 0.04, 0.04);
  else if (last.kind === 'discardOne') blip(c, t0, NOTE(72), 0.05, 0.035, 'square', NOTE(66));
  else if (last.kind === 'discardAll') {
    [72, 69, 66, 63].forEach((n, i) => blip(c, t0 + i * 0.06, NOTE(n), 0.05, 0.035));
    if (last.earnsStick) [76, 79].forEach((n, i) => blip(c, t0 + 0.32 + i * 0.07, NOTE(n), 0.06, 0.04, 'triangle'));
  }
  if (!plan) return;
  for (const sg of plan.segs) {
    const start = ms(sg.delay), end = ms(sg.delay + sg.dur);
    if (sg.kind === 'exit' || sg.kind === 'swap') {
      blip(c, start, NOTE(55), sg.dur / 1000 * 0.9, 0.04, 'square', NOTE(79)); // opstijgen
      blip(c, end, NOTE(84), 0.05, 0.04);
      continue;
    }
    // per gaatje een piepje, afwisselend hoog/laag ("happen")
    for (let k = 1; k <= sg.holes; k++) {
      const at = start + (k * sg.dur) / sg.holes / 1000 - 0.02;
      blip(c, at, NOTE(k % 2 ? 67 : 72), 0.035, 0.03, 'triangle');
    }
    if (sg.kind === 'home') [72, 76, 79, 84].forEach((n, i) => blip(c, end + i * 0.06, NOTE(n), 0.06, 0.045));
    else blip(c, end, NOTE(60), 0.05, 0.04, 'square', NOTE(48));
  }
  plan.kills.forEach((k, i) => {
    const at = ms(k.delay);
    crunch(c, at, 0.28);
    blip(c, at + 0.02, NOTE(84), plan.killMs / 1000, 0.045, 'square', NOTE(36)); // wegvliegen: dalende sweep
    if (me === null || i > 0) return;
    const team = (x: number) => x % 2;
    if (k.color === me) [67, 66, 65, 64, 63, 62].forEach((n, j) => blip(c, at + 0.2 + j * 0.09, NOTE(n), 0.08, 0.04, 'triangle'));
    else if (last.by === me || (team(last.by) === team(me) && team(k.color) !== team(me))) {
      [72, 76, 79, 84, 88].forEach((n, j) => blip(c, at + 0.15 + j * 0.055, NOTE(n), 0.05, 0.04));
    }
  });
}

function retroTurn() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime + 0.02;
  blip(c, t, NOTE(79), 0.06, 0.03, 'triangle'); blip(c, t + 0.08, NOTE(84), 0.08, 0.03, 'triangle');
}

function retroWin(won: boolean) {
  const c = ready();
  if (!c) return;
  const t = c.currentTime + 0.05;
  // eigen 8-bit deuntje: [noot, lengte in tellen]
  const tune: [number, number][] = won
    ? [[67, 1], [72, 1], [76, 1], [79, 2], [76, 1], [79, 4], [0, 1], [81, 1], [79, 1], [76, 1], [84, 6]]
    : [[72, 2], [71, 2], [70, 2], [69, 6]];
  const beat = 0.09;
  let at = t;
  for (const [n, len] of tune) {
    if (n) { blip(c, at, NOTE(n), len * beat * 0.92, 0.045); blip(c, at, NOTE(n - 12), len * beat * 0.92, 0.03, 'triangle'); }
    at += len * beat;
  }
}

function retroDeal(cards: number, gapMs: number, shuffleMs: number) {
  const c = ready();
  if (!c) return;
  const t = c.currentTime + 0.02;
  for (let i = 0; i < 8; i++) blip(c, t + i * (shuffleMs / 1000 / 9), NOTE(60 + (i % 2) * 7), 0.03, 0.025);
  for (let k = 0; k < cards; k++) blip(c, t + shuffleMs / 1000 + (k * gapMs) / 1000, NOTE(88 + (k % 4)), 0.015, 0.02);
}

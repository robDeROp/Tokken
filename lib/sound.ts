'use client';
// Geluid van een glazen knikker op een houten bord, volledig gesynthetiseerd (geen bestanden).
// Eén gedeelde AudioContext voor de hele site; browsers laten die pas spelen na een klik of toets,
// dus we ontgrendelen hem bij de eerste interactie, waar die ook gebeurt.
import type { LastMove } from './engine';

const KEY = 'tokken-sound';
let ctx: AudioContext | null = null;
let out: AudioNode | null = null;
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
    comp.threshold.value = -14; comp.ratio.value = 4;
    const master = ctx.createGain(); master.gain.value = 0.9;
    master.connect(comp); comp.connect(ctx.destination);
    out = master;
  } catch { ctx = null; }
  return ctx;
}

async function unlock() {
  const c = context();
  if (!c) return;
  if (c.state !== 'running') { try { await c.resume(); } catch { /* volgende klik */ } }
  // iOS: een stille buffer in de klik zelf zet de audio echt open
  try {
    const b = c.createBuffer(1, 1, c.sampleRate);
    const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start();
  } catch { /* ok */ }
}

/** Ontgrendel de audio bij de eerste klik/tik/toets op de pagina. */
export function installUnlock() {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  const h = () => { if (soundEnabled()) void unlock(); };
  for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, h, { capture: true, passive: true });
}

function noiseBuffer(c: AudioContext, seconds: number) {
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** Korte rol over het hout. */
function roll(c: AudioContext, at: number, dur: number, vol: number) {
  const src = c.createBufferSource(); src.buffer = noiseBuffer(c, dur);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 1.4;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  // ratelen van de knikker over de nerf
  const trem = c.createOscillator(); trem.frequency.value = 34;
  const tg = c.createGain(); tg.gain.value = vol * 0.45;
  trem.connect(tg); tg.connect(g.gain);
  src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(out!);
  src.start(at); src.stop(at + dur); trem.start(at); trem.stop(at + dur);
}

/** De "tok": glas dat in een houten putje valt. */
function tok(c: AudioContext, at: number, vol: number, pitch = 1) {
  // klik van het glas
  const click = c.createBufferSource(); click.buffer = noiseBuffer(c, 0.012);
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
  const cg = c.createGain();
  cg.gain.setValueAtTime(vol * 0.55, at); cg.gain.exponentialRampToValueAtTime(0.0001, at + 0.012);
  click.connect(hp); hp.connect(cg); cg.connect(out!); click.start(at);
  // houten klankkast
  for (const [f, a, d] of [[190, 1, 0.11], [430, 0.55, 0.07], [1180, 0.22, 0.035], [2650, 0.1, 0.02]] as const) {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * pitch;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol * a, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + d);
    o.connect(g); g.connect(out!); o.start(at); o.stop(at + d + 0.02);
  }
}

/** Speel het geluid van een zet (knikkers die bewegen, tikken bij slaan). */
export function playMove(last: LastMove | null) {
  if (!last || !soundEnabled()) return;
  const c = context();
  if (!c || c.state !== 'running') return;
  const moves = last.moves.length;
  const t0 = c.currentTime + 0.01;
  if (!moves) {
    // kaart afleggen zonder knikker: zacht houten tikje
    if (last.kind !== 'freeExit') tok(c, t0, 0.18, 1.6);
    return;
  }
  for (let i = 0; i < Math.min(moves, 4); i++) {
    const at = t0 + i * 0.16;
    const p = 0.94 + Math.random() * 0.12;
    roll(c, at, 0.17, 0.16);
    tok(c, at + 0.17, 0.62, p);
    tok(c, at + 0.235, 0.16, p * 1.04); // klein nahuppen
  }
  if (last.kills.length) {
    // knikker tegen knikker
    const at = t0 + Math.min(moves, 4) * 0.16 + 0.05;
    tok(c, at, 0.5, 2.3);
    tok(c, at + 0.05, 0.25, 2.1);
  }
}

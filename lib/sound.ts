'use client';
// Geluid van een glazen knikker die op een houten (MDF) bord valt, volledig gegenereerd met Web Audio:
// een korte tik (glas), een doffe houtresonantie, en een tweede kleiner stuitertje.

let ctx: AudioContext | null = null;
let muted = false;
try { muted = localStorage.getItem('tokken:mute') === '1'; } catch { /* ignore */ }

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Browsers laten pas geluid toe na een klik: bij de eerste klik het geluid "wakker maken".
if (typeof window !== 'undefined') {
  const unlock = () => { ac(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock);
}

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('tokken:mute', m ? '1' : '0'); } catch { /* ignore */ }
}

function knock(c: AudioContext, t: number, gain: number, pitch: number) {
  const out = c.createGain();
  out.gain.value = gain;
  out.connect(c.destination);

  // tik: korte ruisstoot door een bandfilter
  const len = Math.floor(c.sampleRate * 0.03);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2400 * pitch;
  bp.Q.value = 1.1;
  const ng = c.createGain();
  ng.gain.value = 0.55;
  noise.connect(bp).connect(ng).connect(out);
  noise.start(t);

  // hout + glas: een paar sinussen die snel uitsterven
  const partials: [number, number, number][] = [[310, 0.55, 0.11], [740, 0.35, 0.07], [1630, 0.18, 0.04], [3900, 0.12, 0.018]];
  for (const [f, a, dur] of partials) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * pitch * 1.04, t);
    o.frequency.exponentialRampToValueAtTime(f * pitch, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(a, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}

/** Knikker zetten. Bij 'kill' volgt nog een harde klak (de geslagen knikker die terug naar het kot gaat). */
export function playMarble(kind: 'move' | 'kill' = 'move', count = 1) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  let t = c.currentTime + 0.01;
  for (let n = 0; n < Math.max(1, Math.min(count, 4)); n++) {
    const p = 0.95 + Math.random() * 0.1;
    knock(c, t, 0.9, p);
    knock(c, t + 0.075, 0.28, p * 1.05); // klein stuitertje
    t += 0.16;
  }
  if (kind === 'kill') {
    knock(c, t + 0.02, 1.0, 0.8);
    knock(c, t + 0.09, 0.45, 0.84);
    knock(c, t + 0.15, 0.18, 0.88);
  }
}

/** Zacht kaartgeluid bij het leggen van een kaart. */
export function playCard() {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime + 0.005;
  const len = Math.floor(c.sampleRate * 0.06);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2) * 0.5;
  const s = c.createBufferSource();
  s.buffer = buf;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1800;
  const g = c.createGain();
  g.gain.value = 0.35;
  s.connect(hp).connect(g).connect(c.destination);
  s.start(t);
}

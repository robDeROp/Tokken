'use client';
// Achtergrondmuziek, live gesynthetiseerd in de browser (geen bestanden, geen auteursrechten).
// Elk thema heeft een eigen stijl: tempo, akkoorden, baslijn, begeleiding, melodie en slagwerk.
// De melodie wordt per thema één keer "gecomponeerd" met een vaste toevalsgenerator, zodat elk thema
// zijn eigen herkenbare deuntje heeft. Een kleine planner zet de noten telkens een fractie op voorhand klaar.
import { musicGraph, musicVolume, onVolumeChange } from './sound';
import { currentTheme, onThemeChange } from './themes';

type Graph = NonNullable<ReturnType<typeof musicGraph>>;
type Voice = (g: Graph, bus: AudioNode, at: number, midi: number, dur: number, vol: number) => void;
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- instrumenten ----------
function env(c: AudioContext, at: number, peak: number, attack: number, hold: number, release: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  if (hold > 0) g.gain.setValueAtTime(Math.max(0.0002, peak), at + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  return g;
}
function osc(g: Graph, bus: AudioNode, at: number, type: OscillatorType, f: number, gain: GainNode, stop: number, filter?: BiquadFilterNode, send = 0) {
  const o = g.c.createOscillator(); o.type = type; o.frequency.value = f;
  if (filter) { o.connect(filter); filter.connect(gain); } else o.connect(gain);
  gain.connect(bus);
  if (send) { const s = g.c.createGain(); s.gain.value = send; gain.connect(s); s.connect(g.wet); }
  o.start(at); o.stop(stop);
  return o;
}
const lp = (c: AudioContext, f: number, q = 0.7) => { const x = c.createBiquadFilter(); x.type = 'lowpass'; x.frequency.value = f; x.Q.value = q; return x; };

/** zachte elektrische piano */
const epiano: Voice = (g, bus, at, m, dur, vol) => {
  const f = hz(m);
  const e = env(g.c, at, vol, 0.008, dur * 0.3, dur * 0.9 + 0.3);
  osc(g, bus, at, 'sine', f, e, at + dur + 1.4, undefined, 0.35);
  const e2 = env(g.c, at, vol * 0.28, 0.004, 0, 0.35);
  osc(g, bus, at, 'sine', f * 2, e2, at + 0.5);
};
/** marimba / houten klankstaaf */
const marimba: Voice = (g, bus, at, m, _dur, vol) => {
  const f = hz(m);
  osc(g, bus, at, 'sine', f, env(g.c, at, vol, 0.003, 0, 0.45), at + 0.6, undefined, 0.3);
  osc(g, bus, at, 'sine', f * 4, env(g.c, at, vol * 0.22, 0.002, 0, 0.09), at + 0.15);
};
/** klokje / speeldoos / celesta */
const bell: Voice = (g, bus, at, m, _dur, vol) => {
  const f = hz(m);
  osc(g, bus, at, 'sine', f, env(g.c, at, vol, 0.002, 0, 1.6), at + 1.8, undefined, 0.5);
  osc(g, bus, at, 'sine', f * 2.76, env(g.c, at, vol * 0.35, 0.002, 0, 0.5), at + 0.6, undefined, 0.4);
  osc(g, bus, at, 'sine', f * 5.4, env(g.c, at, vol * 0.12, 0.001, 0, 0.18), at + 0.25);
};
/** speeldoos / celesta: zuivere boventonen (octaaf, kwint erboven), kort en helder */
const musicbox: Voice = (g, bus, at, m, _dur, vol) => {
  const f = hz(m);
  osc(g, bus, at, 'sine', f, env(g.c, at, vol, 0.002, 0, 1.1), at + 1.3, undefined, 0.35);
  osc(g, bus, at, 'sine', f * 2, env(g.c, at, vol * 0.3, 0.002, 0, 0.35), at + 0.5, undefined, 0.2);
  osc(g, bus, at, 'sine', f * 3, env(g.c, at, vol * 0.08, 0.001, 0, 0.12), at + 0.2);
};
/** glas / zachte klok voor ambient: zuiver, trage aanzet */
const glass: Voice = (g, bus, at, m, dur, vol) => {
  const f = hz(m);
  osc(g, bus, at, 'sine', f, env(g.c, at, vol, 0.06, dur * 0.3, 2.2), at + dur + 2.6, undefined, 0.6);
  osc(g, bus, at, 'sine', f * 2, env(g.c, at, vol * 0.18, 0.05, 0, 1.0), at + 1.3, undefined, 0.4);
};
/** vibrafoon: zuiver met trage tremolo */
const vibes: Voice = (g, bus, at, m, dur, vol) => {
  const f = hz(m);
  const e = env(g.c, at, vol, 0.004, dur * 0.2, 1.2);
  const trem = g.c.createOscillator(); trem.frequency.value = 5; const tg = g.c.createGain(); tg.gain.value = vol * 0.25;
  trem.connect(tg); tg.connect(e.gain);
  osc(g, bus, at, 'sine', f, e, at + dur + 1.5, undefined, 0.35);
  osc(g, bus, at, 'sine', f * 4, env(g.c, at, vol * 0.12, 0.002, 0, 0.08), at + 0.12);
  trem.start(at); trem.stop(at + dur + 1.5);
};
/** zachte sinusbas */
const softbass: Voice = (g, bus, at, m, dur, vol) => {
  osc(g, bus, at, 'sine', hz(m), env(g.c, at, vol, 0.01, dur * 0.6, 0.35), at + dur + 0.5);
};
/** getokkelde snaar (ukelele, gitaar) */
const pluck: Voice = (g, bus, at, m, dur, vol) => {
  const f = hz(m);
  const filt = lp(g.c, 2600); filt.frequency.setValueAtTime(3200, at); filt.frequency.exponentialRampToValueAtTime(700, at + 0.3);
  osc(g, bus, at, 'triangle', f, env(g.c, at, vol, 0.003, 0, Math.min(0.6, dur + 0.2)), at + 0.8, filt, 0.15);
  osc(g, bus, at, 'sine', f * 2, env(g.c, at, vol * 0.25, 0.002, 0, 0.12), at + 0.2);
};
/** steeldrum */
const steel: Voice = (g, bus, at, m, _dur, vol) => {
  const f = hz(m);
  const o = g.c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(f * 1.02, at); o.frequency.exponentialRampToValueAtTime(f, at + 0.04);
  const e = env(g.c, at, vol, 0.003, 0, 0.55);
  o.connect(e); e.connect(bus); const s = g.c.createGain(); s.gain.value = 0.25; e.connect(s); s.connect(g.wet);
  o.start(at); o.stop(at + 0.7);
  osc(g, bus, at, 'sine', f * 2, env(g.c, at, vol * 0.45, 0.002, 0, 0.3), at + 0.4);
  osc(g, bus, at, 'sine', f * 3, env(g.c, at, vol * 0.18, 0.002, 0, 0.15), at + 0.2);
};
/** fluitje (met vibrato) */
const whistle: Voice = (g, bus, at, m, dur, vol) => {
  const f = hz(m);
  const o = g.c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
  const vib = g.c.createOscillator(); vib.frequency.value = 5.2; const vg = g.c.createGain(); vg.gain.value = f * 0.008;
  vib.connect(vg); vg.connect(o.frequency);
  const e = env(g.c, at, vol, 0.04, Math.max(0, dur - 0.08), 0.12);
  o.connect(e); e.connect(bus); const s = g.c.createGain(); s.gain.value = 0.35; e.connect(s); s.connect(g.wet);
  o.start(at); o.stop(at + dur + 0.3); vib.start(at); vib.stop(at + dur + 0.3);
};
/** zachte strijkers / klankwolk */
const pad: Voice = (g, bus, at, m, dur, vol) => {
  const f = hz(m);
  for (const [d, type] of [[-3, 'sawtooth'], [3, 'triangle']] as const) {
    const filt = lp(g.c, 800);
    const o = g.c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = d;
    const e = env(g.c, at, vol * 0.5, Math.min(0.9, dur * 0.4), dur * 0.4, 1.2);
    o.connect(filt); filt.connect(e); e.connect(bus); const s = g.c.createGain(); s.gain.value = 0.6; e.connect(s); s.connect(g.wet);
    o.start(at); o.stop(at + dur + 2.2);
  }
};
/** bas */
const bass: Voice = (g, bus, at, m, dur, vol) => {
  const f = hz(m);
  osc(g, bus, at, 'triangle', f, env(g.c, at, vol, 0.006, dur * 0.5, 0.25), at + dur + 0.4, lp(g.c, 700));
  osc(g, bus, at, 'sine', f, env(g.c, at, vol * 0.7, 0.006, dur * 0.5, 0.3), at + dur + 0.4);
};
/** 8-bit: blokgolf */
const square: Voice = (g, bus, at, m, dur, vol) => {
  osc(g, bus, at, 'square', hz(m), env(g.c, at, vol * 0.5, 0.003, Math.max(0, dur * 0.7), 0.04), at + dur + 0.1, lp(g.c, 3600));
};
/** 8-bit: driehoeksbas */
const tri: Voice = (g, bus, at, m, dur, vol) => {
  osc(g, bus, at, 'triangle', hz(m), env(g.c, at, vol, 0.003, Math.max(0, dur * 0.8), 0.03), at + dur + 0.1);
};

// slagwerk
type Drum = 'shaker' | 'brush' | 'clap' | 'hat' | 'kick' | 'snare' | 'sleigh' | 'ride';
function drum(g: Graph, bus: AudioNode, at: number, kind: Drum, vol: number) {
  const c = g.c;
  if (kind === 'kick') {
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(130, at); o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    const e = env(c, at, vol, 0.002, 0, 0.16); o.connect(e); e.connect(bus); o.start(at); o.stop(at + 0.2);
    return;
  }
  const spec: Record<Exclude<Drum, 'kick'>, [BiquadFilterType, number, number, number]> = {
    shaker: ['highpass', 6000, 0.04, 1], brush: ['bandpass', 2800, 0.09, 0.8], clap: ['bandpass', 1500, 0.07, 1.2],
    hat: ['highpass', 8000, 0.025, 1], snare: ['bandpass', 1800, 0.12, 0.7], sleigh: ['bandpass', 7200, 0.05, 6], ride: ['highpass', 5000, 0.35, 0.5],
  };
  const [type, f, dur, q] = spec[kind];
  const reps = kind === 'clap' ? 2 : kind === 'sleigh' ? 3 : 1;
  for (let r = 0; r < reps; r++) {
    const t = at + r * (kind === 'clap' ? 0.012 : 0.03);
    const s = c.createBufferSource(); s.buffer = g.noise;
    const filt = c.createBiquadFilter(); filt.type = type; filt.frequency.value = f; filt.Q.value = q;
    const e = env(c, t, vol * (r ? 0.6 : 1), 0.002, 0, dur);
    s.connect(filt); filt.connect(e); e.connect(bus);
    s.start(t, Math.random() * 0.5, dur + 0.05);
  }
}

// ---------- stijlen ----------
interface Style {
  bpm: number; swing: number;
  chords: number[][];            // per maat de akkoordnoten (MIDI)
  scale: number[];               // toonladder voor de melodie (MIDI, al in de juiste octaaf)
  comp: { voice: Voice; steps: number[]; vol: number; strum?: number; up?: number };
  bass: { voice: Voice; steps: number[]; vol: number; walk?: boolean; octave?: number };
  lead: { voice: Voice; vol: number; density: number; grid: 1 | 2 | 4; maxLen: number };
  arp?: { voice: Voice; vol: number; every: 1 | 2 };
  drums: [Drum, number[], number][];   // soort, stappen (0..15), volume
}
const pent = (root: number, minor: boolean) => {
  const iv = minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
  return [0, 12].flatMap((o) => iv.map((x) => root + o + x)).concat(root + 24);
};

const STYLES: Record<string, Style> = {
  klassiek: { bpm: 88, swing: 0,
    chords: [[65, 69, 72, 74], [62, 65, 69, 72], [67, 70, 74, 77], [60, 64, 67, 70]],
    scale: pent(72, false),
    comp: { voice: epiano, steps: [0, 8], vol: 0.045 },
    bass: { voice: bass, steps: [0, 8], vol: 0.11, octave: -24 },
    lead: { voice: marimba, vol: 0.09, density: 0.36, grid: 2, maxLen: 4 },
    drums: [['brush', [4, 12], 0.045], ['shaker', [0, 4, 8, 12], 0.02]] },
  walnoot: { bpm: 76, swing: 0,
    chords: [[62, 65, 69, 72], [55, 59, 62, 65], [60, 64, 67, 69], [57, 61, 64, 67]],
    scale: [62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79],
    comp: { voice: epiano, steps: [0, 8], vol: 0.04 },
    bass: { voice: bass, steps: [0, 4, 8, 12], vol: 0.11, walk: true, octave: -24 },
    lead: { voice: vibes, vol: 0.05, density: 0.32, grid: 4, maxLen: 8 },
    drums: [['ride', [0, 4, 8, 12], 0.014], ['brush', [4, 12], 0.035]] },
  nacht: { bpm: 56, swing: 0,
    chords: [[57, 60, 64, 69], [53, 57, 60, 65], [55, 60, 64, 67], [55, 59, 62, 67]],
    scale: pent(69, true).map((x) => x + 12),
    comp: { voice: pad, steps: [0], vol: 0.085 },
    bass: { voice: softbass, steps: [0], vol: 0.13, octave: -24 },
    lead: { voice: glass, vol: 0.085, density: 0.3, grid: 4, maxLen: 8 },
    drums: [] },
  picknick: { bpm: 112, swing: 0.06,
    chords: [[60, 64, 67, 72], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]],
    scale: pent(72, false),
    comp: { voice: pluck, steps: [0, 4, 6, 10, 12], vol: 0.05, strum: 0.014, up: 6 },
    bass: { voice: bass, steps: [0, 8], vol: 0.1, octave: -24 },
    lead: { voice: whistle, vol: 0.045, density: 0.3, grid: 2, maxLen: 4 },
    drums: [['clap', [4, 12], 0.04], ['shaker', [0, 2, 4, 6, 8, 10, 12, 14], 0.018]] },
  strand: { bpm: 100, swing: 0.08,
    chords: [[55, 59, 62, 67], [60, 64, 67, 72], [62, 66, 69, 74], [60, 64, 67, 72]],
    scale: pent(67, false).map((x) => x + 12),
    comp: { voice: pluck, steps: [2, 6, 10, 14], vol: 0.04 },
    bass: { voice: bass, steps: [0, 3, 8, 11], vol: 0.11, octave: -24 },
    lead: { voice: steel, vol: 0.07, density: 0.42, grid: 1, maxLen: 3 },
    drums: [['shaker', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 0.012], ['kick', [0, 8], 0.08]] },
  winter: { bpm: 84, swing: 0,
    chords: [[62, 66, 69, 74], [59, 62, 66, 71], [55, 59, 62, 67], [57, 61, 64, 69]],
    scale: [74, 76, 78, 79, 81, 83, 85, 86, 88, 90, 91, 93],
    comp: { voice: pad, steps: [0], vol: 0.05 },
    bass: { voice: softbass, steps: [0, 8], vol: 0.12, octave: -24 },
    lead: { voice: musicbox, vol: 0.115, density: 0.42, grid: 2, maxLen: 4 },
    drums: [['sleigh', [0, 4, 8, 12], 0.026]] },
  retro: { bpm: 132, swing: 0,
    chords: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]],
    scale: pent(69, true),
    comp: { voice: square, steps: [], vol: 0 },
    bass: { voice: tri, steps: [0, 2, 4, 6, 8, 10, 12, 14], vol: 0.12, octave: -12 },
    lead: { voice: square, vol: 0.05, density: 0.5, grid: 2, maxLen: 3 },
    arp: { voice: square, vol: 0.022, every: 1 },
    drums: [['kick', [0, 8], 0.09], ['snare', [4, 12], 0.05], ['hat', [2, 6, 10, 14], 0.03]] },
};

// ---------- componeren ----------
function seeded(str: string) {
  let a = 0; for (let i = 0; i < str.length; i++) a = (a * 31 + str.charCodeAt(i)) | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
type Note = { step: number; midi: number; len: number };
/** Botst een noot met het akkoord? (een halve toon naast een akkoordtoon klinkt vals) */
export const clashes = (m: number, chord: number[]) => chord.some((c) => { const d = (((m - c) % 12) + 12) % 12; return d === 1 || d === 11; });
/** Noten van de ladder die bij dit akkoord passen. */
const fits = (scale: number[], chord: number[]) => { const ok = scale.filter((m) => !clashes(m, chord)); return ok.length ? ok : scale; };
/** Een melodie van 8 maten (2x de akkoordreeks): deel A en een variatie A' met hetzelfde ritme. */
export function compose(id: string, st: Style): Note[] {
  const rnd = seeded('tokken-' + id);
  const out: Note[] = [];
  const rhythm: number[][] = [];
  for (let bar = 0; bar < 4; bar++) {
    const steps: number[] = [];
    for (let s = 0; s < 16; s += st.lead.grid) {
      const strong = s % 8 === 0;
      if (rnd() < st.lead.density * (strong ? 1.6 : 1)) steps.push(s);
    }
    if (!steps.length) steps.push(0);
    rhythm.push(steps);
  }
  for (let half = 0; half < 2; half++) {
    let cur = st.scale[Math.floor(st.scale.length / 2)];
    for (let bar = 0; bar < 4; bar++) {
      const chord = st.chords[bar];
      const steps = rhythm[bar];
      // per maat enkel noten die bij het akkoord passen; op de sterke tellen een echte akkoordtoon
      const ok = fits(st.scale, chord);
      const chordTones = ok.filter((m) => chord.some((c) => (((m - c) % 12) + 12) % 12 === 0));
      const nearestIn = (list: number[], m: number) => list.reduce((b, x) => (Math.abs(x - m) < Math.abs(b - m) ? x : b), list[0]);
      steps.forEach((s, i) => {
        const next = i + 1 < steps.length ? steps[i + 1] : 16;
        let target: number;
        if (s % 8 === 0 && chordTones.length) {
          target = nearestIn(chordTones, cur);
          if (half === 1 && bar === 3 && i === 0) target = nearestIn(chordTones, chord[0] + 12);
        } else {
          const idx = ok.indexOf(nearestIn(ok, cur));
          const move = [-2, -1, -1, 1, 1, 2][Math.floor(rnd() * 6)] * (half === 1 && rnd() < 0.5 ? -1 : 1);
          target = ok[Math.min(ok.length - 1, Math.max(0, idx + move))];
        }
        cur = target;
        out.push({ step: half * 64 + bar * 16 + s, midi: target, len: Math.min(st.lead.maxLen, next - s) });
      });
    }
  }
  return out;
}

/** Basnoot: altijd een toon uit het akkoord (grondtoon, kwint, terts of octaaf). */
export function bassNote(st: Style, bar: number, beat: number): number {
  const chord = st.chords[bar];
  const root = chord[0] + (st.bass.octave ?? -24);
  const tone = (iv: number[]) => {
    for (const x of iv) if (chord.some((c) => (((c - chord[0]) % 12) + 12) % 12 === x)) return root + x;
    return root + 12;
  };
  if (st.bass.walk) {
    const k = st.bass.steps.indexOf(beat) % 4;
    return [root, tone([3, 4]), tone([7]), root + 12][k];
  }
  if (st.bass.voice === tri) return beat % 4 === 2 ? root + 12 : root;
  if (beat === 0) return root;
  return beat % 8 === 0 ? tone([7]) : root + 12;
}

export { STYLES };

// ---------- planner ----------
interface Session { id: string; st: Style; mel: Map<number, Note>; bus: GainNode; step: number; next: number; timer: ReturnType<typeof setInterval> | null }
let session: Session | null = null;
let wanted = false;
let retry: ReturnType<typeof setInterval> | null = null;

const stepLen = (st: Style, step: number) => (60 / st.bpm / 4) * (st.swing ? (step % 4 < 2 ? 1 + st.swing : 1 - st.swing) : 1);

function schedule(s: Session, g: Graph) {
  const horizon = g.c.currentTime + 0.25;
  while (s.next < horizon) {
    const at = s.next, step = s.step, st = s.st;
    const bar = Math.floor(step / 16) % 4, beat = step % 16;
    const chord = st.chords[bar];
    const sixteenth = 60 / st.bpm / 4;
    // begeleiding
    if (st.comp.vol && st.comp.steps.includes(beat)) {
      const dur = st.comp.voice === pad ? sixteenth * 16 : sixteenth * 3;
      const notes = st.comp.up === beat ? [...chord].reverse() : chord;
      notes.forEach((m, i) => st.comp.voice(g, s.bus, at + (st.comp.strum ?? 0) * i, m, dur, st.comp.vol / Math.sqrt(chord.length) * 1.6));
    }
    // arpeggio (retro)
    if (st.arp && beat % st.arp.every === 0) {
      const tones = [...chord, ...chord.map((x) => x + 12)];
      st.arp.voice(g, s.bus, at, tones[beat % tones.length] + 12, sixteenth * 0.9, st.arp.vol);
    }
    // bas
    if (st.bass.steps.includes(beat)) {
      st.bass.voice(g, s.bus, at, bassNote(st, bar, beat), sixteenth * (st.bass.voice === tri ? 1.8 : 3), st.bass.vol);
    }
    // melodie
    const n = s.mel.get(step);
    if (n) st.lead.voice(g, s.bus, at, n.midi, sixteenth * n.len * 0.95, st.lead.vol);
    // slagwerk
    for (const [kind, steps, vol] of st.drums) if (steps.includes(beat)) drum(g, s.bus, at, kind, vol * (0.85 + Math.random() * 0.3));
    s.next += stepLen(st, step);
    s.step = (step + 1) % 128;
  }
}

function begin() {
  const g = musicGraph();
  if (!g) return false;
  const id = currentTheme() in STYLES ? currentTheme() : 'klassiek';
  if (session && session.id === id) return true;
  fadeOut(session, g);
  const st = STYLES[id];
  const bus = g.c.createGain();
  bus.gain.setValueAtTime(0.0001, g.c.currentTime);
  bus.gain.exponentialRampToValueAtTime(1, g.c.currentTime + 1.5);
  bus.connect(g.out);
  const mel = new Map(compose(id, st).map((n) => [n.step, n]));
  const s: Session = { id, st, mel, bus, step: 0, next: g.c.currentTime + 0.12, timer: null };
  s.timer = setInterval(() => { const gg = musicGraph(); if (gg && session === s) schedule(s, gg); }, 60);
  session = s;
  schedule(s, g);
  return true;
}

function fadeOut(s: Session | null, g: Graph | null) {
  if (!s) return;
  if (s.timer) clearInterval(s.timer);
  if (g) {
    const t = g.c.currentTime;
    s.bus.gain.cancelScheduledValues(t);
    s.bus.gain.setValueAtTime(Math.max(0.0001, s.bus.gain.value), t);
    s.bus.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    setTimeout(() => { try { s.bus.disconnect(); } catch { /* al los */ } }, 1500);
  }
  if (session === s) session = null;
}

function sync() {
  const should = wanted && musicVolume() > 0 && typeof document !== 'undefined' && !document.hidden;
  if (!should) { fadeOut(session, musicGraph()); return; }
  if (!begin() && !retry) {
    // de browser laat pas geluid toe na een klik: blijf proberen tot het mag
    retry = setInterval(() => { if (!wanted || begin()) { clearInterval(retry!); retry = null; } }, 700);
  }
}

let wired = false;
function wire() {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  onVolumeChange(sync);
  onThemeChange(() => { if (session) { fadeOut(session, musicGraph()); } sync(); });
  document.addEventListener('visibilitychange', sync);
}

/** Muziek aan zolang er een spel open is. */
export function startMusic() { wire(); wanted = true; sync(); }
export function stopMusic() { wanted = false; sync(); }

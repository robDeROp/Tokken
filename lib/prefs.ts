'use client';
// Persoonlijke voorkeuren (per toestel): animatiesnelheid.
import type { Speed } from './board';
export type { Speed };
export const SPEEDS: Speed[] = ['fast', 'normal', 'calm', 'slow'];
export const SPEED_LABEL: Record<Speed, { nl: string; en: string }> = {
  fast: { nl: 'Snel', en: 'Fast' },
  normal: { nl: 'Normaal', en: 'Normal' },
  calm: { nl: 'Rustig', en: 'Calm' },
  slow: { nl: 'Traag', en: 'Slow' },
};
/** De twee traagste: de knikker hupt gaatje per gaatje, met een "tok" in elk gaatje. */
export const isHopSpeed = (s: Speed) => s === 'calm' || s === 'slow';

const KEY = 'tokken-speed';
const listeners = new Set<(s: Speed) => void>();

export function getSpeed(): Speed {
  try {
    const v = localStorage.getItem(KEY) as Speed | null;
    return v && SPEEDS.includes(v) ? v : 'normal';
  } catch { return 'normal'; }
}
export function setSpeed(s: Speed) {
  try { localStorage.setItem(KEY, s); } catch { /* privévenster */ }
  listeners.forEach((l) => l(s));
}
export function onSpeedChange(l: (s: Speed) => void) { listeners.add(l); return () => { listeners.delete(l); }; }

// Tokske (de mascotte) aan/uit
const MKEY = 'tokken-mascot';
const mListeners = new Set<(on: boolean) => void>();
export function getMascot(): boolean { try { return localStorage.getItem(MKEY) !== '0'; } catch { return true; } }
export function setMascot(on: boolean) {
  try { localStorage.setItem(MKEY, on ? '1' : '0'); } catch { /* privévenster */ }
  mListeners.forEach((l) => l(on));
}
export function onMascotChange(l: (on: boolean) => void) { mListeners.add(l); return () => { mListeners.delete(l); }; }

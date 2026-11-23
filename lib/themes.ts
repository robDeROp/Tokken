// Bord- en tafelthema's. Elk thema zet CSS-variabelen op <html data-theme="...">; het bord (SVG) en de
// tafel lezen die variabelen. De ploegkleuren van de knikkers blijven altijd dezelfde (die betekenen iets).
export type ThemeId = 'klassiek' | 'walnoot' | 'nacht' | 'picknick' | 'strand' | 'winter';

export interface Theme {
  id: ThemeId;
  name: { nl: string; en: string };
  /** voor het keuzerondje: bordkleur en tafelkleur */
  swatch: [string, string];
}

export const THEMES: Theme[] = [
  { id: 'klassiek', name: { nl: 'Klassiek', en: 'Classic' }, swatch: ['#c99a65', '#293e34'] },
  { id: 'walnoot', name: { nl: 'Walnoot', en: 'Walnut' }, swatch: ['#6a4126', '#3d1a1d'] },
  { id: 'nacht', name: { nl: 'Nacht', en: 'Night' }, swatch: ['#2a2f3a', '#101b33'] },
  { id: 'picknick', name: { nl: 'Picknick', en: 'Picnic' }, swatch: ['#a8552f', '#b8322a'] },
  { id: 'strand', name: { nl: 'Strand', en: 'Beach' }, swatch: ['#dccbae', '#0d4f56'] },
  { id: 'winter', name: { nl: 'Winter', en: 'Winter' }, swatch: ['#e1e8ee', '#123326'] },
];

const KEY = 'tokken-theme';
const listeners = new Set<(t: ThemeId) => void>();
const isTheme = (x: unknown): x is ThemeId => THEMES.some((t) => t.id === x);

export function getTheme(): ThemeId {
  try { const v = localStorage.getItem(KEY); return isTheme(v) ? v : 'klassiek'; } catch { return 'klassiek'; }
}
export function applyTheme(t: ThemeId) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = t;
}
export function setTheme(t: ThemeId) {
  try { localStorage.setItem(KEY, t); } catch { /* privévenster */ }
  applyTheme(t);
  listeners.forEach((l) => l(t));
}
export function onThemeChange(l: (t: ThemeId) => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/** Klein script in <head>: zet het gekozen thema vóór de eerste weergave (geen flits). */
export const THEME_BOOT = `try{var t=localStorage.getItem('${KEY}');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

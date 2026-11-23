'use client';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { onSoundChange, setSoundEnabled, soundEnabled } from '@/lib/sound';
import { THEMES, getTheme, setTheme, onThemeChange, type ThemeId } from '@/lib/themes';
import { getSpeed, onSpeedChange, setSpeed, SPEEDS, SPEED_LABEL, getMascot, setMascot, onMascotChange, type Speed } from '@/lib/prefs';

export default function SoundToggle() {
  const { lang } = useT();
  const [enabled, setEnabled] = useState(true);
  useEffect(() => { setEnabled(soundEnabled()); return onSoundChange(setEnabled); }, []);
  return <button className="btn small" aria-pressed={enabled} onClick={() => setSoundEnabled(!enabled)}>
    {enabled ? '🔊' : '🔇'} {lang === 'nl' ? 'Geluid' : 'Sound'}: {enabled ? (lang === 'nl' ? 'aan' : 'on') : (lang === 'nl' ? 'uit' : 'off')}
  </button>;
}

/** Vier snelheden; bij Rustig en Traag hupt de knikker gaatje per gaatje met een "tok". */
export function SpeedPicker() {
  const { lang } = useT();
  const [speed, setLocal] = useState<Speed>('normal');
  useEffect(() => { setLocal(getSpeed()); return onSpeedChange(setLocal); }, []);
  return <div className="seg-picker" role="radiogroup" aria-label={lang === 'nl' ? 'Animatiesnelheid' : 'Animation speed'}>
    {SPEEDS.map((s) => <button key={s} type="button" role="radio" aria-checked={speed === s}
      className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{SPEED_LABEL[s][lang === 'nl' ? 'nl' : 'en']}</button>)}
  </div>;
}

export function MascotToggle() {
  const { lang } = useT();
  const [on, setOn] = useState(true);
  useEffect(() => { setOn(getMascot()); return onMascotChange(setOn); }, []);
  return <button className="btn small" aria-pressed={on} onClick={() => setMascot(!on)}>
    Tokske: {on ? (lang === 'nl' ? 'aan' : 'on') : (lang === 'nl' ? 'uit' : 'off')}
  </button>;
}

/** Bord- en tafelthema kiezen (per toestel bewaard). */
export function ThemePicker() {
  const { lang } = useT();
  const [theme, setLocal] = useState<ThemeId>('klassiek');
  useEffect(() => { setLocal(getTheme()); return onThemeChange(setLocal); }, []);
  return <div className="theme-picker" role="radiogroup" aria-label={lang === 'nl' ? 'Thema' : 'Theme'}>
    {THEMES.map((th) => <button key={th.id} type="button" role="radio" aria-checked={theme === th.id}
      className={theme === th.id ? 'on' : ''} onClick={() => setTheme(th.id)}>
      <span className="sw" style={{ background: `radial-gradient(circle at 50% 50%, ${th.swatch[0]} 0 52%, ${th.swatch[1]} 54%)` }} />
      {th.name[lang === 'nl' ? 'nl' : 'en']}
    </button>)}
  </div>;
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n';
import { onSoundChange, setSoundEnabled, soundEnabled, sfxVolume, musicVolume, setSfxVolume, setMusicVolume, onVolumeChange } from '@/lib/sound';
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


/** Twee aparte schuifjes: geluidseffecten en achtergrondmuziek (elk met dempknop). */
export function AudioControls() {
  const { lang } = useT();
  const [sfx, setSfx] = useState(0.8);
  const [mus, setMus] = useState(0.35);
  useEffect(() => {
    const read = () => { setSfx(sfxVolume()); setMus(musicVolume()); };
    read();
    return onVolumeChange(read);
  }, []);
  const row = (label: string, value: number, set: (v: number) => void, last: { current: number }, icon: [string, string]) => (
    <div className="audio-row">
      <button type="button" className="audio-mute" aria-label={`${label}: ${value > 0 ? (lang === 'nl' ? 'dempen' : 'mute') : (lang === 'nl' ? 'aanzetten' : 'unmute')}`}
        onClick={() => { if (value > 0) { last.current = value; set(0); } else set(last.current || 0.5); }}>{value > 0 ? icon[0] : icon[1]}</button>
      <label className="audio-label">
        <span>{label}</span>
        <input type="range" min={0} max={1} step={0.05} value={value} onChange={(e) => set(Number(e.target.value))} aria-label={label} />
      </label>
      <span className="audio-pct">{Math.round(value * 100)}%</span>
    </div>
  );
  const lastSfx = useRef(0.8), lastMus = useRef(0.35);
  return <div className="audio-controls">
    {row(lang === 'nl' ? 'Effecten' : 'Effects', sfx, setSfxVolume, lastSfx, ['🔊', '🔇'])}
    {row(lang === 'nl' ? 'Muziek' : 'Music', mus, setMusicVolume, lastMus, ['🎵', '🔇'])}
  </div>;
}

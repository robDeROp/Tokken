'use client';
import { BOT_LEVELS, BOT_LEVEL_NAME, BOT_RATING, asLevel } from '@/lib/engine';
import { useT } from '@/lib/i18n';

/** Niveau van een computer kiezen (met zijn vaste rating erbij). */
export default function LevelPicker({ value, onChange, disabled, label }: {
  value: number | undefined; onChange: (level: number) => void; disabled?: boolean; label?: string;
}) {
  const { lang } = useT();
  return (
    <select className="level-picker" aria-label={label} value={asLevel(value)} disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}>
      {BOT_LEVELS.map((l) => <option key={l} value={l}>{BOT_LEVEL_NAME[l][lang]} · {BOT_RATING[l]}</option>)}
    </select>
  );
}

export function levelLabel(level: number | undefined, lang: 'nl' | 'en') {
  return BOT_LEVEL_NAME[asLevel(level)][lang];
}

'use client';
import { ROBOT_LEVELS, AI_LEVELS, BOT_LEVEL_NAME, asLevel } from '@/lib/engine';
import { useBotRatings } from '@/lib/rating';
import { useT } from '@/lib/i18n';

/** Niveau van een computer kiezen (met zijn rating erbij): robots met vaste regels, of een AI. */
export default function LevelPicker({ value, onChange, disabled, label }: {
  value: number | undefined; onChange: (level: number) => void; disabled?: boolean; label?: string;
}) {
  const { lang } = useT();
  const ratings = useBotRatings();
  const opt = (l: number) => <option key={l} value={l}>{BOT_LEVEL_NAME[asLevel(l)][lang]} · {ratings[asLevel(l)]}</option>;
  return (
    <select className="level-picker" aria-label={label} value={asLevel(value)} disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}>
      <optgroup label={lang === 'nl' ? 'Robots (vaste regels)' : 'Robots (fixed rules)'}>{ROBOT_LEVELS.map(opt)}</optgroup>
      <optgroup label={lang === 'nl' ? 'AI (leerde door zelf te spelen)' : 'AI (learned by self-play)'}>{AI_LEVELS.map(opt)}</optgroup>
    </select>
  );
}

export function levelLabel(level: number | undefined, lang: 'nl' | 'en') {
  return BOT_LEVEL_NAME[asLevel(level)][lang];
}

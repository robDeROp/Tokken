'use client';
import { useEffect, useRef, useState } from 'react';
import type { LastMove } from '@/lib/engine';
import { useT } from '@/lib/i18n';
import { installUnlock, onSoundChange, playMove, setSoundEnabled, soundEnabled } from '@/lib/sound';

/** Speelt het knikkergeluid bij elke nieuwe zet. Moet altijd gemount zijn (niet in een lade). */
export function useMoveSound(last: LastMove | null, moveNo: number) {
  const seen = useRef(moveNo);
  useEffect(() => { installUnlock(); }, []);
  useEffect(() => {
    if (seen.current === moveNo) return;
    const fresh = moveNo > seen.current;
    seen.current = moveNo;
    if (fresh) playMove(last);
  }, [last, moveNo]);
}

export default function SoundToggle() {
  const { lang } = useT();
  const [enabled, setEnabled] = useState(true);
  useEffect(() => { setEnabled(soundEnabled()); return onSoundChange(setEnabled); }, []);
  return <button className="btn small" aria-pressed={enabled} onClick={() => setSoundEnabled(!enabled)}>
    {enabled ? '🔊' : '🔇'} {lang === 'nl' ? 'Geluid' : 'Sound'}: {enabled ? (lang === 'nl' ? 'aan' : 'on') : (lang === 'nl' ? 'uit' : 'off')}
  </button>;
}

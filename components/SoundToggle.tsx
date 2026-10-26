'use client';
import { useEffect, useRef, useState } from 'react';
import type { LastMove } from '@/lib/engine';
import { useT } from '@/lib/i18n';

// Korte, gedempte tik: een ruisimpuls met houten resonanties, zonder pieptonen.
export default function SoundToggle({ last, moveNo }: { last: LastMove | null; moveNo: number }) {
  const { lang } = useT();
  const [enabled, setEnabled] = useState(false);
  const context = useRef<AudioContext | null>(null);
  const seen = useRef(moveNo);
  useEffect(() => () => { void context.current?.close(); }, []);
  useEffect(() => {
    if (seen.current === moveNo) return;
    seen.current = moveNo;
    if (!enabled || !last?.moves.length || !context.current || context.current.state !== 'running') return;
    const ctx = context.current;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.085), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      data[i] = ((Math.random() * 2 - 1) * Math.exp(-t * 240) +
        Math.sin(t * 2 * Math.PI * 420) * Math.exp(-t * 90) * 0.5 +
        Math.sin(t * 2 * Math.PI * 830) * Math.exp(-t * 130) * 0.2) * 0.12;
    }
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 2200;
    source.buffer = buffer; source.connect(filter); filter.connect(ctx.destination); source.start();
    source.onended = () => { source.disconnect(); filter.disconnect(); };
  }, [last, moveNo, enabled]);
  return <button className="btn small" aria-pressed={enabled} onClick={async () => {
    if (!enabled) {
      try { context.current ??= new AudioContext(); await context.current.resume(); }
      catch { return; }
    }
    setEnabled(!enabled);
  }}>{lang === 'nl' ? 'Geluid' : 'Sound'}: {enabled ? (lang === 'nl' ? 'aan' : 'on') : (lang === 'nl' ? 'uit' : 'off')}</button>;
}

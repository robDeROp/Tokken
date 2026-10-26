'use client';
// Tokske: de mascotte. Een glazen amberkleurige knikker met de vier ploegkleuren als werveling erin.
import { useEffect, useId, useRef, useState } from 'react';
import type { PublicState, Color } from '@/lib/engine';
import { Commentator, HOME_LINES, tipLine, type Line, type Mood } from '@/lib/commentary';
import { useT } from '@/lib/i18n';
import { getMascot, onMascotChange } from '@/lib/prefs';

const SWIRL = ['#f5cf2e', '#1d5fd6', '#e2560c', '#0c7a4b'];

export function Tokske({ mood = 'happy', size = 96, talking = false }: { mood?: Mood; size?: number; talking?: boolean }) {
  const id = useId().replace(/:/g, '');
  const eyesClosed = mood === 'laugh' || mood === 'proud';
  const look = mood === 'think' ? [2, -4] : mood === 'shocked' ? [0, 0] : mood === 'sad' ? [0, 3] : [1, 1];
  const brow: Record<Mood, [string, string]> = {
    happy: ['M 36 37 Q 45 33 53 37', 'M 67 37 Q 75 33 84 37'],
    laugh: ['M 36 38 Q 45 33 53 38', 'M 67 38 Q 75 33 84 38'],
    shocked: ['M 36 30 Q 45 24 53 30', 'M 67 30 Q 75 24 84 30'],
    sad: ['M 37 37 Q 46 34 53 31', 'M 67 31 Q 74 34 83 37'],
    cheeky: ['M 36 38 Q 45 36 53 38', 'M 67 33 Q 75 26 84 31'],
    proud: ['M 36 36 Q 45 31 53 36', 'M 67 36 Q 75 31 84 36'],
    think: ['M 36 37 Q 45 35 53 37', 'M 67 32 Q 75 27 84 31'],
  };
  const mouth: Record<Mood, React.ReactElement> = {
    happy: <path d="M 46 70 Q 60 81 74 70" className="tk-line" />,
    laugh: <path d="M 45 67 Q 60 67 75 67 Q 72 84 60 84 Q 48 84 45 67 Z" className="tk-mouth" />,
    shocked: <ellipse cx="60" cy="74" rx="6.5" ry="8" className="tk-mouth" />,
    sad: <path d="M 47 77 Q 60 68 73 77" className="tk-line" />,
    cheeky: <path d="M 48 72 Q 62 78 74 66" className="tk-line" />,
    proud: <path d="M 43 66 Q 60 70 77 66 Q 74 85 60 85 Q 46 85 43 66 Z" className="tk-mouth teeth" />,
    think: <path d="M 50 74 Q 58 72 70 70" className="tk-line" />,
  };
  return (
    <svg className={`tokske mood-${mood} ${talking ? 'talking' : ''}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <radialGradient id={`g${id}`} cx="38%" cy="32%" r="72%">
          <stop offset="0" stopColor="#ffe7ad" />
          <stop offset=".45" stopColor="#f0a944" />
          <stop offset=".85" stopColor="#b8661c" />
          <stop offset="1" stopColor="#7c3f0d" />
        </radialGradient>
        <clipPath id={`c${id}`}><circle cx="60" cy="58" r="45" /></clipPath>
      </defs>
      <ellipse cx="60" cy="110" rx="30" ry="6" className="tk-shadow" />
      <g className="tk-body">
        <circle cx="60" cy="58" r="46" fill={`url(#g${id})`} stroke="#6b360c" strokeWidth="2" />
        <g clipPath={`url(#c${id})`} className="tk-swirl" opacity=".3">
          {SWIRL.map((c, i) => (
            <path key={c} d="M 60 58 C 72 40 96 44 100 62" stroke={c} strokeWidth="7" fill="none" strokeLinecap="round" transform={`rotate(${i * 90} 60 58)`} />
          ))}
        </g>
        <ellipse cx="40" cy="30" rx="13" ry="8" fill="#fff" opacity=".65" transform="rotate(-28 40 30)" />
        <circle cx="86" cy="80" r="3.5" fill="#fff" opacity=".35" />
        {/* wangetjes */}
        <ellipse cx="34" cy="66" rx="7" ry="4.5" fill="#e8574a" opacity=".28" />
        <ellipse cx="86" cy="66" rx="7" ry="4.5" fill="#e8574a" opacity=".28" />
        {/* ogen */}
        {eyesClosed ? (
          <g className="tk-line">
            <path d="M 37 52 Q 45 44 53 52" /><path d="M 67 52 Q 75 44 83 52" />
          </g>
        ) : (
          <g className="tk-eyes">
            <ellipse cx="45" cy="51" rx="8.5" ry={mood === 'shocked' ? 11.5 : 10} fill="#fffdf6" stroke="#4a2a10" strokeWidth="1.6" />
            {mood === 'cheeky' ? <path d="M 67 52 Q 75 46 83 52" className="tk-line" /> :
              <ellipse cx="75" cy="51" rx="8.5" ry={mood === 'shocked' ? 11.5 : 10} fill="#fffdf6" stroke="#4a2a10" strokeWidth="1.6" />}
            <circle cx={45 + look[0]} cy={52 + look[1]} r={mood === 'shocked' ? 3.4 : 4.6} fill="#2a1606" />
            <circle cx={43.5 + look[0]} cy={50 + look[1]} r="1.4" fill="#fff" />
            {mood !== 'cheeky' && <>
              <circle cx={75 + look[0]} cy={52 + look[1]} r={mood === 'shocked' ? 3.4 : 4.6} fill="#2a1606" />
              <circle cx={73.5 + look[0]} cy={50 + look[1]} r="1.4" fill="#fff" />
            </>}
          </g>
        )}
        <path d={brow[mood][0]} className="tk-brow" /><path d={brow[mood][1]} className="tk-brow" />
        {mouth[mood]}
        {mood === 'sad' && <path d="M 86 58 Q 89 64 86 67 Q 83 64 86 58 Z" fill="#9fd3ff" stroke="#4d8fc4" strokeWidth=".8" className="tk-tear" />}
        {mood === 'proud' && <path d="M 98 22 l 2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill="#fff3b0" className="tk-sparkle" />}
      </g>
    </svg>
  );
}

export function Bubble({ text, side = 'right' }: { text: string; side?: 'right' | 'left' | 'top' }) {
  return <div className={`tk-bubble ${side}`} role="status" aria-live="polite">{text}</div>;
}

/** Tokske naast het bord: reageert op elke zet. */
export function TokskeCommentator({ pub, names, mySeat, training }: { pub: PublicState; names: string[]; mySeat: Color | null; training: boolean }) {
  const { lang } = useT();
  const [enabled, setEnabled] = useState(true);
  const [line, setLine] = useState<Line | null>(null);
  const [mood, setMood] = useState<Mood>('happy');
  const com = useRef<Commentator | null>(null);
  const prev = useRef<PublicState | null>(null);
  const shownAt = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const key = pub.log.at(-1)?.n ?? -1;

  useEffect(() => { setEnabled(getMascot()); return onMascotChange(setEnabled); }, []);
  if (!com.current) com.current = new Commentator(lang, names, mySeat, training);
  com.current.setLang(lang);
  com.current.setNames(names);

  const show = (l: Line, delay = 0) => {
    // laat een belangrijk bericht niet meteen overschrijven door een onbelangrijk
    const now = Date.now();
    if (line && now - shownAt.current < 2200 && l.prio < line.prio) return;
    clearTimeout(hideTimer.current);
    setTimeout(() => {
      shownAt.current = Date.now();
      setLine(l); setMood(l.mood);
      hideTimer.current = setTimeout(() => { setLine(null); setMood('happy'); }, 2600 + l.text.length * 45);
    }, delay);
  };

  useEffect(() => {
    const p = prev.current;
    prev.current = pub;
    if (!p) return;
    const l = com.current!.react(p, pub);
    if (l) show(l, l.prio >= 7 ? 450 : 250); // even wachten tot de knikker er is
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pub.winner]);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  if (!enabled) return null;
  return (
    <div className="tk-corner" onClick={() => show({ text: tipLine(lang), mood: 'think', prio: 3 })} title="Tokske">
      {line && <Bubble text={line.text} side="right" />}
      <Tokske mood={mood} size={74} talking={!!line} />
    </div>
  );
}

/** Tokske op de startpagina. */
export function TokskeHero() {
  const { lang } = useT();
  const [i, setI] = useState(0);
  const [text, setText] = useState('');
  const [mood, setMood] = useState<Mood>('happy');
  useEffect(() => { setText(HOME_LINES[lang][0]); }, [lang]);
  useEffect(() => {
    const tm = setInterval(() => setI((x) => x + 1), 6500);
    return () => clearInterval(tm);
  }, []);
  useEffect(() => {
    if (!i) return;
    const lines = HOME_LINES[lang];
    setText(lines[i % lines.length]);
    setMood((['happy', 'cheeky', 'laugh', 'think', 'proud'] as Mood[])[i % 5]);
  }, [i, lang]);
  return (
    <button type="button" className="tk-hero" onClick={() => { setText(tipLine(lang)); setMood('think'); }}
      aria-label={lang === 'nl' ? 'Tokske, klik voor een tip' : 'Tokske, click for a tip'}>
      <Tokske mood={mood} size={112} talking />
      {text && <Bubble text={text} side="right" />}
    </button>
  );
}

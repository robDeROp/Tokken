'use client';
// "Stijl"-knop bovenaan + venster met echte voorbeelden van elk thema (tafel, stukje bord, knikkers, kaart, paneel, knop).
// Elk voorbeeld zet zelf data-theme, zodat het de kleuren van dat thema toont, los van het gekozen thema.
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { THEMES, getTheme, setTheme, onThemeChange, type ThemeId } from '@/lib/themes';

function Preview({ id }: { id: ThemeId }) {
  return (
    <div className="tp-scene" data-theme={id} aria-hidden="true">
      <div className="tp-board">
        <div className="tp-grain" />
        {[0, 1, 2, 3, 4].map((i) => <span key={i} className="tp-hole" style={{ left: `${14 + i * 17}%`, top: `${58 - Math.sin(i / 1.3) * 26}%` }} />)}
        <span className="tp-marble y" style={{ left: '31%', top: '35%' }} />
        <span className="tp-marble b" style={{ left: '65%', top: '24%' }} />
        <span className="tp-card"><b>A</b><i>♥</i></span>
      </div>
      <div className="tp-panel"><span>Tokken</span><span className="tp-btn">Start</span></div>
    </div>
  );
}

export function ThemeSheet({ onClose }: { onClose: () => void }) {
  const { lang } = useT();
  const [cur, setCur] = useState<ThemeId>('klassiek');
  useEffect(() => { setCur(getTheme()); return onThemeChange(setCur); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay theme-overlay" onClick={onClose}>
      <div className="panel theme-sheet" role="dialog" aria-modal="true" aria-labelledby="ts-title" onClick={(e) => e.stopPropagation()}>
        <div className="ts-head">
          <h2 id="ts-title" className="h-hand">{lang === 'nl' ? 'Kies je stijl' : 'Pick your style'}</h2>
          <button className="drawer-close" aria-label={lang === 'nl' ? 'Sluiten' : 'Close'} onClick={onClose}>×</button>
        </div>
        <p className="muted small">{lang === 'nl'
          ? 'Bord, tafel, kaarten en panelen veranderen mee. Je keuze wordt op dit toestel onthouden.'
          : 'Board, table, cards and panels all change. Your choice is remembered on this device.'}</p>
        <div className="ts-grid" role="radiogroup" aria-label={lang === 'nl' ? 'Thema' : 'Theme'}>
          {THEMES.map((th) => (
            <button key={th.id} type="button" role="radio" aria-checked={cur === th.id}
              className={`ts-tile ${cur === th.id ? 'on' : ''}`} onClick={() => setTheme(th.id)}>
              <Preview id={th.id} />
              <span className="ts-name">{th.name[lang === 'nl' ? 'nl' : 'en']}{cur === th.id && <span className="ts-check" aria-hidden="true">✓</span>}</span>
            </button>
          ))}
        </div>
        <button className="btn primary ts-done" onClick={onClose}>{lang === 'nl' ? 'Klaar' : 'Done'}</button>
      </div>
    </div>
  );
}

/** Knop voor in de kopbalk. */
export function ThemeButton({ className = '' }: { className?: string }) {
  const { lang } = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn small ghost theme-btn ${className}`} onClick={() => setOpen(true)}
        aria-haspopup="dialog" aria-label={lang === 'nl' ? 'Stijl kiezen' : 'Pick style'}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.8-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2Z" />
          <circle cx="7.5" cy="11" r="1.3" fill="currentColor" /><circle cx="10.5" cy="7" r="1.3" fill="currentColor" /><circle cx="15" cy="7.5" r="1.3" fill="currentColor" />
        </svg>
        <span>{lang === 'nl' ? 'Stijl' : 'Style'}</span>
      </button>
      {open && <ThemeSheet onClose={() => setOpen(false)} />}
    </>
  );
}

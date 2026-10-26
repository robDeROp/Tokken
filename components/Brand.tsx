'use client';
import { useT } from '@/lib/i18n';

/** RD-monogram van Rob De Rop Digital (zelfde teken als de gravure op het bord). */
export function RdrMark({ size = 22, title }: { size?: number; title?: string }) {
  return (
    <svg className="rdr-mark" width={size} height={size * 0.75} viewBox="0 0 96 72" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <g transform="translate(6 6)" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 44 6 H 22 A 12 12 0 0 0 22 30 H 44 M 27 30 L 8 54 M 44 6 H 68 A 24 24 0 0 1 68 54 H 44 M 44 6 V54" />
      </g>
    </svg>
  );
}

/** Klein label voor in een kopbalk: "RD Rob De Rop Digital". */
export function BrandTag() {
  return (
    <span className="brand-tag" title="Rob De Rop Digital">
      <RdrMark size={20} />
      <span>Rob De Rop <b>Digital</b></span>
    </span>
  );
}

/** Onderschrift: "Een spel van Rob De Rop Digital · Dilbeek". */
export function MadeBy({ compact = false }: { compact?: boolean }) {
  const { lang } = useT();
  return (
    <p className={`made-by ${compact ? 'compact' : ''}`}>
      <RdrMark size={compact ? 18 : 24} />
      <span>
        {lang === 'nl' ? 'Een spel van ' : 'A game by '}
        <strong>Rob De Rop Digital</strong>
        {!compact && <> · Dilbeek</>}
      </span>
    </p>
  );
}

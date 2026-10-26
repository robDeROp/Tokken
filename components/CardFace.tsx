'use client';
import type { Card, Rank } from '@/lib/engine';
import type { Lang } from '@/lib/i18n';

export const SUIT: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣', X: '★' };

/** Zoals op de Belgische kaarten: V (boer), D (dame), R (koning). */
export function rankLabel(r: Rank, lang: Lang): string {
  if (r === 'JK') return '★';
  if (lang === 'nl') return ({ J: 'V', Q: 'D', K: 'R' } as Record<string, string>)[r] ?? r;
  return r;
}

export function rankName(r: Rank, lang: Lang): string {
  const nl: Record<string, string> = { A: 'een aas', J: 'een boer', Q: 'een dame', K: 'een koning', JK: 'een joker' };
  const en: Record<string, string> = { A: 'an ace', J: 'a jack', Q: 'a queen', K: 'a king', JK: 'a joker' };
  return (lang === 'nl' ? nl : en)[r] ?? (lang === 'nl' ? `een ${r}` : `a ${r}`);
}

export const RANK_ORDER: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'JK'];

export default function CardFace({ card, lang, selected, dim, onClick, laid }: {
  card: Card; lang: Lang; selected?: boolean; dim?: boolean; laid?: boolean; onClick?: () => void;
}) {
  const red = card.suit === 'H' || card.suit === 'D';
  const label = rankLabel(card.rank, lang);
  return (
    <button
      type="button"
      className={`pcard ${red ? 'red' : ''} ${selected ? 'sel' : ''} ${dim ? 'dim' : ''} ${laid ? 'laid' : ''} ${card.rank === 'JK' ? 'joker' : ''}`}
      onClick={onClick}
      aria-label={`${label} ${SUIT[card.suit]}`}
    >
      <span className="ci tl">{label}<small>{SUIT[card.suit]}</small></span>
      <span className="cs">{card.rank === 'JK' ? 'Joker' : SUIT[card.suit]}</span>
      <span className="ci br">{label}<small>{SUIT[card.suit]}</small></span>
    </button>
  );
}

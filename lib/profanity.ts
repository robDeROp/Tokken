// Scheldwoordenfilter voor de chat: vervangt vloeken en beledigingen door sterretjes.
// Werkt op de server (vóór het bewaren) en in de browser (ook voor oudere berichten).
// Herkent ook schrijfwijzen als "k4nk3r" en "fuuuck". Woorden met puntjes ertussen ("k.a.n.k.e.r") niet,
// bewust: zo raken we geen gewone woorden of afkortingen.

/** Woorden die ook als begin van een samenstelling tellen ("kankerweer", "fucking", "klootzakken"). */
const STEMS = [
  // Nederlands / Vlaams
  'kanker', 'kenker', 'tering', 'tyfus', 'tiefus', 'teringlijer', 'klote', 'kloot', 'godver', 'godverdomme', 'godsamme',
  'kut', 'pokke', 'pokken', 'hoerenjong', 'hoerezoon', 'mongool', 'klootzak', 'kutwijf', 'trut', 'flikker',
  'neuk', 'pijpbek', 'kankerlijer', 'tyfuslijer', 'zakkenwasser', 'smeerlap',
  // Engels
  'fuck', 'fuk', 'motherfuck', 'shit', 'bullshit', 'bitch', 'cunt', 'asshole', 'arsehole', 'wanker', 'bastard',
  'dickhead', 'retard', 'nigg', 'faggot',
];
/** Woorden die enkel als heel woord tellen (om "hoera", "lullig gedoe"-achtige vals alarmen te beperken). */
const WORDS = [
  'hoer', 'hoeren', 'slet', 'sletten', 'lul', 'lullen', 'eikel', 'eikels', 'debiel', 'debielen', 'neger', 'negers',
  'dick', 'dicks', 'prick', 'twat', 'slut', 'sluts', 'whore', 'whores', 'cock', 'cocks', 'piss', 'damn', 'goddamn',
  'wtf', 'stfu', 'kkr', 'tyf', 'kanka', 'kenka',
];

// letters die vaak vervangen worden door cijfers of tekens
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '8': 'b', '9': 'g', '|': 'l' };

/** Normaliseer een woord: kleine letters, leet-tekens terug naar letters, 3+ dezelfde letters samen ("fuuuck" -> "fuck"). */
function norm(w: string): string {
  const s = w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split('').map((ch) => LEET[ch] ?? ch).join('');
  return s.replace(/[^a-z]/g, '').replace(/(.)\1{2,}/g, '$1');
}

const STEMS_N = STEMS.map(norm);
const WORDS_N = new Set(WORDS.map(norm));

/** Is dit (genormaliseerde) woord een scheldwoord? */
function isBad(word: string): boolean {
  const n = norm(word);
  if (n.length < 2) return false;
  if (WORDS_N.has(n)) return true;
  return STEMS_N.some((st) => n.startsWith(st));
}

/** Vervang scheldwoorden door sterretjes (zelfde lengte, minstens 3). */
export function censor(text: string): string {
  return text.replace(/[\p{L}\p{N}@$!|]+/gu, (w) => (isBad(w) ? '*'.repeat(Math.max(3, w.length)) : w));
}

export function hasProfanity(text: string): boolean {
  return censor(text) !== text;
}

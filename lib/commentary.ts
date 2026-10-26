// Tokske, de mascotte, geeft commentaar op wat er op het bord gebeurt.
// Puur: krijgt de vorige en de nieuwe (publieke) stand en geeft (soms) een zinnetje terug.
import { START, TRACK, teamOf, partnerOf, type Color, type LastMove, type Piece, type PublicState } from './engine';
import type { Lang } from './i18n';

export type Mood = 'happy' | 'shocked' | 'laugh' | 'sad' | 'cheeky' | 'proud' | 'think';
export interface Line { text: string; mood: Mood; prio: number }

const COLOR_NAME: Record<Lang, string[]> = {
  nl: ['Geel', 'Blauw', 'Oranje', 'Groen'],
  en: ['Yellow', 'Blue', 'Orange', 'Green'],
};

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

const L = {
  nl: {
    kill: ['Amai! {A} maakt {V} helemaal kapot!', 'Tok! {V} mag terug naar zijn kot. Groetjes van {A}.', 'Oei oei oei, {V}... dat was {A}.', '{A} kent geen genade met {V}!', 'Terug naar af, {V}!', 'Paf! {A} rijdt {V} gewoon omver.'],
    youKill: ['Zo! Jij slaat {V}! Dat zag ik graag.', 'Boem! {V} ligt eruit. Goed gezien!', 'Haha, {V} had dat niet zien aankomen!'],
    youStreak: ['Jij bent on fire! Al {n} op rij!', 'Killstreak! Jij hebt er al {n} op rij.'],
    youDead: ['Ai, {A} heeft jou te pakken. Wraak nemen?', 'Auw! {A} stuurt je terug naar je kot.', 'Dat doet pijn... {A} zal dat nog berouwen.'],
    partnerDead: ['Hela! {A} pakt je ploegmaat {V}!', 'Je maat {V} is gesneuveld. {A} staat op de lijst.'],
    streak2: ['Killstreak voor {A}! Al {n} op rij!', '{A} is on fire! {n} slachtoffers!'],
    streak3: ['Niet te stoppen! {A} heeft er al {n} op rij!', 'Iemand, stop {A} alstublieft! Al {n}!', '{A} op oorlogspad: {n} op rij!'],
    multi: ['Dubbele tok! {A} veegt er {n} tegelijk weg!', 'Strike! {A} koegelt er {n} tegelijk van het bord!'],
    friendly: ['Allee {A}, dat is uw eigen maat!', 'Eigen doelpunt van {A}! {V} kijkt boos.', 'Euh {A}... {V} speelt bij jou in de ploeg hé.'],
    nearHome: ['Pijnlijk! {V} stond al bijna thuis.', 'Zo dichtbij, {V}... en dan dit.'],
    home: ['{A} zit veilig in het huisje.', 'Thuis is thuis, zegt {A}.', 'Hop, {A} parkeert er weer één.'],
    homeLast: ['{A} is helemaal binnen! Nu de maat helpen.', 'Alle vier binnen voor {A}! Bravo!'],
    youHome: ['Mooi! Weer eentje veilig thuis.', 'Ingeparkeerd! Netjes.'],
    stick: ['{A} gooit alles weg en krijgt een stokje.', 'Stokje voor {A}. Nog één en hij komt gratis buiten!'],
    freeExit: ['Gratis buiten! Twee stokjes doen wonderen voor {A}.'],
    swap: ['Boer! {A} doet een stoelendans.', 'Hop, van plaats gewisseld! {A} speelt vuil.', 'Wissel! {A} pikt een betere plek in.'],
    seven: ['Een 7 in stukjes. {A} is aan het rekenen.', '{A} splitst de 7, slim!'],
    back4: ['{A} gaat achteruit... slim of verdwaald?', 'Achteruit met de 4: {A} kiest de sluipweg.'],
    out: ['{A} komt buiten. Welkom op de baan!', 'Daar is {A} met een nieuwe knikker.'],
    blocker: ['{A} staat op zijn 1 en blokkeert alles.'],
    discard: ['{A} kan niks en gooit weg. Pech!', 'Niks te doen voor {A}.'],
    winUs: ['Gewonnen! Jullie zijn de koningen van Dilbeek!', 'Victorie! Tokske is trots op jullie!'],
    winThem: ['Verloren... volgende keer beter, ik geloof in u!', 'Ah jammer. Revanche?'],
    close: ['{T} ruikt de overwinning!', 'Spannend! {T} heeft er al {n} binnen.'],
    idle: ['Spannende boel hier!', 'Wie gaat er winnen? Ik zeg... de knikkers.', 'Ik hou de score bij, maak u geen zorgen.'],
    tips: ['Tip: met de 5 mag je ook de knikker van een ander 5 vooruit zetten.', 'Tip: op je eigen 1 kan niemand je slaan, en niemand kan erover.', 'Tip: de koning slaat iedereen die hij voorbij steekt.', 'Tip: met de 4 achteruit vanaf je 1 sta je vlak voor je huisje.', 'Tip: hou een aas of koning bij zolang er knikkers in je kot zitten.', 'Tip: een knikker vlak voor een tegenstander staat gevaarlijk.', 'Tip: met de boer wissel je van plaats met eender welke knikker.'],
  },
  en: {
    kill: ['Damn! {A} just destroyed {V}!', 'Tok! {V} goes back home. Love, {A}.', 'Oh no, {V}... that was {A}.', '{A} shows {V} no mercy!', 'Back to start, {V}!', 'Bam! {A} runs straight over {V}.'],
    youKill: ['Yes! You took out {V}! Love to see it.', 'Boom! {V} is out. Nice one!', 'Ha, {V} never saw that coming!'],
    youStreak: ['You are on fire! {n} in a row!', 'Kill streak! You have {n} in a row.'],
    youDead: ['Ouch, {A} got you. Revenge time?', '{A} sends you back to your box.', 'That hurts... {A} will regret that.'],
    partnerDead: ['Hey! {A} took out your partner {V}!', 'Your partner {V} is down. {A} is on the list.'],
    streak2: ['Kill streak for {A}! {n} in a row!', '{A} is on fire! {n} victims!'],
    streak3: ['Unstoppable! {A} has {n} in a row!', 'Someone please stop {A}! Already {n}!', 'What a kill streak from {A}: {n}!'],
    multi: ['Double tok! {A} wipes out {n} at once!', 'Strike! {A} bowls {n} off the board!'],
    friendly: ['Come on {A}, that is your own partner!', 'Own goal by {A}! {V} is not amused.', 'Uh, {A}... {V} is on your team.'],
    nearHome: ['Painful! {V} was almost home.', 'So close, {V}... and then this.'],
    home: ['{A} is safe in the house.', 'Home sweet home, says {A}.', '{A} parks another one.'],
    homeLast: ['{A} is all in! Now help your partner.', 'All four home for {A}! Bravo!'],
    youHome: ['Nice! Another one safe at home.', 'Parked! Neat.'],
    stick: ['{A} throws everything away and gets a stick.', 'A stick for {A}. One more and it comes out for free!'],
    freeExit: ['Free exit! Two sticks work wonders for {A}.'],
    swap: ['Jack! {A} plays musical chairs.', 'Swapped! {A} plays dirty.', 'Swap! {A} grabs a better spot.'],
    seven: ['A split 7. {A} is doing the maths.', '{A} splits the 7, clever!'],
    back4: ['{A} goes backwards... clever or lost?', 'Four back: {A} takes the shortcut.'],
    out: ['{A} comes out. Welcome to the track!', 'Here comes {A} with a new marble.'],
    blocker: ['{A} sits on its 1 and blocks everything.'],
    discard: ['{A} can\'t do a thing. Bad luck!', 'Nothing to do for {A}.'],
    winUs: ['You won! Kings of Dilbeek!', 'Victory! Tokske is proud of you!'],
    winThem: ['Lost... next time, I believe in you!', 'Aw, too bad. Rematch?'],
    close: ['{T} can smell victory!', 'Tense! {T} has {n} home already.'],
    idle: ['Exciting stuff!', 'Who will win? I say... the marbles.', 'I\'m keeping score, don\'t worry.'],
    tips: ['Tip: with a 5 you may also move someone else\'s marble 5 forward.', 'Tip: on your own 1 nobody can hit you, or pass you.', 'Tip: the king hits everyone it passes.', 'Tip: 4 back from your 1 puts you right before your house.', 'Tip: keep an ace or king while marbles are still in your box.', 'Tip: a marble right in front of an opponent is in danger.', 'Tip: with the jack you swap places with any marble.'],
  },
};

const homeCount = (P: Piece[], c: Color) => P.filter((p) => p.color === c && p.pos.t === 'lane').length;
const progressOf = (p: Piece | undefined) => {
  if (!p || p.pos.t !== 'track') return 0;
  return (p.pos.i - START(p.color) + TRACK) % TRACK;
};

/** Houdt killstreaks bij over zetten heen. */
export class Commentator {
  private streak = [0, 0, 0, 0];
  private sinceLine = 0;
  constructor(private lang: Lang, private names: string[], private me: Color | null, private training: boolean) {}
  setLang(l: Lang) { this.lang = l; }
  setNames(n: string[]) { this.names = n; }

  private who(c: Color) {
    const col = COLOR_NAME[this.lang][c];
    const n = this.names[c];
    if (this.me === c) return this.lang === 'nl' ? 'jij' : 'you';
    return n && n !== col ? `${n} (${col.toLowerCase()})` : col;
  }

  /** Nieuwe zet: geef eventueel een lijn terug (spaarzaam: enkel hoogtepunten, met rust ertussen). */
  react(prev: PublicState | null, cur: PublicState): Line | null {
    this.sinceLine++;
    const l = this.raw(prev, cur);
    if (!l) return null;
    const quiet = this.sinceLine;
    const ok =
      l.prio >= 9 ? quiet >= 2 :                          // winst, jij slaat / wordt geslagen, killstreak
      l.prio >= 8 ? quiet >= 4 :                          // eigen maat, dubbele kill, bijna-thuis
      l.prio >= 7 ? quiet >= 6 && Math.random() < 0.5 :   // gewone kill, iemand helemaal binnen
      l.prio >= 4 ? quiet >= 12 && Math.random() < 0.3 :  // huisje, stokje, wissel
      quiet >= 20 && Math.random() < 0.35;                // weetjes en tips
    if (!ok && l.prio < 10) return null;
    this.sinceLine = 0;
    return l;
  }

  private raw(prev: PublicState | null, cur: PublicState): Line | null {
    const last: LastMove | null = cur.last;
    const T = L[this.lang];
    if (cur.winner !== null && (!prev || prev.winner === null)) {
      const us = this.me === null || teamOf(this.me) === cur.winner;
      return { text: pick(us ? T.winUs : T.winThem), mood: us ? 'proud' : 'sad', prio: 10 };
    }
    if (!last) return null;
    const A = last.by;
    const vars = { A: this.who(A) } as Record<string, string | number>;
    const say = (list: string[], mood: Mood, prio: number, extra: Record<string, string | number> = {}): Line => {
      let text = fill(pick(list), { ...vars, ...extra });
      text = text.charAt(0).toUpperCase() + text.slice(1);
      return { text, mood, prio };
    };

    if (last.kills.length) {
      const prevP = prev?.pieces ?? [];
      const victims = last.kills.map((id) => cur.pieces[id]).filter(Boolean);
      const v = victims[0];
      const V = this.who(v.color);
      const friendly = victims.every((x) => teamOf(x.color) === teamOf(A));
      if (!friendly) this.streak[A] += victims.filter((x) => teamOf(x.color) !== teamOf(A)).length;
      for (const x of victims) this.streak[x.color] = 0;
      const n = this.streak[A];
      if (friendly) return say(T.friendly, 'laugh', 8, { V });
      if (this.me !== null && v.color === this.me) return say(T.youDead, 'sad', 9, { V });
      if (this.me !== null && A === this.me) return say(n >= 2 ? T.youStreak : T.youKill, 'proud', 9, { V, n });
      if (victims.length > 1) return say(T.multi, 'shocked', 9, { n: victims.length });
      if (n >= 3) return say(T.streak3, 'shocked', 9, { n });
      if (n === 2) return say(T.streak2, 'shocked', 8, { n });
      if (this.me !== null && v.color === partnerOf(this.me)) return say(T.partnerDead, 'sad', 8, { V });
      if (progressOf(prevP[v.id]) > 50) return say(T.nearHome, 'shocked', 8, { V });
      return say(T.kill, 'shocked', 7, { V });
    }

    if (last.kind === 'discardAll' && last.earnsStick) return say(T.stick, 'think', 4);
    if (last.kind === 'freeExit') return say(T.freeExit, 'happy', 5);
    if (last.moves.some((m) => m.to.t === 'lane' && m.from.t !== 'lane')) {
      const col = cur.pieces[last.moves.find((m) => m.to.t === 'lane')!.piece].color;
      const hc = homeCount(cur.pieces, col);
      if (hc === 4) return say(T.homeLast, 'proud', 7, { A: this.who(col) });
      if (this.me === col) return say(T.youHome, 'happy', 5);
      if (Math.random() < 0.6) return say(T.home, 'happy', 4, { A: this.who(col) });
      const team = teamOf(col);
      const both = homeCount(cur.pieces, col) + homeCount(cur.pieces, partnerOf(col));
      if (both >= 6) return say(T.close, 'cheeky', 5, { T: this.lang === 'nl' ? `Ploeg ${this.who(col)}` : `Team ${this.who(col)}`, n: both, team });
    }
    if (last.swap && Math.random() < 0.7) return say(T.swap, 'cheeky', 4);
    if (last.rank === '7' && last.moves.length > 1 && Math.random() < 0.5) return say(T.seven, 'think', 3);
    if (last.rank === '4' && last.moves.length === 1 && last.moves[0].from.t === 'track' && Math.random() < 0.4) return say(T.back4, 'cheeky', 3);
    if (last.moves.some((m) => m.from.t === 'kot') && Math.random() < 0.25) return say(T.out, 'happy', 2);
    if (last.kind === 'discardAll' && Math.random() < 0.3) return say(T.discard, 'laugh', 2);
    if (this.sinceLine > 20) {
      if (this.training && Math.random() < 0.7) return say(T.tips, 'think', 1);
      return say(T.idle, 'cheeky', 1);
    }
    return null;
  }
}

export const HOME_LINES: Record<Lang, string[]> = {
  nl: ['Hallo! Ik ben Tokske, de knikker van Dilbeek.', 'Zin in een spelletje Tokken?', 'Oefenen tegen de robots? Ik geef commentaar!', 'Klik op mij voor een tip.', 'Ik heb al veel knikkers terug naar hun kot zien rollen...'],
  en: ['Hi! I\'m Tokske, the marble from Dilbeek.', 'Fancy a game of Tokken?', 'Practice against the robots? I\'ll do the commentary!', 'Click me for a tip.', 'I\'ve seen many marbles roll back to their box...'],
};
export const tipLine = (lang: Lang) => pick(L[lang].tips);

'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import Link from 'next/link';
import {
  playedCardThisRound, movesForRank, sevenNext, applySevenSteps, rankHasMove, handHasMove, needsFreeExit, controlledColor, posEq,
  START,
  type Card, type Color, type Move, type Pos, type PublicState, type Mode,
} from '@/lib/engine';
import { sb, api, ApiError, getToken, setToken, getName, setName } from '@/lib/supabase';
import { useT, LangToggle } from '@/lib/i18n';
import { BrandTag, MadeBy } from './Brand';
import Board, { COLOR_HEX, holeKey, type HoleRef } from './Board';
import Chat from './Chat';
import SoundToggle, { SpeedPicker, MascotToggle } from './SoundToggle';
import { TokskeCommentator } from './Tokske';
import { moveDuration, dealDuration, dealTiming, SHUFFLE_MS } from '@/lib/board';
import { getSpeed } from '@/lib/prefs';
import CardFace, { RANK_ORDER, rankName } from './CardFace';

export type Seat = { playerId: string | null; name: string; bot: boolean } | null;
export interface GameRow {
  id: string; code: string; status: 'lobby' | 'playing' | 'finished'; mode: Mode; host_player: string;
  players: { id: string; name: string }[]; seats: Seat[]; state: PublicState | null; version: number;
}
export interface Me { playerId: string; seat: Color | null; hand: Card[]; version: number }

export default function Room({ code }: { code: string }) {
  const { t, lang } = useT();
  const [game, setGame] = useState<GameRow | null>(null);
  const [missing, setMissing] = useState(false);
  const [token, setTok] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const activeCode = useRef(code);
  activeCode.current = code;
  const latestVersion = useRef(0);
  const privateVersion = useRef(-1);
  useEffect(() => { latestVersion.current = Math.max(latestVersion.current, game?.version ?? 0); }, [game?.version]);
  const accept = useCallback((r: { game?: GameRow; me?: Me | null }) => {
    if (r.game && r.game.code !== activeCode.current) return;
    if (r.game) {
      latestVersion.current = Math.max(latestVersion.current, r.game.version);
      setGame((g) => !g || r.game!.version >= g.version ? r.game! : g);
    }
    if (r.me) {
      privateVersion.current = Math.max(privateVersion.current, r.me.version);
      setMe((m) => !m || r.me!.version >= m.version ? r.me! : m);
    }
  }, []);

  useEffect(() => {
    latestVersion.current = 0; privateVersion.current = -1;
    setGame(null); setMe(null); setMissing(false); setMsg('');
    setTok(getToken(code));
  }, [code]);

  // spelstand laden + live volgen
  useEffect(() => {
    let alive = true;
    const client = sb();
    client.from('games').select('*').eq('code', code).maybeSingle().then(({ data }) => {
      if (!alive) return;
      if (!data) setMissing(true); else setGame(data as GameRow);
    });
    let connected = false;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      client.from('games').select('*').eq('code', code).maybeSingle().then(({ data }) => {
        if (alive && data) setGame((g) => !g || data.version > g.version ? data as GameRow : g);
      });
    };
    const timer = setInterval(() => { if (!connected) refresh(); }, 5000);
    window.addEventListener('focus', refresh);
    const ch = client.channel(`game-${code}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `code=eq.${code}` }, (payload) => {
        const row = payload.new as GameRow;
        setGame((g) => (!g || row.version >= g.version ? row : g));
      })
      .subscribe((status) => {
        connected = status === 'SUBSCRIBED';
        // na een herverbinding de laatste stand opnieuw ophalen
        if (status === 'SUBSCRIBED') client.from('games').select('*').eq('code', code).maybeSingle().then(({ data }) => {
          if (alive && data) setGame((g) => (!g || data.version >= g.version ? (data as GameRow) : g));
        });
      });
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', refresh); client.removeChannel(ch); };
  }, [code]);

  // wie is er online
  useEffect(() => {
    if (!me?.playerId) return;
    const client = sb();
    const ch = client.channel(`presence-${code}`, { config: { presence: { key: me.playerId } } });
    ch.on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(ch.presenceState()))))
      .subscribe((s) => { if (s === 'SUBSCRIBED') ch.track({ at: Date.now() }); });
    return () => { client.removeChannel(ch); };
  }, [code, me?.playerId]);

  // mijn kaarten ophalen bij elke verandering
  const version = game?.version;
  useEffect(() => {
    if (!token || version === undefined || privateVersion.current >= version) return;
    let alive = true;
    api<Me>({ op: 'me', code, token }).then((m) => { if (alive) { privateVersion.current = Math.max(privateVersion.current, m.version); setMe((prev) => !prev || m.version >= prev.version ? m : prev); } }).catch((e) => {
      if (e instanceof ApiError && e.message === 'not_in_room') { setTok(null); }
    });
    return () => { alive = false; };
  }, [token, version, code]);

  // computerspelers laten spelen (met een korte pauze zodat je kan volgen)
  const pub = game?.state ?? null;
  const botTurn = game?.status === 'playing' && pub && game.seats[pub.turn]?.bot;
  useEffect(() => {
    if (!botTurn || !token || !game) return;
    const tm = setTimeout(() => {
      api<{ game?: GameRow; me?: Me }>({ op: 'botStep', code, token, version: game.version }).then(accept).catch(() => {});
    }, Math.max(850, moveDuration(game.state?.last ?? null, game.state?.pieces ?? [], getSpeed()) + 300) + (game.state && (game.state.log.length === 0 || game.state.log.at(-1)!.round !== game.state.round) ? dealDuration(getSpeed()) : 0) + Math.random() * 300);
    return () => clearTimeout(tm);
  }, [botTurn, token, me?.seat, game, code, accept]);

  const call = useCallback(async (body: Record<string, unknown>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMsg('');
    try {
      const r = await api<{ game?: GameRow; me?: Me }>({ code, token, ...body,
        ...(body.op === 'act' ? { version: latestVersion.current } : {}) });
      accept(r);
    } catch (e) {
      setMsg(t.errors[(e as Error).message] ?? t.errors.server_error);
      const { data } = await sb().from('games').select('*').eq('code', code).maybeSingle();
      if (data) accept({ game: data as GameRow });
    } finally { inFlight.current = false; setBusy(false); }
  }, [code, token, t, accept]);

  if (missing) return <Shell><div className="panel narrow"><p>{t.notFound}</p><Link href="/" className="btn">{t.back}</Link></div></Shell>;
  if (!game) return <Shell><div className="panel narrow"><p>{t.loading}</p></div></Shell>;
  if (!token) return <Shell><JoinBox code={code} onJoined={(tk) => { setToken(code, tk); setTok(tk); }} /></Shell>;

  const isHost = me?.playerId === game.host_player;
  if (game.status === 'lobby' || !pub) {
    return <Shell><Lobby game={game} me={me} isHost={isHost} online={online} call={call} busy={busy} msg={msg} /></Shell>;
  }
  return (
    <Game chatToken={token} game={game} pub={pub} me={me} isHost={isHost} online={online} call={call} busy={busy} msg={msg} setMsg={setMsg} />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="shell">
      <header className="top">
        <Link href="/" className="logo">Tokken</Link>
        <BrandTag />
        <LangToggle />
      </header>
      {children}
      <footer className="site-foot"><MadeBy /></footer>
    </main>
  );
}

function JoinBox({ code, onJoined }: { code: string; onJoined: (token: string) => void }) {
  const { t } = useT();
  const [name, setN] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => setN(getName()), []);
  return (
    <form className="panel narrow" onSubmit={async (e) => {
      e.preventDefault();
      if (!name.trim()) return;
      setName(name.trim());
      try { const r = await api<{ token: string }>({ op: 'join', code, name }); onJoined(r.token); }
      catch (e2) { setErr(t.errors[(e2 as Error).message] ?? t.errors.server_error); }
    }}>
      <h1 className="h-hand">{t.room} {code}</h1>
      <label className="field">{t.yourName}
        <input value={name} onChange={(e) => setN(e.target.value)} maxLength={20} autoFocus />
      </label>
      <button className="btn primary" type="submit">{t.join}</button>
      {err && <p className="err">{err}</p>}
    </form>
  );
}

function Lobby({ game, me, isHost, online, call, busy, msg }: {
  game: GameRow; me: Me | null; isHost: boolean; online: Set<string>;
  call: (b: Record<string, unknown>) => Promise<void>; busy: boolean; msg: string;
}) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const full = game.seats.every(Boolean);
  const seatedIds = new Set(game.seats.map((s) => s?.playerId).filter(Boolean));
  const watchers = game.players.filter((p) => !seatedIds.has(p.id));
  return (
    <div className="lobby">
      <section className="panel">
        <div className="lobby-head">
          <h1 className="h-hand">{t.room} <span className="code">{game.code}</span></h1>
          <button className="btn" onClick={() => {
            navigator.clipboard?.writeText(window.location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
          }}>{copied ? t.copied : t.shareLink}</button>
        </div>
        <div className="seats">
          {[0, 1, 2, 3].map((i) => {
            const s = game.seats[i];
            const mine = s && s.playerId === me?.playerId;
            return (
              <div key={i} className={`seat seat-${i} ${mine ? 'mine' : ''}`} style={{ ['--c' as string]: COLOR_HEX[i] }}>
                <span className="dot" />
                <div className="seat-body">
                  <strong>{t.colors[i]}</strong>
                  <span className="muted small">{t.partner}: {t.teamNames[i % 2]}</span>
                  <span className="seat-who">
                    {s ? <>{s.name}{mine ? ` (${t.you})` : ''}{s.playerId && !online.has(s.playerId) && !mine ? <em className="muted"> · {t.offline}</em> : null}</> : <span className="muted">{t.empty}</span>}
                  </span>
                </div>
                <div className="seat-actions">
                  {!s && <button className="btn small" disabled={busy} onClick={() => call({ op: 'sit', seat: i })}>{t.sitHere}</button>}
                  {!s && <button className="btn small ghost" disabled={busy} onClick={() => call({ op: 'addBot', seat: i })}>+ {t.addBot}</button>}
                  {s?.bot && <button className="btn small ghost" disabled={busy} onClick={() => call({ op: 'removeBot', seat: i })}>{t.removeBot}</button>}
                  {mine && <button className="btn small ghost" disabled={busy} onClick={() => call({ op: 'stand' })}>{t.standUp}</button>}
                </div>
              </div>
            );
          })}
        </div>
        {watchers.length > 0 && <p className="muted small">👀 {watchers.map((w) => w.name).join(', ')}</p>}
      </section>
      <section className="panel">
        <h2>{t.mode}</h2>
        <div className="modes">
          {(['training', 'hulp', 'pro'] as Mode[]).map((m) => (
            <button key={m} className={`mode ${game.mode === m ? 'on' : ''}`} disabled={!isHost || busy}
              onClick={() => call({ op: 'setMode', mode: m })}>
              <strong>{t.modes[m]}</strong>
              <span>{t.modeHelp[m]}</span>
            </button>
          ))}
        </div>
        {isHost ? (
          <>
            <button className="btn primary big" disabled={!full || busy} onClick={() => call({ op: 'start' })}>{t.start}</button>
            {!full && <p className="muted small">{t.needFour}</p>}
          </>
        ) : <p className="muted">{t.waitingHost}</p>}
        {msg && <p className="err">{msg}</p>}
      </section>
    </div>
  );
}

const lastLogNumber = (pub: PublicState) => pub.log.at(-1)?.n ?? -1;

type Step = { piece: number; to: Pos };

export function Game({ game, pub, me, isHost, online, call, busy, msg, setMsg, chatToken, mascot }: {
  chatToken?: string;
  /** Tokske geeft commentaar (oefenen) */
  mascot?: boolean;
  game: GameRow; pub: PublicState; me: Me | null; isHost: boolean; online: Set<string>;
  call: (b: Record<string, unknown>) => Promise<void>; busy: boolean; msg: string; setMsg: (s: string) => void;
}) {
  const { t, lang } = useT();
  const seat = me?.seat ?? null;
  const viewer: Color = seat ?? 0;
  const hand = useMemo(() => (me?.hand ?? []).slice().sort((a, b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank) || a.suit.localeCompare(b.suit)), [me?.hand]);
  const myTurn = game.status === 'playing' && seat !== null && pub.turn === seat && pub.winner === null;
  const mode = pub.mode;
  // nieuwe ronde (of nieuw spel): kaarten uitdelen met animatie
  const [dealRound, setDealRound] = useState<number | null>(null);
  const seenRound = useRef<number | null>(null);
  useLayoutEffect(() => {
    const r = pub.round;
    if (game.status !== 'playing') { seenRound.current = r; return; }
    const fresh = seenRound.current === null ? pub.log.length === 0 : r !== seenRound.current;
    seenRound.current = r;
    if (fresh) setDealRound(r);
  }, [pub.round, pub.log.length, game.status]);
  const dealVars = (() => {
    const { gap, fly } = dealTiming(getSpeed());
    const off = seat === null ? 0 : (seat - pub.dealer + 3) % 4;
    return { ['--gap' as string]: `${gap}ms`, ['--fly' as string]: `${fly}ms`, ['--shuffle' as string]: `${SHUFFLE_MS}ms`, ['--off' as string]: off } as React.CSSProperties;
  })();

  const [selCard, setSelCard] = useState<number | null>(null);
  const [selPiece, setSelPiece] = useState<number | null>(null);
  const [seven, setSeven] = useState<Step[]>([]);
  const [showDiscard, setShowDiscard] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [zoom, setZoom] = useState(1);
  const logRef = useRef<HTMLOListElement>(null);
  const followLog = useRef(true);
  useEffect(() => {
    const el = logRef.current;
    if (el && followLog.current) el.scrollTop = el.scrollHeight;
  }, [lastLogNumber(pub)]);
  useEffect(() => {
    if (!showControls) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setShowControls(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showControls]);


  // Nieuwe zet: selectie wissen. Een kaart kiezen blijft volledig lokaal.
  const lastLog = pub.log.length ? pub.log[pub.log.length - 1].n : -1;
  const turnKey = `${pub.round}:${pub.turn}:${lastLog}`;
  const lastTurnKey = useRef(turnKey);
  useEffect(() => {
    if (lastTurnKey.current !== turnKey) {
      lastTurnKey.current = turnKey;
      setSelPiece(null); setSeven([]); setShowDiscard(false);
      setSelCard(null);
    }
  }, [turnKey, pub.laid, pub.turn, seat]);
  // kaart niet meer in de hand -> weg
  useEffect(() => { if (selCard !== null && !hand.some((h) => h.id === selCard)) setSelCard(null); }, [hand, selCard]);

  const card = hand.find((h) => h.id === selCard) ?? null;
  const rank = card?.rank ?? null;
  const free = myTurn && seat !== null && needsFreeExit(pub.pieces, seat, pub.sticks[seat], pub.freeExitDone, hand);

  const moves: Move[] = useMemo(() => (myTurn && seat !== null && rank && rank !== '7' ? movesForRank(pub.pieces, seat, rank).map((g) => g.move) : []), [myTurn, seat, rank, pub.pieces]);
  const sevenState = useMemo(() => (myTurn && seat !== null && rank === '7' ? applySevenSteps(pub.pieces, seat, seven) : null), [myTurn, seat, rank, pub.pieces, seven]);
  const sevenOpts = useMemo(() => (myTurn && seat !== null && rank === '7' ? sevenNext(pub.pieces, seat, seven) : []), [myTurn, seat, rank, pub.pieces, seven]);
  const displayPieces = sevenState?.P ?? pub.pieces;

  const playable = useMemo(() => {
    const s = new Set<number>();
    if (!myTurn || seat === null) return s;
    for (const h of hand) if (rankHasMove(pub.pieces, seat, h.rank)) s.add(h.id);
    return s;
  }, [myTurn, seat, hand, pub.pieces]);

  // ---------- markeringen volgens de modus ----------
  const { hlPieces, hlHoles } = useMemo(() => {
    const hp = new Set<number>(), hh = new Set<string>();
    if (!myTurn || seat === null) return { hlPieces: hp, hlHoles: hh };
    if (free) {
      if (mode !== 'pro') for (const p of pub.pieces) if (p.color === seat && p.pos.t === 'kot') hp.add(p.id);
      return { hlPieces: hp, hlHoles: hh };
    }
    if (!rank || mode === 'pro') return { hlPieces: hp, hlHoles: hh };
    const colorOf = (id: number) => displayPieces[id].color;
    if (rank === '7') {
      for (const o of sevenOpts) {
        if (mode === 'training') hp.add(o.piece);
        if (o.piece === selPiece) hh.add(holeKey(o.to, colorOf(o.piece)));
      }
    } else {
      for (const m of moves) {
        if (m.kind === 'seven') continue;
        if (mode === 'training') hp.add(m.piece);
        if (m.piece === selPiece) {
          if (m.kind === 'step') hh.add(holeKey(m.to, colorOf(m.piece)));
          if (m.kind === 'swap') hp.add(m.target);
          if (m.kind === 'out') hh.add(holeKey({ t: 'track', i: START(colorOf(m.piece)) }));
        }
      }
      if (mode === 'training' && moves.some((m) => m.kind === 'out')) {
        for (const p of pub.pieces) if (p.color === controlledColor(pub.pieces, seat) && p.pos.t === 'kot') hp.add(p.id);
      }
    }
    return { hlPieces: hp, hlHoles: hh };
  }, [myTurn, seat, free, rank, mode, sevenOpts, moves, selPiece, displayPieces, pub.pieces]);

  // ---------- acties ----------
  const err = (k: string) => setMsg(t.errors[k] ?? k);
  const play = (move: Move) => { if (card) call({ op: 'act', action: { type: 'play', card: card.id, move } }); };

  const pickCard = async (c: Card) => {
    if (!myTurn || busy) return;
    if (free) { err('free_exit_first'); return; }
    setMsg('');
    setSeven([]);
    const candidates = c.rank === '7' ? sevenNext(pub.pieces, seat!, []) : movesForRank(pub.pieces, seat!, c.rank).map((g) => g.move).filter((m) => m.kind !== 'seven');
    const ids = new Set(candidates.map((m) => m.piece));
    setSelPiece(ids.size === 1 && mode !== 'pro' ? [...ids][0] : null);
    setSelCard(selCard === c.id ? null : c.id);
  };

  const tryDest = (pos: Pos, laneColor?: Color): boolean => {
    if (!card || seat === null) return false;
    const colorOk = (pid: number) => pos.t !== 'lane' || displayPieces[pid].color === laneColor;
    if (rank === '7') {
      const opts = sevenOpts.filter((o) => posEq(o.to, pos) && colorOk(o.piece) && (selPiece === null || o.piece === selPiece));
      const uniq = new Set(opts.map((o) => o.piece));
      if (opts.length === 0 || uniq.size > 1) return false;
      const o = opts[0];
      const next = [...seven, { piece: o.piece, to: o.to }];
      const r = applySevenSteps(pub.pieces, seat, next);
      if (r && r.remaining === 0) { play({ kind: 'seven', steps: next }); }
      setSeven(next);
      setSelPiece(null);
      return true;
    }
    const cands = moves.filter((m) => m.kind === 'step' && posEq(m.to, pos) && colorOk(m.piece) && (selPiece === null || m.piece === selPiece));
    const outHere = pos.t === 'track' && selPiece !== null && moves.find((m) => m.kind === 'out' && displayPieces[selPiece].pos.t === 'kot' && START(displayPieces[selPiece].color) === pos.i);
    if (outHere) { play({ kind: 'out', piece: selPiece! }); return true; }
    const pieces = new Set(cands.map((m) => (m as { piece: number }).piece));
    if (cands.length === 0 || pieces.size > 1) return false;
    play(cands[0]);
    return true;
  };

  const onHole = (h: HoleRef) => {
    if (!myTurn || busy) return;
    if (free) return;
    if (!card) { setMsg(t.pickCard); return; }
    if (!tryDest(h.pos, h.laneColor)) {
      if (selPiece === null) setMsg(t.pickPiece); else err('illegal_move');
    }
  };

  const onPiece = (pid: number) => {
    if (!myTurn || busy || seat === null) return;
    const p = displayPieces[pid];
    if (free) {
      if (p.color === seat && p.pos.t === 'kot') call({ op: 'act', action: { type: 'freeExit', piece: pid } });
      return;
    }
    if (!card) { setMsg(t.pickCard); return; }
    setMsg('');
    if (p.pos.t === 'kot') {
      const out = moves.find((m) => m.kind === 'out');
      if (out && p.color === controlledColor(pub.pieces, seat)) play({ kind: 'out', piece: pid });
      else err('illegal_move');
      return;
    }
    if (selPiece !== null && selPiece !== pid) {
      // op een andere pion klikken = daarheen gaan (slaan) of wisselen met de boer
      if (p.pos.t === 'track' && tryDest(p.pos)) return;
      if (rank === 'J') {
        const sw = moves.find((m) => m.kind === 'swap' && m.piece === selPiece && m.target === pid);
        if (sw) { play(sw); return; }
        const mine = p.color === controlledColor(pub.pieces, seat);
        if (!mine) { err('illegal_move'); return; }
      }
    }
    setSelPiece(selPiece === pid ? null : pid);
  };

  // ---------- teksten ----------
  const nameOf = (c: Color) => game.seats[c]?.name ?? t.colors[c];
  const colorName = (c: Color) => t.colors[c];
  const logLine = (e: PublicState['log'][number]) => {
    let s = '';
    if (e.kind === 'play') s = t.logPlay(nameOf(e.by), rankName(e.rank!, lang));
    else if (e.kind === 'discardOne') s = t.logDiscardOne(nameOf(e.by), rankName(e.rank!, lang));
    else if (e.kind === 'discardAll') s = t.logDiscardAll(nameOf(e.by), e.earnsStick ?? true);
    else s = t.logFree(nameOf(e.by));
    if (e.swap) s += t.logSwap(colorName(pub.pieces[e.swap[0]].color), colorName(pub.pieces[e.swap[1]].color));
    if (e.kills.length) s += t.logKills(e.kills.map((k) => colorName(pub.pieces[k].color)).join(', '));
    return s;
  };

  let hint = '';
  if (myTurn) {
    if (free) hint = t.freeExit;
    else if (!card) hint = t.pickCard;
    else if (rank === '7') hint = t.sevenLeft(sevenState?.remaining ?? 7);
    else if (rank === 'J' && selPiece !== null) hint = t.pickSwap;
    else if (selPiece === null) hint = t.pickPiece;
    else hint = t.pickDest;
  }
  const playingForPartner = seat !== null && controlledColor(pub.pieces, seat) !== seat;

  const ghosts = (sevenState?.traces ?? []).map((tr) => ({ from: tr.from, color: pub.pieces[tr.piece].color }));

  const order: Color[] = [0, 1, 2, 3].map((i) => ((viewer + i) % 4) as Color);

  return (
    <main className="game">
      <button className="drawer-trigger" aria-label={lang === 'nl' ? 'Instellingen openen' : 'Open settings'} onClick={() => setShowControls(true)}>
        <span aria-hidden="true">☰</span>
      </button>
      {showControls && <>
        <button className="drawer-scrim" aria-label={lang === 'nl' ? 'Instellingen sluiten' : 'Close settings'} onClick={() => setShowControls(false)} />
        <aside className="game-drawer" aria-label={lang === 'nl' ? 'Spelinstellingen' : 'Game settings'}>
          <div className="drawer-heading">
            <div><Link href="/" className="logo">Tokken</Link><p>{t.room} {game.code}</p></div>
            <button className="drawer-close" aria-label={lang === 'nl' ? 'Sluiten' : 'Close'} onClick={() => setShowControls(false)}>×</button>
          </div>
          <p className="drawer-meta">{t.modes[mode]} · {t.round} {pub.round} · {pub.moveNo} {lang === 'nl' ? 'zetten' : 'moves'}</p>
          <button className="btn drawer-rules" onClick={() => { setShowRules(true); setShowControls(false); }}>{t.rules}</button>
          <div className="drawer-control"><span>{lang === 'nl' ? 'Taal' : 'Language'}</span><LangToggle /></div>
          <label className="drawer-zoom">{t.zoom}<input aria-label={t.zoom} type="range" min="1" max="1.7" step="0.1" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
          <div className="drawer-control"><button className="btn small" onClick={() => setZoom(1)}>100%</button><SoundToggle />{mascot && <MascotToggle />}</div>
          <div className="drawer-control drawer-speed"><span>{lang === 'nl' ? 'Snelheid' : 'Speed'}</span><SpeedPicker /></div>
          <MadeBy compact />
        </aside>
      </>}
      <div className={`table ${chatToken && me ? 'with-chat' : 'without-chat'}`}>
        <div className="board-wrap">
          <div className="board-scale" style={{ ['--zoom' as string]: zoom }}>
          <Board
            pieces={displayPieces} viewer={viewer} turn={pub.winner === null ? pub.turn : null}
            turnLabel={pub.winner !== null ? t.win(t.teamNames[pub.winner]) : myTurn ? `${t.yourTurn} · ${busy ? t.saving : hint || t.pickCard}` : t.turnOf(nameOf(pub.turn))}
            sticks={pub.sticks}
            names={game.seats.map((s) => s?.name ?? null)} center={pub.center} laidCard={null}
            last={rank === '7' && seven.length ? null : pub.last} lang={lang}
            highlightPieces={hlPieces} highlightHoles={hlHoles} selectedPiece={selPiece} ghosts={ghosts}
            onPiece={onPiece} onHole={onHole}
            moveKey={lastLogNumber(pub)} winner={pub.winner} mySeat={seat}
            deal={dealRound !== null ? { round: dealRound, dealer: pub.dealer } : null}
          />
          </div>
        </div>
          {mascot && <TokskeCommentator pub={pub} names={game.seats.map((x) => x?.name ?? '')} mySeat={seat} training={mode === 'training'} />}

        <aside className="side">
          <div className="players">
            {order.map((c) => {
              const s = game.seats[c];
              const off = s && !s.bot && s.playerId && !online.has(s.playerId) && s.playerId !== me?.playerId;
              return (
                <div key={c} className={`pl ${pub.turn === c && pub.winner === null ? 'now' : ''}`} style={{ ['--c' as string]: COLOR_HEX[c] }}>
                  <span className="dot" />
                  <span className="pl-name">{s?.name ?? '—'}{seat === c && s?.name !== t.youCap ? ` (${t.you})` : ''}{off ? <em className="muted"> · {t.offline}</em> : null}</span>
                  <span className="pl-meta">
                    {pub.dealer === c && <span className="tag">{t.dealer}</span>}
                    <span title={t.cards}>🂠 {pub.handCounts[c]}</span>
                    {pub.sticks[c] > 0 && <span title={t.sticks}>| {pub.sticks[c]}</span>}
                  </span>
                </div>
              );
            })}
            <div className="muted small">{t.deck}: {pub.deckCount}</div>
          </div>

          <div className={`status ${myTurn ? 'mine' : ''}`}>
            {pub.winner === null && <strong>{myTurn ? t.yourTurn : t.turnOf(nameOf(pub.turn))}</strong>}
            {seat === null && <p className="small">{t.watching}</p>}
            {playingForPartner && <p className="small">{t.playingFor}</p>}
            {hint && <p className="hint">{hint}</p>}
            {msg && <p className="err">{msg}</p>}
            {myTurn && rank === '7' && seven.length > 0 && (
              <button className="btn small" onClick={() => setSeven(seven.slice(0, -1))}>{t.undo}</button>
            )}
          </div>

          {chatToken && me && <Chat gameId={game.id} code={game.code} token={chatToken} playerId={me.playerId} />}
          <div className="log">
            <h3>{t.log}</h3>
            <ol ref={logRef} onScroll={(e) => { const el = e.currentTarget; followLog.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
              {pub.log.map((e) => <li key={e.n} style={{ ['--c' as string]: COLOR_HEX[e.by] }}>{logLine(e)}</li>)}
            </ol>
          </div>
        </aside>
      </div>

      {seat !== null && (
        <div className="hand-bar">
          <div className="turn-strip">
            {msg && <p className="err">{msg}</p>}
            {myTurn && rank === '7' && seven.length > 0 && (
              <button className="btn small" onClick={() => setSeven(seven.slice(0, -1))}>{t.undo}</button>
            )}
          </div>
          <div className={`hand ${dealRound === pub.round ? 'dealing' : ''}`} key={`hand-${dealRound ?? 0}`} style={dealVars}>
            {hand.map((c) => (
              <CardFace key={c.id} card={c} lang={lang} selected={selCard === c.id} laid={false}
                dim={mode === 'training' && myTurn && !playable.has(c.id)} onClick={() => pickCard(c)} />
            ))}
            {hand.length === 0 && <span className="muted">—</span>}
          </div>
          {myTurn && !free && hand.length > 0 && (
            <div className="discard">
              {!showDiscard ? (
                <button className="btn ghost" onClick={() => {
                  if (seat !== null && handHasMove(pub.pieces, seat, hand)) { err('must_play'); return; }
                  setShowDiscard(true);
                }}>{t.cantPlay}</button>
              ) : (
                <>
                  <button className="btn" disabled={!card || busy} onClick={() => card && call({ op: 'act', action: { type: 'discardOne', card: card.id } })}>{t.discardOne}</button>
                  <button className="btn" disabled={busy} onClick={() => call({ op: 'act', action: { type: 'discardAll' } })}>{t.discardAll}</button>
                  <p className="small muted">{seat !== null && playedCardThisRound(pub, seat) ? t.discardAllNoStick : t.discardAllHelp}</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {pub.winner !== null && (
        <div className="overlay">
          <div className="panel narrow win">
            <h1 className="h-hand">{t.win(t.teamNames[pub.winner])}</h1>
            <div className="win-dots">
              {[pub.winner, pub.winner + 2].map((c) => <span key={c} className="dot big" style={{ ['--c' as string]: COLOR_HEX[c] }} />)}
            </div>
            {isHost && <button className="btn primary" onClick={() => call({ op: 'rematch' })}>{t.rematch}</button>}
          </div>
        </div>
      )}

      {showRules && (
        <div className="overlay" onClick={() => setShowRules(false)}>
          <div className="panel narrow rules" onClick={(e) => e.stopPropagation()}>
            <h2>{t.rules}</h2>
            <ul>{t.rulesText.map((r, i) => <li key={i}>{r}</li>)}</ul>
            <button className="btn" onClick={() => setShowRules(false)}>OK</button>
          </div>
        </div>
      )}
    </main>
  );
}

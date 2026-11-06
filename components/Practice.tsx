'use client';
// Oefenen: jij (geel) tegen/met 3 computers, volledig in je browser, zonder server.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { newGame, applyAction, publicView, RuleError, BOT_RATING, asLevel, type State, type Mode, type Action, type Color } from '@/lib/engine';
import { useT } from '@/lib/i18n';
import { getName, sb } from '@/lib/supabase';
import { Game, Shell, type GameRow } from './Room';
import LevelPicker from './LevelPicker';
import { moveDuration, dealDuration } from '@/lib/board';
import { getSpeed, getPracticeLevels, setPracticeLevels } from '@/lib/prefs';
import { currentUserId, expected, type RatingInfo } from '@/lib/rating';

const clone = (s: State): State => structuredClone(s);

// Trainingslogboek: elke zet (stand vóór de zet + gekozen actie) gaat in groepjes naar Supabase.
type LogRow = { move_no: number; round: number; seat: Color; is_bot: boolean; bot_level: number | null; player_name: string; action: Action; result: unknown; state_before: unknown };
type Levels = [number, number, number];
function logState(st: State) { const { log: _log, ...rest } = st; return structuredClone(rest); }

const BOTS = ['Robot Rik', 'Robot Roos', 'Robot Bert'];

export default function Practice({ mode }: { mode: Mode }) {
  const { t } = useT();
  const [st, setSt] = useState<State | null>(null);
  const [msg, setMsg] = useState('');
  const [myName, setMyName] = useState('');
  const [levels, setLevels] = useState<Levels | null>(null);
  const [started, setStarted] = useState(false);
  const [rating, setRating] = useState<RatingInfo | null>(null);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const levelsRef = useRef<Levels>([2, 3, 2]);
  const matchReady = useRef<Promise<boolean>>(Promise.resolve(false));
  const sessionId = useRef<string | null>(null);
  const resultRecorded = useRef(false);
  const pending = useRef(new Map<number, LogRow>());
  const inflight = useRef<Promise<unknown>[]>([]);
  const flush = useCallback(() => {
    const id = sessionId.current;
    if (!id || !pending.current.size) return;
    const rows = [...pending.current.values()];
    pending.current.clear();
    for (let i = 0; i < rows.length; i += 50) {
      inflight.current.push(Promise.resolve(sb().rpc('log_practice_moves', { p_game_id: id, p_mode: mode, p_rows: rows.slice(i, i + 50) }))
        .then(({ error }) => { if (error) console.warn('Zetten loggen mislukt', error.message); }));
    }
  }, [mode]);
  const record = (before: State, after: State, seat: Color, action: Action, bot: boolean, name: string) => {
    pending.current.set(before.moveNo, { move_no: before.moveNo, round: before.round, seat, is_bot: bot, bot_level: bot ? levelsRef.current[seat - 1] : null, player_name: name, action, result: after.last, state_before: logState(before) });
    if (pending.current.size >= 20 || after.winner !== null) flush();
  };
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flush); flush(); };
  }, [flush]);
  useEffect(() => {
    setMyName(getName());
    setLevels(getPracticeLevels());
    void currentUserId().then(async (uid) => {
      setUserId(uid);
      if (!uid) return;
      const { data } = await sb().from('profiles').select('rating').eq('user_id', uid).maybeSingle();
      if (data) setMyRating(data.rating);
    });
  }, []);

  const begin = useCallback((lv: Levels) => {
    flush();
    setPracticeLevels(lv);
    levelsRef.current = lv;
    const id = crypto.randomUUID();
    sessionId.current = id;
    resultRecorded.current = false;
    setRating(null);
    matchReady.current = userId
      ? Promise.resolve(sb().rpc('start_practice', { p_id: id, p_mode: mode, p_levels: lv })).then(({ error }) => {
        if (error) console.warn('Partij starten mislukt', error.message);
        return !error;
      })
      : Promise.resolve(false);
    setSt(newGame(mode));
    setStarted(true);
  }, [flush, mode, userId]);

  // bij een andere modus: terug naar het keuzescherm
  useEffect(() => { flush(); setStarted(false); setSt(null); }, [mode]);

  useEffect(() => {
    if (!st || st.winner === null || resultRecorded.current || !sessionId.current) return;
    resultRecorded.current = true;
    const id = sessionId.current;
    const winner = st.winner;
    void sb().rpc('record_training_game', { p_game_id: id, p_mode: mode })
      .then(({ error }) => { if (error) console.error('Trainingresultaat opslaan mislukt', error); });
    if (!userId) { setRating({ state: 'login' }); return; }
    setRating({ state: 'loading' });
    void (async () => {
      const ok = await matchReady.current;
      flush();
      await Promise.all(inflight.current.splice(0));
      if (!ok) { if (sessionId.current === id) setRating({ state: 'none' }); return; }
      const { data, error } = await sb().rpc('finish_practice', { p_id: id, p_winner: winner });
      if (sessionId.current !== id) return;
      const mine = Array.isArray(data) ? data.find((x: { seat: number }) => x.seat === 0) : null;
      if (error || !mine) { setRating({ state: 'none' }); return; }
      setRating({ state: 'done', before: mine.before, after: mine.after, delta: mine.delta });
      setMyRating(mine.after);
    })();
  }, [st, mode, userId, flush]);

  // computers spelen
  useEffect(() => {
    if (!st || st.winner !== null || st.turn === 0) return;
    // Bereken de computerzet buiten de UI-thread zodat klikken en chat soepel blijven.
    const worker = new Worker(new URL('../lib/bot.worker.ts', import.meta.url));
    const turn = st.turn;
    const moveNo = st.moveNo;
    // wacht tot de vorige zet uitgerold is (hangt af van de gekozen snelheid)
    const newDeal = st.log.length === 0 || st.log.at(-1)!.round !== st.round;
    const wait = Math.max(450, moveDuration(st.last, st.pieces, getSpeed()) + 220) + (newDeal ? dealDuration(getSpeed()) : 0);
    let tm: ReturnType<typeof setTimeout>;
    worker.onmessage = (event) => {
      if (!event.data.action) { setMsg(t.errors.server_error); return; }
      tm = setTimeout(() => {
        setSt((cur) => {
          if (!cur || cur.turn !== turn || cur.moveNo !== moveNo || cur.winner !== null) return cur;
          const n = clone(cur);
          applyAction(n, turn, event.data.action);
          record(cur, n, turn, event.data.action, true, BOTS[turn - 1] ?? 'Robot');
          return n;
        });
      }, wait);
    };
    worker.onerror = () => setMsg(t.errors.server_error);
    worker.postMessage({ state: st, level: levelsRef.current[turn - 1] });
    return () => { clearTimeout(tm); worker.terminate(); };
  }, [st]);

  const call = useCallback(async (body: Record<string, unknown>) => {
    setMsg('');
    if (body.op === 'rematch') {
      // terug naar het keuzescherm (met de vorige niveaus al ingevuld)
      flush();
      setStarted(false);
      setSt(null);
      return;
    }
    if (body.op !== 'act') return;
    setSt((cur) => {
      if (!cur) return cur;
      const n = clone(cur);
      try { applyAction(n, 0, body.action as Action); record(cur, n, 0, body.action as Action, false, myName || 'Jij'); return n; }
      catch (e) {
        if (e instanceof RuleError) setMsg(t.errors[e.message] ?? e.message);
        return cur;
      }
    });
  }, [mode, t, myName, flush]);

  // voor de automatische tests
  useEffect(() => { (window as unknown as { __tokken?: State | null }).__tokken = st; }, [st]);

  if (!started || !st) {
    if (!levels) return null;
    const names = [BOTS[0], BOTS[1], BOTS[2]];
    const roles = [t.opponentLeft, t.teammate, t.opponentRight];
    const me = myRating ?? 1000;
    const ours = (me + BOT_RATING[asLevel(levels[1])]) / 2;
    const theirs = (BOT_RATING[asLevel(levels[0])] + BOT_RATING[asLevel(levels[2])]) / 2;
    const chance = Math.round(expected(ours, theirs) * 100);
    // tonen in tafelvolgorde: ploegmaat eerst, dan de tegenstanders
    const order = [1, 0, 2];
    return (
      <Shell>
        <section className="panel narrow practice-setup">
          <h1 className="h-hand">{t.practiceSetup}</h1>
          <p className="muted small">{t.modes[mode]} · {t.practiceSetupHelp}</p>
          <div className="setup-rows">
            {order.map((i) => (
              <label key={i} className={`setup-row ${i === 1 ? 'mate' : 'opp'}`}>
                <span><strong>{roles[i]}</strong><span className="muted small">{names[i]}</span></span>
                <LevelPicker label={roles[i]} value={levels[i]} onChange={(l) => {
                  const n = [...levels] as Levels; n[i] = l; setLevels(n);
                }} />
              </label>
            ))}
          </div>
          <p className="small">
            {userId ? <>{t.yourRating}: <strong>{me}</strong> · </> : null}
            {t.winChance}: <strong>{chance}%</strong>
          </p>
          {!userId && <p className="muted small">{t.ratingLogin} <Link href="/">{t.loginGoogle}</Link></p>}
          <button className="btn primary big" onClick={() => begin(levels)}>{t.startPractice}</button>
        </section>
      </Shell>
    );
  }
  const lv = levelsRef.current;
  const game: GameRow = {
    id: 'local', code: t.practiceCode, status: st.winner !== null ? 'finished' : 'playing', mode, host_player: 'me',
    players: [{ id: 'me', name: myName || t.you }],
    seats: [
      { playerId: 'me', name: myName || t.youCap, bot: false },
      ...BOTS.map((name, i) => ({ playerId: null, name, bot: true, level: lv[i] })),
    ],
    state: publicView(st), version: st.moveNo,
  };
  return (
    <Game game={game} pub={game.state!} me={{ playerId: 'me', seat: 0, hand: st.hands[0], version: st.moveNo }}
      isHost online={new Set(['me'])} call={call} busy={false} msg={msg} setMsg={setMsg} mascot
      rating={rating} rematchLabel={t.rematch} />
  );
}

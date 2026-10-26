'use client';
// Oefenen: jij (geel) tegen/met 3 computers, volledig in je browser, zonder server.
import { useCallback, useEffect, useRef, useState } from 'react';
import { newGame, applyAction, publicView, RuleError, type State, type Mode, type Action, type Color } from '@/lib/engine';
import { useT } from '@/lib/i18n';
import { getName, sb } from '@/lib/supabase';
import { Game, type GameRow } from './Room';
import { moveDuration } from '@/lib/board';
import { getSpeed } from '@/lib/prefs';

const clone = (s: State): State => structuredClone(s);

// Trainingslogboek: elke zet (stand vóór de zet + gekozen actie) gaat in groepjes naar Supabase.
type LogRow = { move_no: number; round: number; seat: Color; is_bot: boolean; player_name: string; action: Action; result: unknown; state_before: unknown };
function logState(st: State) { const { log: _log, ...rest } = st; return structuredClone(rest); }

const BOTS = ['Robot Rik', 'Robot Roos', 'Robot Bert'];

export default function Practice({ mode }: { mode: Mode }) {
  const { t } = useT();
  const [st, setSt] = useState<State | null>(null);
  const [msg, setMsg] = useState('');
  const [myName, setMyName] = useState('');
  const sessionId = useRef<string | null>(null);
  const resultRecorded = useRef(false);
  const pending = useRef(new Map<number, LogRow>());
  const flush = useCallback(() => {
    const id = sessionId.current;
    if (!id || !pending.current.size) return;
    const rows = [...pending.current.values()];
    pending.current.clear();
    for (let i = 0; i < rows.length; i += 50) {
      void sb().rpc('log_practice_moves', { p_game_id: id, p_mode: mode, p_rows: rows.slice(i, i + 50) })
        .then(({ error }) => { if (error) console.warn('Zetten loggen mislukt', error.message); });
    }
  }, [mode]);
  const record = (before: State, after: State, seat: Color, action: Action, bot: boolean, name: string) => {
    pending.current.set(before.moveNo, { move_no: before.moveNo, round: before.round, seat, is_bot: bot, player_name: name, action, result: after.last, state_before: logState(before) });
    if (pending.current.size >= 20 || after.winner !== null) flush();
  };
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flush); flush(); };
  }, [flush]);
  useEffect(() => { setMyName(getName()); }, []);

  useEffect(() => {
    flush();
    sessionId.current = crypto.randomUUID();
    resultRecorded.current = false;
    setSt(newGame(mode));
  }, [mode]);

  useEffect(() => {
    if (!st || st.winner === null || resultRecorded.current || !sessionId.current) return;
    resultRecorded.current = true;
    void sb().rpc('record_training_game', { p_game_id: sessionId.current, p_mode: mode })
      .then(({ error }) => { if (error) console.error('Trainingresultaat opslaan mislukt', error); });
  }, [st, mode]);

  // computers spelen
  useEffect(() => {
    if (!st || st.winner !== null || st.turn === 0) return;
    // Bereken de computerzet buiten de UI-thread zodat klikken en chat soepel blijven.
    const worker = new Worker(new URL('../lib/bot.worker.ts', import.meta.url));
    const turn = st.turn;
    const moveNo = st.moveNo;
    // wacht tot de vorige zet uitgerold is (hangt af van de gekozen snelheid)
    const wait = Math.max(450, moveDuration(st.last, st.pieces, getSpeed()) + 220);
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
    worker.postMessage(st);
    return () => { clearTimeout(tm); worker.terminate(); };
  }, [st]);

  const call = useCallback(async (body: Record<string, unknown>) => {
    setMsg('');
    if (body.op === 'rematch') {
      flush();
      sessionId.current = crypto.randomUUID();
      resultRecorded.current = false;
      setSt(newGame(mode));
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

  if (!st) return null;
  const game: GameRow = {
    id: 'local', code: t.practiceCode, status: st.winner !== null ? 'finished' : 'playing', mode, host_player: 'me',
    players: [{ id: 'me', name: myName || t.you }],
    seats: [
      { playerId: 'me', name: myName || t.youCap, bot: false },
      ...BOTS.map((name) => ({ playerId: null, name, bot: true })),
    ],
    state: publicView(st), version: st.moveNo,
  };
  return (
    <Game game={game} pub={game.state!} me={{ playerId: 'me', seat: 0, hand: st.hands[0], version: st.moveNo }}
      isHost online={new Set(['me'])} call={call} busy={false} msg={msg} setMsg={setMsg} mascot />
  );
}

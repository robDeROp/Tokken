'use client';
// Oefenen: jij (geel) tegen/met 3 computers, volledig in je browser, zonder server.
import { useCallback, useEffect, useRef, useState } from 'react';
import { newGame, applyAction, botAction, publicView, RuleError, type State, type Mode, type Action } from '@/lib/engine';
import { useT } from '@/lib/i18n';
import { getName, sb } from '@/lib/supabase';
import { Game, type GameRow } from './Room';

const clone = (s: State): State => structuredClone(s);

export default function Practice({ mode }: { mode: Mode }) {
  const { t } = useT();
  const [st, setSt] = useState<State | null>(null);
  const [msg, setMsg] = useState('');
  const [myName, setMyName] = useState('');
  const sessionId = useRef<string | null>(null);
  const resultRecorded = useRef(false);
  useEffect(() => { setMyName(getName()); }, []);

  useEffect(() => {
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
    let tm: ReturnType<typeof setTimeout>;
    worker.onmessage = (event) => {
      if (!event.data.action) { setMsg(t.errors.server_error); return; }
      tm = setTimeout(() => {
        setSt((cur) => {
          if (!cur || cur.turn !== turn || cur.moveNo !== moveNo || cur.winner !== null) return cur;
          const n = clone(cur);
          applyAction(n, turn, event.data.action);
          return n;
        });
      }, 450);
    };
    worker.onerror = () => setMsg(t.errors.server_error);
    worker.postMessage(st);
    return () => { clearTimeout(tm); worker.terminate(); };
  }, [st]);

  const call = useCallback(async (body: Record<string, unknown>) => {
    setMsg('');
    if (body.op === 'rematch') {
      sessionId.current = crypto.randomUUID();
      resultRecorded.current = false;
      setSt(newGame(mode));
      return;
    }
    if (body.op !== 'act') return;
    setSt((cur) => {
      if (!cur) return cur;
      const n = clone(cur);
      try { applyAction(n, 0, body.action as Action); return n; }
      catch (e) {
        if (e instanceof RuleError) setMsg(t.errors[e.message] ?? e.message);
        return cur;
      }
    });
  }, [mode, t]);

  // voor de automatische tests
  useEffect(() => { (window as unknown as { __tokken?: State | null }).__tokken = st; }, [st]);

  if (!st) return null;
  const game: GameRow = {
    id: 'local', code: t.practiceCode, status: st.winner !== null ? 'finished' : 'playing', mode, host_player: 'me',
    players: [{ id: 'me', name: myName || t.you }],
    seats: [
      { playerId: 'me', name: myName || t.youCap, bot: false },
      { playerId: null, name: 'Robot Rik', bot: true },
      { playerId: null, name: 'Robot Roos', bot: true },
      { playerId: null, name: 'Robot Bert', bot: true },
    ],
    state: publicView(st), version: st.moveNo,
  };
  return (
    <Game game={game} pub={game.state!} me={{ playerId: 'me', seat: 0, hand: st.hands[0], version: st.moveNo }}
      isHost online={new Set(['me'])} call={call} busy={false} msg={msg} setMsg={setMsg} />
  );
}

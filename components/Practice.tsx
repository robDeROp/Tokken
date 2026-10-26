'use client';
// Oefenen: jij (geel) tegen/met 3 computers, volledig in je browser, zonder server.
import { useCallback, useEffect, useRef, useState } from 'react';
import { newGame, applyAction, botAction, publicView, RuleError, type State, type Mode, type Action } from '@/lib/engine';
import { useT } from '@/lib/i18n';
import { getName, api } from '@/lib/supabase';
import { Game, type GameRow } from './Room';

const clone = (s: State): State => structuredClone(s);

export default function Practice({ mode }: { mode: Mode }) {
  const { t } = useT();
  const [st, setSt] = useState<State | null>(null);
  const [msg, setMsg] = useState('');
  const [myName, setMyName] = useState('');
  useEffect(() => { setMyName(getName()); }, []);

  useEffect(() => { setSt(newGame(mode)); }, [mode]);

  // computers spelen
  useEffect(() => {
    if (!st || st.winner !== null || st.turn === 0) return;
    const tm = setTimeout(() => {
      setSt((cur) => {
        if (!cur || cur.turn === 0 || cur.winner !== null) return cur;
        const n = clone(cur);
        const a = botAction(n, n.turn);
        if (a.type === 'play' && n.mode !== 'training') applyAction(n, n.turn, { type: 'lay', card: a.card });
        applyAction(n, n.turn, a);
        return n;
      });
    }, 700);
    return () => clearTimeout(tm);
  }, [st]);

  const call = useCallback(async (body: Record<string, unknown>) => {
    setMsg('');
    if (body.op === 'rematch') { setSt(newGame(mode)); return; }
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

  // bijhouden: oefenspel gestart / gedaan (fouten negeren, oefenen werkt ook zonder server)
  const startedRef = useRef<State | null>(null);
  const finishedRef = useRef<State | null>(null);
  const firstRef = useRef<State | null>(null);
  useEffect(() => {
    if (!st) return;
    if (st.moveNo === 0 && startedRef.current !== st) {
      startedRef.current = st;
      api({ op: 'track', type: 'practice_started', name: myName || null, data: { mode } }).catch(() => {});
    }
    if (!firstRef.current || st.moveNo === 0) firstRef.current = st;
    if (st.winner !== null && finishedRef.current !== firstRef.current) {
      finishedRef.current = firstRef.current;
      api({ op: 'track', type: 'practice_finished', name: myName || null, data: { mode, won: st.winner === 0, rounds: st.round } }).catch(() => {});
    }
  }, [st, mode, myName]);

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

// Tokken server: alle spelacties lopen via deze functie, zodat niemand kan valsspelen
// of andermans kaarten kan zien. De regels zelf staan in engine.ts (gedeeld met de website).
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  newGame, applyAction, botAction, publicView, RuleError,
  type Action, type Color, type Mode, type State,
} from './engine.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

type Seat = { playerId: string | null; name: string; bot: boolean } | null;
type Player = { id: string; name: string };
interface GameRow {
  id: string; code: string; status: string; mode: Mode; host_player: string;
  players: Player[]; seats: Seat[]; state: unknown; version: number;
}
interface SecretRow { game_id: string; tokens: Record<string, string>; full_state: State | null }

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const rid = (n = 24) => {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, n);
};
const rng = () => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
};
function makeCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += abc[Math.floor(rng() * abc.length)];
  return s;
}
const cleanName = (n: unknown) => String(n ?? '').trim().slice(0, 20) || 'Speler';
const BOT_NAMES = ['Robot Rik', 'Robot Roos', 'Robot Bert', 'Robot Fien'];

async function load(code: string): Promise<{ g: GameRow; s: SecretRow }> {
  const { data: g } = await db.from('games').select('*').eq('code', String(code).toUpperCase()).maybeSingle();
  if (!g) throw new HttpError(404, 'room_not_found');
  const { data: s } = await db.from('game_secrets').select('*').eq('game_id', g.id).single();
  return { g: g as GameRow, s: s as SecretRow };
}

function who(s: SecretRow, token: unknown): string {
  const pid = s.tokens[String(token ?? '')];
  if (!pid) throw new HttpError(403, 'not_in_room');
  return pid;
}

const NOOP = Symbol('noop');

/** Schrijf terug met versiecontrole; bij een botsing opnieuw proberen. */
async function mutate(code: string, fn: (g: GameRow, s: SecretRow) => unknown | Promise<unknown>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { g, s } = await load(code);
    const before = g.version;
    const result = await fn(g, s);
    if (result === NOOP) return result;
    // games + game_secrets worden samen (in één transactie) bewaard
    const { data, error } = await db.rpc('save_game', {
      p_id: g.id, p_version: before, p_status: g.status, p_mode: g.mode, p_players: g.players,
      p_seats: g.seats, p_state: g.state, p_tokens: s.tokens, p_full: s.full_state,
    });
    if (error) throw error;
    if (data === true) return result;
  }
  throw new HttpError(409, 'busy');
}

function seatOf(g: GameRow, pid: string): Color | null {
  const i = g.seats.findIndex((x) => x && x.playerId === pid);
  return i < 0 ? null : (i as Color);
}

async function userFromAuth(req: Request) {
  const h = req.headers.get('Authorization') ?? '';
  const token = h.replace(/^Bearer\s+/i, '');
  if (!token || token.split('.').length !== 3) return null;
  const { data } = await db.auth.getUser(token);
  return data.user ?? null;
}

type AuthUser = { id: string; email?: string; user_metadata?: Record<string, unknown> } | null;

/** Aanmelden verplicht? (app_config.require_login) */
async function requireUser(req: Request): Promise<AuthUser> {
  const user = await userFromAuth(req);
  const { data: cfg } = await db.from('app_config').select('value').eq('key', 'require_login').maybeSingle();
  if (cfg?.value === true && !user) throw new HttpError(401, 'login_required');
  return user;
}

/** Bijhouden wat er gebeurt (tabel events). Fouten hier mogen het spel nooit breken. */
async function track(type: string, code: string | null, user: AuthUser, name: string | null, data: Record<string, unknown> = {}) {
  try {
    await db.from('events').insert({
      type, code, user_id: user?.id ?? null, email: user?.email ?? null,
      name: name ?? (user?.user_metadata?.full_name as string | undefined) ?? null, data,
    });
  } catch (e) { console.error('track', e); }
}

const PRACTICE_EVENTS = ['practice_started', 'practice_finished'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json();
    const op = String(body.op);
    const code = String(body.code ?? '').toUpperCase();

    if (op === 'create') {
      const user = await requireUser(req);
      const name = cleanName(body.name ?? user?.user_metadata?.full_name);
      const playerId = rid(10);
      const token = rid(32);
      let newCode = '';
      for (let i = 0; i < 6; i++) {
        newCode = makeCode();
        const { data: ex } = await db.from('games').select('id').eq('code', newCode).maybeSingle();
        if (!ex) break;
      }
      const mode: Mode = ['training', 'hulp', 'pro'].includes(body.mode) ? body.mode : 'training';
      const { data: g, error } = await db.from('games').insert({
        code: newCode, mode, host_player: playerId, players: [{ id: playerId, name }],
      }).select('id').single();
      if (error) throw error;
      await db.from('game_secrets').insert({ game_id: g.id, tokens: { [token]: playerId }, host_user: user?.id ?? null });
      await track('room_created', newCode, user, name, { mode });
      return json({ code: newCode, token, playerId });
    }

    if (op === 'track') {
      const user = await requireUser(req);
      const type = String(body.type);
      if (!PRACTICE_EVENTS.includes(type)) throw new HttpError(400, 'bad_event');
      const data = typeof body.data === 'object' && body.data ? body.data : {};
      await track(type, null, user, cleanName(body.name ?? user?.user_metadata?.full_name), data);
      return json({ ok: true });
    }

    if (op === 'join') {
      const user = await requireUser(req);
      const name = cleanName(body.name ?? user?.user_metadata?.full_name);
      const playerId = rid(10);
      const token = rid(32);
      await mutate(code, (g, s) => {
        if (g.players.length >= 12) throw new HttpError(400, 'room_full');
        g.players.push({ id: playerId, name });
        s.tokens[token] = playerId;
      });
      await track('room_joined', code, user, name);
      return json({ code, token, playerId });
    }

    if (op === 'me') {
      const { g, s } = await load(code);
      const pid = who(s, body.token);
      const seat = seatOf(g, pid);
      const hand = seat !== null && s.full_state ? s.full_state.hands[seat] : [];
      return json({ playerId: pid, seat, hand, version: g.version });
    }

    if (op === 'chat') {
      const { g, s } = await load(code);
      const pid = who(s, body.token);
      const text = String(body.text ?? '').trim().slice(0, 300);
      if (!text) throw new HttpError(400, 'empty');
      const seat = seatOf(g, pid);
      const name = g.players.find((x) => x.id === pid)?.name ?? 'Speler';
      const { error } = await db.from('chat_messages').insert({ code, player_id: pid, name, color: seat, text });
      if (error) throw error;
      return json({ ok: true });
    }

    if (op === 'rename') {
      await mutate(code, (g, s) => {
        const pid = who(s, body.token);
        const name = cleanName(body.name);
        const p = g.players.find((x) => x.id === pid);
        if (p) p.name = name;
        for (const seat of g.seats) if (seat && seat.playerId === pid) seat.name = name;
      });
      return json({ ok: true });
    }

    let started: Record<string, unknown> | null = null;
    if (op === 'sit' || op === 'stand' || op === 'addBot' || op === 'removeBot' || op === 'setMode' || op === 'start' || op === 'rematch') {
      await mutate(code, (g, s) => {
        const pid = who(s, body.token);
        const isHost = pid === g.host_player;
        const seat = Number(body.seat);
        const validSeat = Number.isInteger(seat) && seat >= 0 && seat < 4;
        if (op === 'rematch') {
          if (!isHost) throw new HttpError(403, 'host_only');
          g.status = 'lobby'; g.state = null; s.full_state = null;
          return;
        }
        if (g.status !== 'lobby') throw new HttpError(400, 'already_started');
        if (op === 'sit') {
          if (!validSeat) throw new HttpError(400, 'bad_seat');
          if (g.seats[seat] && g.seats[seat]!.playerId !== pid) throw new HttpError(400, 'seat_taken');
          const name = g.players.find((p) => p.id === pid)?.name ?? 'Speler';
          g.seats = g.seats.map((x) => (x && x.playerId === pid ? null : x));
          g.seats[seat] = { playerId: pid, name, bot: false };
        } else if (op === 'stand') {
          g.seats = g.seats.map((x) => (x && x.playerId === pid ? null : x));
        } else if (op === 'addBot') {
          if (!validSeat || g.seats[seat]) throw new HttpError(400, 'bad_seat');
          g.seats[seat] = { playerId: null, name: BOT_NAMES[seat], bot: true };
        } else if (op === 'removeBot') {
          if (!validSeat || !g.seats[seat]?.bot) throw new HttpError(400, 'bad_seat');
          g.seats[seat] = null;
        } else if (op === 'setMode') {
          if (!isHost) throw new HttpError(403, 'host_only');
          if (!['training', 'hulp', 'pro'].includes(body.mode)) throw new HttpError(400, 'bad_mode');
          g.mode = body.mode;
        } else if (op === 'start') {
          if (!isHost) throw new HttpError(403, 'host_only');
          if (g.seats.some((x) => !x)) throw new HttpError(400, 'need_four');
          const st = newGame(g.mode, rng);
          s.full_state = st;
          g.state = publicView(st);
          g.status = 'playing';
          started = { mode: g.mode, players: g.seats.map((x) => (x?.bot ? 'computer' : x?.name)) };
        }
      });
      if (started) await track('game_started', code, await userFromAuth(req), null, started);
      return json({ ok: true });
    }

    let finished: Record<string, unknown> | null = null;
    if (op === 'act' || op === 'botStep') {
      await mutate(code, (g, s) => {
        if (g.status !== 'playing' || !s.full_state) throw new HttpError(400, 'not_playing');
        const st = s.full_state;
        let seat: Color;
        let action: Action;
        if (op === 'act') {
          const pid = who(s, body.token);
          const me = seatOf(g, pid);
          if (me === null) throw new HttpError(403, 'not_seated');
          seat = me;
          action = body.action as Action;
        } else {
          who(s, body.token); // enkel mensen in de kamer mogen de computer laten spelen
          seat = st.turn;
          // al gespeeld door iemand anders? (meerdere browsers kunnen tegelijk vragen)
          if (Number(body.version) !== g.version || !g.seats[seat]?.bot || st.winner !== null) return NOOP;
          action = botAction(st, seat, rng);
          if (action.type === 'play' && st.mode !== 'training') applyAction(st, seat, { type: 'lay', card: action.card });
        }
        try {
          applyAction(st, seat, action);
        } catch (e) {
          if (e instanceof RuleError) throw new HttpError(400, e.message);
          throw e;
        }
        g.state = publicView(st);
        if (st.winner !== null) {
          g.status = 'finished';
          finished = {
            winner: st.winner === 0 ? 'geel+oranje' : 'blauw+groen', rounds: st.round, moves: st.moveNo, mode: st.mode,
            players: g.seats.map((x) => (x?.bot ? 'computer' : x?.name)),
          };
        }
      });
      if (finished) await track('game_finished', code, null, null, finished);
      return json({ ok: true });
    }

    throw new HttpError(400, 'bad_op');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'server_error' }, 500);
  }
});

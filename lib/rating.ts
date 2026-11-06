'use client';
import { useEffect, useState } from 'react';
import { sb } from './supabase';
import { BOT_RATING, type BotLevel } from './engine';

export type RatingInfo =
  | { state: 'loading' }
  | { state: 'login' }          // niet aangemeld: geen rating
  | { state: 'none'; reason?: string } // telde niet mee (te kort, fout, …)
  | { state: 'done'; before: number; after: number; delta: number; homeMe?: number; homeMate?: number; base?: number };

/** Verwachte winstkans van ploeg A tegen ploeg B (Elo). */
export const expected = (a: number, b: number) => 1 / (1 + Math.pow(10, (b - a) / 400));

export async function currentUserId(): Promise<string | null> {
  const { data } = await sb().auth.getSession();
  return data.session?.user.id ?? null;
}

/** Na een online spel: wacht op de rating-aanpassing die de server voor dit spel schreef. */
export async function waitForOnlineRating(gameId: string, userId: string, since: number): Promise<RatingInfo> {
  for (let i = 0; i < 6; i++) {
    const { data } = await sb().from('rating_history').select('rating_before, rating_after, delta, at, match_id, home_me, home_mate')
      .eq('user_id', userId).like('match_id', `online:${gameId}:%`).order('at', { ascending: false }).limit(1);
    const row = data?.[0];
    if (row && new Date(row.at).getTime() >= since - 60_000) return { state: 'done', before: row.rating_before, after: row.rating_after, delta: row.delta, homeMe: row.home_me ?? undefined, homeMate: row.home_mate ?? undefined };
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { state: 'none' };
}

// ---------- ratings van de computers (schuiven mee met spellen tegen mensen) ----------

let cache: Record<number, number> | null = null;
let loading: Promise<Record<number, number>> | null = null;
const listeners = new Set<(r: Record<number, number>) => void>();

function loadBotRatings(): Promise<Record<number, number>> {
  if (cache) return Promise.resolve(cache);
  if (!loading) {
    loading = Promise.resolve(sb().from('bot_ratings').select('level, rating')).then(({ data }) => {
      const r: Record<number, number> = { ...BOT_RATING };
      for (const row of (data ?? []) as { level: number; rating: number }[]) r[row.level] = row.rating;
      cache = r;
      listeners.forEach((l) => l(r));
      return r;
    }).catch(() => ({ ...BOT_RATING }));
  }
  return loading;
}

/** Actuele rating per bot-niveau (eerst de vaste startwaarden, dan die uit de database). */
export function useBotRatings(): Record<BotLevel, number> {
  const [r, setR] = useState<Record<number, number>>(cache ?? BOT_RATING);
  useEffect(() => {
    listeners.add(setR);
    void loadBotRatings().then(setR);
    return () => { listeners.delete(setR); };
  }, []);
  return r as Record<BotLevel, number>;
}

'use client';
import { sb } from './supabase';

export type RatingInfo =
  | { state: 'loading' }
  | { state: 'login' }          // niet aangemeld: geen rating
  | { state: 'none'; reason?: string } // telde niet mee (te kort, fout, …)
  | { state: 'done'; before: number; after: number; delta: number };

/** Verwachte winstkans van ploeg A tegen ploeg B (Elo). */
export const expected = (a: number, b: number) => 1 / (1 + Math.pow(10, (b - a) / 400));

export async function currentUserId(): Promise<string | null> {
  const { data } = await sb().auth.getSession();
  return data.session?.user.id ?? null;
}

/** Na een online spel: wacht op de rating-aanpassing die de server voor dit spel schreef. */
export async function waitForOnlineRating(gameId: string, userId: string, since: number): Promise<RatingInfo> {
  for (let i = 0; i < 6; i++) {
    const { data } = await sb().from('rating_history').select('rating_before, rating_after, delta, at, match_id')
      .eq('user_id', userId).like('match_id', `online:${gameId}:%`).order('at', { ascending: false }).limit(1);
    const row = data?.[0];
    if (row && new Date(row.at).getTime() >= since - 60_000) return { state: 'done', before: row.rating_before, after: row.rating_after, delta: row.delta };
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { state: 'none' };
}

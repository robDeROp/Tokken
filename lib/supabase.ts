'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Publieke waarden (geen geheimen): de beveiliging zit in de server-functie en de database-regels.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qxafpwxnwcumljwzweyt.supabase.co';
const KEY_PUBLIC = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_UshXYwP2rwjJOAlhRR5NZg_G-lnZM3m';

let client: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (!client) {
    client = createClient(URL, KEY_PUBLIC, {
      auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' },
    });
  }
  return client;
}

export class ApiError extends Error {}

/** Roept de server-functie "game" aan. */
export async function api<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data: sess } = await sb().auth.getSession();
  const headers: Record<string, string> = {};
  if (sess.session) headers.Authorization = `Bearer ${sess.session.access_token}`;
  const { data, error } = await sb().functions.invoke('game', { body, headers });
  if (error) {
    let code = 'server_error';
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) code = (await ctx.json()).error ?? code;
    } catch { /* ignore */ }
    throw new ApiError(code);
  }
  return data as T;
}

const KEY = (code: string) => `tokken:${code.toUpperCase()}`;
export function getToken(code: string): string | null {
  try { return localStorage.getItem(KEY(code)); } catch { return null; }
}
export function setToken(code: string, token: string) {
  try { localStorage.setItem(KEY(code), token); } catch { /* ignore */ }
}
export function getName(): string {
  try { return localStorage.getItem('tokken:name') ?? ''; } catch { return ''; }
}
export function setName(n: string) {
  try { localStorage.setItem('tokken:name', n); } catch { /* ignore */ }
}

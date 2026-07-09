import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare global {
  interface Window {
    __BB_SUPABASE__?: { url: string; anonKey: string };
  }
}

let client: SupabaseClient | null = null;

/** True when a Supabase URL + anon key are configured in public/config.js. */
export function isCollabConfigured(): boolean {
  const c = window.__BB_SUPABASE__;
  return !!(c && c.url && c.anonKey);
}

/** Lazily create (and cache) the Supabase client, or null if not configured. */
export function getSupabase(): SupabaseClient | null {
  if (!isCollabConfigured()) return null;
  if (!client) {
    const c = window.__BB_SUPABASE__!;
    client = createClient(c.url, c.anonKey, {
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return client;
}

/** A stable per-tab id used for presence. */
export const SESSION_ID = Math.random().toString(36).slice(2, 10);

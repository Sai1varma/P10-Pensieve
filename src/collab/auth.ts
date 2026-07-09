import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

export type { Session };

/** Current auth session, or null (not signed in / not configured). */
export async function getSession(): Promise<Session | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

/** Subscribe to auth changes. Returns an unsubscribe function. */
export function onAuthChange(cb: (s: Session | null) => void): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

/** Send a passwordless magic-link to the given email. */
export async function sendMagicLink(email: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Collaboration is not configured.");
  const emailRedirectTo = window.location.origin + window.location.pathname + window.location.search;
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo } });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut();
}

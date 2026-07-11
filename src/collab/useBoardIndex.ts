import { useCallback, useEffect, useState } from "react";
import { useBoard } from "../board/store";
import type { BoardIndexEntry, BoardKind } from "../board/types";
import { getSupabase } from "./supabase";
import { getSession, onAuthChange, type Session } from "./auth";

interface Row {
  id: string;
  name: string | null;
  updated_at: string;
  owner_email: string | null;
  kind: string | null;
  is_public: boolean | null;
}

/**
 * Cloud-synced board list: fetches the signed-in user's own boards (rows
 * they own, by owner_email) and merges them into the local switcher index
 * via the store's setBoardsFromRemote, so the same board list follows a
 * user across devices. Fetch-on-sign-in plus a manual refresh() -- no
 * realtime subscription, matching ActivityLogPanel's "occasional glance"
 * convention rather than opening a second permanent channel just for
 * board-list metadata.
 */
export function useBoardIndex(): { refresh: () => void } {
  const { setBoardsFromRemote } = useBoard();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let mounted = true;
    getSession().then((s) => mounted && setSession(s));
    const off = onAuthChange((s) => setSession(s));
    return () => {
      mounted = false;
      off();
    };
  }, []);

  const refresh = useCallback(() => {
    const sb = getSupabase();
    const email = session?.user.email;
    if (!sb || !email) return;
    sb.from("boards")
      .select("id, name, updated_at, owner_email, is_public, kind:data->>kind")
      .eq("owner_email", email)
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (error || !data) return;
        const entries: BoardIndexEntry[] = (data as unknown as Row[]).map((r) => ({
          id: r.id,
          name: r.name ?? "Board",
          manualName: false,
          createdAt: r.updated_at,
          updatedAt: r.updated_at,
          cloudStatus: "live",
          ownerEmail: r.owner_email,
          kind: (r.kind as BoardKind | null) ?? "tree",
          isPublic: r.is_public ?? false,
        }));
        setBoardsFromRemote(entries);
      });
  }, [session, setBoardsFromRemote]);

  // Fetch once as soon as a session appears (covers sign-in and page load
  // while already signed in).
  useEffect(() => {
    if (session?.user.email) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.email]);

  return { refresh };
}

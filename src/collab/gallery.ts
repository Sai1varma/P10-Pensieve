import { useCallback, useEffect, useState } from "react";
import type { BoardKind, ID } from "../board/types";
import { getSupabase } from "./supabase";
import { getSession, onAuthChange, type Session } from "./auth";

/** One row in the org-wide gallery -- deliberately not a BoardIndexEntry:
 *  this is a separate browsable list of *other* people's published boards,
 *  not part of the local switcher index (see useBoardIndex.ts for that). */
export interface GalleryEntry {
  id: ID;
  name: string;
  updatedAt: string;
  ownerEmail: string | null;
  kind: BoardKind;
}

interface Row {
  id: string;
  name: string | null;
  updated_at: string;
  owner_email: string | null;
  kind: string | null;
}

/**
 * Org-wide gallery of boards published via is_public (item 9). Fetch on
 * sign-in plus a manual refresh(), same "occasional glance" convention as
 * useBoardIndex/ActivityLogPanel -- no realtime subscription.
 */
export function useGallery(): {
  entries: GalleryEntry[];
  loading: boolean;
  signedIn: boolean;
  refresh: () => void;
} {
  const [session, setSession] = useState<Session | null>(null);
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [loading, setLoading] = useState(false);

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
    setLoading(true);
    sb.from("boards")
      .select("id, name, updated_at, owner_email, kind:data->>kind")
      .eq("is_public", true)
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        setLoading(false);
        if (error || !data) return;
        setEntries(
          (data as unknown as Row[]).map((r) => ({
            id: r.id,
            name: r.name ?? "Board",
            updatedAt: r.updated_at,
            ownerEmail: r.owner_email,
            kind: (r.kind as BoardKind | null) ?? "tree",
          }))
        );
      });
  }, [session]);

  useEffect(() => {
    if (session?.user.email) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.email]);

  return { entries, loading, signedIn: !!session, refresh };
}

/** Toggle a board's gallery visibility. Caller is responsible for reflecting
 *  the result into the local index (store's markBoardIsPublic) on success. */
export async function setBoardPublic(id: ID, isPublic: boolean): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb.from("boards").update({ is_public: isPublic }).eq("id", id);
  return !error;
}

/** Fetch a gallery board's full content for duplicating into the caller's
 *  own local board list (see BoardSwitcher/GalleryPanel's "Duplicate"). */
export async function fetchBoardContent(id: ID): Promise<unknown | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from("boards").select("data").eq("id", id).single();
  if (error || !data) return null;
  return data.data;
}

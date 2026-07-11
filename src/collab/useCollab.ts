import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useBoard } from "../board/store";
import { ME_KEY, type Board } from "../board/types";
import { getSupabase, isCollabConfigured, SESSION_ID } from "./supabase";
import { getSession, onAuthChange, signOut as authSignOut, type Session } from "./auth";

export type CollabStatus = "off" | "local" | "needs-auth" | "connecting" | "live" | "error";

export interface CollabState {
  status: CollabStatus;
  peers: number;
  peerNames: string[];
  boardId: string | null;
  email: string | null;
  goLive: () => Promise<void>;
  leave: () => void;
  signOut: () => Promise<void>;
}

function boardIdFromUrl(): string | null {
  return new URLSearchParams(location.search).get("board");
}

/**
 * Live collaboration over Supabase, gated by magic-link auth (RLS requires an
 * authenticated user). Whole-board last-write-wins with presence. Completely
 * inert (status "off"/"local") when Supabase isn't configured; local editing
 * never requires a login.
 */
export function useCollab(): CollabState {
  const { board, applyRemoteBoard } = useBoard();
  const [boardId, setBoardId] = useState<string | null>(boardIdFromUrl);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<CollabStatus>(
    isCollabConfigured() ? (boardIdFromUrl() ? "connecting" : "local") : "off"
  );
  const [peers, setPeers] = useState(0);
  const [peerNames, setPeerNames] = useState<string[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastRemoteRef = useRef<string | null>(null); // updated_at we last applied
  const skipUpsertRef = useRef(false); // don't re-upload a change we just imported
  const saveTimer = useRef<number | null>(null);

  // Track the auth session.
  useEffect(() => {
    let mounted = true;
    getSession().then((s) => mounted && setSession(s));
    const off = onAuthChange((s) => setSession(s));
    return () => {
      mounted = false;
      off();
    };
  }, []);

  // Connect / disconnect when the target board id or session changes.
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !boardId) return;
    if (!session) {
      setStatus("needs-auth"); // shared board requested but not signed in
      return;
    }

    let cancelled = false;
    setStatus("connecting");

    (async () => {
      const { data, error } = await sb
        .from("boards")
        .select("data, updated_at")
        .eq("id", boardId)
        .single();
      if (cancelled) return;
      if (error) {
        setStatus("error");
        return;
      }
      if (data?.data) {
        skipUpsertRef.current = true;
        lastRemoteRef.current = data.updated_at;
        applyRemoteBoard(data.data as Board);
      }

      const channel = sb
        .channel(`board:${boardId}`, { config: { presence: { key: SESSION_ID } } })
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "boards", filter: `id=eq.${boardId}` },
          (payload) => {
            const row = payload.new as { data: Board; updated_at: string };
            if (row.updated_at !== lastRemoteRef.current) {
              lastRemoteRef.current = row.updated_at;
              skipUpsertRef.current = true;
              applyRemoteBoard(row.data);
            }
          }
        )
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState() as Record<string, Array<{ name?: string }>>;
          const keys = Object.keys(state);
          setPeers(keys.length);
          setPeerNames(keys.map((k) => state[k]?.[0]?.name || "Guest"));
        })
        .subscribe(async (s) => {
          if (s === "SUBSCRIBED") {
            setStatus("live");
            await channel.track({
              id: SESSION_ID,
              name: session.user.email || localStorage.getItem(ME_KEY) || "Guest",
            });
          }
        });
      channelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        sb.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [boardId, session, applyRemoteBoard]);

  // Debounced upsert of local changes while live.
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !boardId || status !== "live") return;
    if (skipUpsertRef.current) {
      skipUpsertRef.current = false; // this change came from a remote import
      return;
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const updated_at = new Date().toISOString();
      lastRemoteRef.current = updated_at;
      await sb.from("boards").update({ data: board, updated_at }).eq("id", boardId);
    }, 150);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [board, boardId, status]);

  const goLive = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    if (!session) {
      setStatus("needs-auth"); // caller (CollabBar) opens the auth gate
      return;
    }
    setStatus("connecting");
    const name = board.kind === "tree" ? board.blocks[board.rootId]?.text ?? "Board" : "Board";
    const { data, error } = await sb
      .from("boards")
      .insert({ name, data: board })
      .select("id")
      .single();
    if (error || !data) {
      setStatus("error");
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set("board", data.id);
    history.replaceState(null, "", url.toString());
    lastRemoteRef.current = null;
    skipUpsertRef.current = true; // we just created it from local state
    setBoardId(data.id);
  }, [board, session]);

  const leave = useCallback(() => {
    const url = new URL(location.href);
    url.searchParams.delete("board");
    history.replaceState(null, "", url.toString());
    setBoardId(null);
    setStatus(isCollabConfigured() ? "local" : "off");
    setPeers(0);
    setPeerNames([]);
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
    leave();
  }, [leave]);

  return {
    status,
    peers,
    peerNames,
    boardId,
    email: session?.user.email ?? null,
    goLive,
    leave,
    signOut,
  };
}

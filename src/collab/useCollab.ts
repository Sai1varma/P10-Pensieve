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
  /** Which other peers (by name) currently have each node focused, keyed by
   *  block id. Excludes your own presence entry. Tree boards only for now. */
  focusByNode: Record<string, string[]>;
  boardId: string | null;
  /** The shared board's own `name` column -- the local multi-board registry
   *  doesn't have an entry for it, so this is the only reliable label for a
   *  view-only session's header. */
  sharedBoardName: string | null;
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
 * authenticated user) -- except for `viewOnly` (anonymous read-only share
 * links), which skip the auth requirement and never write. Whole-board
 * last-write-wins with presence. Completely inert (status "off"/"local")
 * when Supabase isn't configured; local editing never requires a login.
 */
export function useCollab(focusedId: string | null = null, viewOnly = false): CollabState {
  const { board, currentBoardId, applyRemoteBoard, adoptRemoteBoard, markBoardCloudStatus } = useBoard();
  const [boardId, setBoardId] = useState<string | null>(boardIdFromUrl);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<CollabStatus>(
    isCollabConfigured() ? (boardIdFromUrl() ? "connecting" : "local") : "off"
  );
  const [peers, setPeers] = useState(0);
  const [peerNames, setPeerNames] = useState<string[]>([]);
  const [focusByNode, setFocusByNode] = useState<Record<string, string[]>>({});
  const [sharedBoardName, setSharedBoardName] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastRemoteRef = useRef<string | null>(null); // updated_at we last applied
  const skipUpsertRef = useRef(false); // don't re-upload a change we just imported
  const saveTimer = useRef<number | null>(null);
  const lastLoggedRef = useRef<{ at: number; email: string | null }>({ at: 0, email: null });

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
    if (!session && !viewOnly) {
      setStatus("needs-auth"); // shared board requested but not signed in
      return;
    }

    let cancelled = false;
    setStatus("connecting");

    (async () => {
      const { data, error } = await sb
        .from("boards")
        .select("data, updated_at, name, owner_email, is_public")
        .eq("id", boardId)
        .single();
      if (cancelled) return;
      if (error) {
        setStatus("error");
        return;
      }
      setSharedBoardName(data?.name ?? null);
      if (data?.data) {
        skipUpsertRef.current = true;
        lastRemoteRef.current = data.updated_at;
        // view-only (anonymous) visitors never get a local index entry --
        // just show the content. Everyone else adopts it: registers/updates
        // the local board list entry for this id and makes it active, so it
        // persists under its own id instead of overwriting whatever local
        // board slot happened to be active.
        if (viewOnly) {
          applyRemoteBoard(data.data as Board);
        } else {
          adoptRemoteBoard(boardId, data.data as Board, {
            name: data.name ?? "Board",
            ownerEmail: data.owner_email ?? null,
            updatedAt: data.updated_at,
            isPublic: data.is_public ?? false,
          });
        }
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
          const state = channel.presenceState() as Record<
            string,
            Array<{ name?: string; focusedId?: string }>
          >;
          const keys = Object.keys(state);
          setPeers(keys.length);
          setPeerNames(keys.map((k) => state[k]?.[0]?.name || "Guest"));

          const byNode: Record<string, string[]> = {};
          for (const k of keys) {
            if (k === SESSION_ID) continue; // don't show your own focus back to yourself
            const entry = state[k]?.[0];
            if (!entry?.focusedId) continue;
            const name = entry.name || "Guest";
            (byNode[entry.focusedId] ??= []).push(name);
          }
          setFocusByNode(byNode);
        })
        .subscribe(async (s) => {
          if (s === "SUBSCRIBED") {
            setStatus("live");
            // Anonymous view-only visitors have no session/name to announce
            // and never edit, so there's nothing meaningful to track.
            if (!viewOnly && session) {
              await channel.track({
                id: SESSION_ID,
                name: session.user.email || localStorage.getItem(ME_KEY) || "Guest",
                focusedId: focusedId ?? undefined,
              });
            }
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
    // applyRemoteBoard/adoptRemoteBoard deliberately excluded: adoptRemoteBoard's
    // identity changes on every board edit (it closes over `board` for its
    // flush-before-switch logic), and this effect calls it -- including it here
    // would reconnect (tear down + rebuild the realtime channel, refetch, and
    // re-adopt) on every single edit, which itself changes `board` again: an
    // infinite reconnect loop. Only boardId/session/viewOnly should ever
    // trigger a reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, session, viewOnly]);

  // Re-broadcast presence when the locally focused node changes, without
  // tearing down and reconnecting the whole channel.
  useEffect(() => {
    const channel = channelRef.current;
    if (!channel || status !== "live" || !session || viewOnly) return;
    channel.track({
      id: SESSION_ID,
      name: session.user.email || localStorage.getItem(ME_KEY) || "Guest",
      focusedId: focusedId ?? undefined,
    });
  }, [focusedId, status, session, viewOnly]);

  // Debounced upsert of local changes while live. Never for view-only
  // sessions -- the anon RLS policy only grants SELECT, so this would fail
  // anyway, but skipping it outright avoids the pointless request/error.
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !boardId || status !== "live" || viewOnly) return;
    if (skipUpsertRef.current) {
      skipUpsertRef.current = false; // this change came from a remote import
      return;
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const updated_at = new Date().toISOString();
      lastRemoteRef.current = updated_at;
      await sb.from("boards").update({ data: board, updated_at }).eq("id", boardId);

      // Lightweight activity breadcrumb, not a field-level diff: one entry
      // per actor per ~60s of edits, not one per keystroke. Best-effort --
      // if board_events doesn't exist yet (SQL not run), this just no-ops.
      const email = session?.user.email ?? null;
      const since = Date.now() - lastLoggedRef.current.at;
      if (since > 60_000 || lastLoggedRef.current.email !== email) {
        lastLoggedRef.current = { at: Date.now(), email };
        sb.from("board_events")
          .insert({ board_id: boardId, actor_email: email, action: "Updated the board" })
          .then(
            () => {},
            () => {}
          );
      }
    }, 150);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [board, boardId, status, viewOnly]);

  const goLive = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    if (!session) {
      setStatus("needs-auth"); // caller (CollabBar) opens the auth gate
      return;
    }
    setStatus("connecting");
    const name = board.kind === "tree" ? board.blocks[board.rootId]?.text ?? "Board" : "Board";
    // Reuse the local board's own id as the cloud row's id (it's already a
    // real UUID -- see newBoardId() in types.ts) instead of letting Postgres
    // generate a new one. Otherwise the two never match: markBoardCloudStatus
    // below would have no correct id to target, and reopening this board's
    // ?board= link later would register a second, duplicate local entry.
    // upsert (not insert): a row can already exist under this id from an
    // earlier attempt (e.g. a prior Go Live that succeeded server-side just
    // before the client hit an error) -- a plain insert 409s on the primary
    // key in that case. Taking over the existing row with the current local
    // content is the right outcome either way.
    const { data, error } = await sb
      .from("boards")
      .upsert({ id: currentBoardId, name, data: board }, { onConflict: "id" })
      .select("id")
      .single();
    if (error || !data) {
      setStatus("error");
      return;
    }
    sb.from("board_events")
      .insert({ board_id: data.id, actor_email: session.user.email ?? null, action: "Went live" })
      .then(
        () => {},
        () => {}
      );
    markBoardCloudStatus(currentBoardId, "live", session.user.email ?? undefined);
    const url = new URL(location.href);
    url.searchParams.set("board", data.id);
    history.replaceState(null, "", url.toString());
    lastRemoteRef.current = null;
    skipUpsertRef.current = true; // we just created it from local state
    setBoardId(data.id);
  }, [board, session, currentBoardId, markBoardCloudStatus]);

  const leave = useCallback(() => {
    const url = new URL(location.href);
    url.searchParams.delete("board");
    history.replaceState(null, "", url.toString());
    setBoardId(null);
    setStatus(isCollabConfigured() ? "local" : "off");
    setPeers(0);
    setPeerNames([]);
    setFocusByNode({});
    setSharedBoardName(null);
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
    leave();
  }, [leave]);

  return {
    status,
    peers,
    peerNames,
    focusByNode,
    boardId,
    sharedBoardName,
    email: session?.user.email ?? null,
    goLive,
    leave,
    signOut,
  };
}

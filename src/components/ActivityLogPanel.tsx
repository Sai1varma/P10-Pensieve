import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "../collab/supabase";

interface EventRow {
  id: number;
  actor_email: string | null;
  action: string;
  created_at: string;
}

/** Read-only audit trail for a live board: who touched it, when. Fetches
 *  board_events on open (no realtime subscription -- a manual refresh is
 *  enough for an occasional-glance feature like this). */
export function ActivityLogPanel({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const sb = getSupabase();
    if (!sb) return;
    const { data, error: err } = await sb
      .from("board_events")
      .select("id, actor_email, action, created_at")
      .eq("board_id", boardId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (err) {
      setError("Could not load activity — has the board_events table been created for this project yet?");
      return;
    }
    setRows(data as EventRow[]);
  }, [boardId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal insights-modal"
        role="dialog"
        aria-label="Activity log"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} title="Close">
          ×
        </button>
        <h2 className="modal-title">Activity</h2>

        {error && <p className="modal-error">{error}</p>}
        {!error && rows === null && <p className="empty">Loading…</p>}
        {!error && rows?.length === 0 && <p className="empty">No activity recorded yet.</p>}

        {rows && rows.length > 0 && (
          <div className="insights-list">
            {rows.map((r) => (
              <div key={r.id} className="insights-row">
                <span className="insights-row-text">
                  <strong>{r.actor_email ?? "Unknown"}</strong> — {r.action}
                </span>
                <span className="insights-count">{new Date(r.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        <button className="tbtn modal-send" onClick={load} style={{ marginTop: 14 }}>
          Refresh
        </button>
      </div>
    </div>
  );
}

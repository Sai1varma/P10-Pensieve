import { useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import { useBoard } from "../board/store";
import { STATUS_META, STATUS_ORDER, type TreeBoard } from "../board/types";

/** Toolbar button -> modal aggregating the board's current state: status
 *  breakdown, top-voted nodes, nodes per owner. Pure aggregation over
 *  board.blocks -- every field it reads already exists on Block. */
export function InsightsPanel({ onClose }: { onClose: () => void }) {
  // Only ever opened from the tree Toolbar (whiteboard has no status/votes/owner).
  const { board: rawBoard, dispatch } = useBoard();
  const board = rawBoard as TreeBoard;
  const { fitView } = useReactFlow();

  const insights = useMemo(() => {
    const blocks = Object.values(board.blocks).filter((b) => b.id !== board.rootId);
    const statusCounts: Partial<Record<(typeof STATUS_ORDER)[number], number>> = {};
    let unassigned = 0;
    const ownerCounts = new Map<string, number>();
    for (const b of blocks) {
      if (b.status) statusCounts[b.status] = (statusCounts[b.status] ?? 0) + 1;
      const owner = b.owner?.trim();
      if (owner) ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
      else unassigned++;
    }
    const topVoted = blocks
      .filter((b) => (b.votes ?? 0) > 0)
      .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
      .slice(0, 5);
    const owners = [...ownerCounts.entries()].sort((a, b) => b[1] - a[1]);
    return { total: blocks.length, statusCounts, topVoted, owners, unassigned };
  }, [board]);

  const jumpTo = (id: string) => {
    dispatch({ type: "expandTo", id });
    onClose();
    setTimeout(() => fitView({ nodes: [{ id }], duration: 500, padding: 0.6, maxZoom: 1.4 }), 130);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal insights-modal"
        role="dialog"
        aria-label="Board insights"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} title="Close">
          ×
        </button>
        <h2 className="modal-title">Board insights</h2>
        <p className="insights-total">
          {insights.total} node{insights.total === 1 ? "" : "s"} total
        </p>

        <div className="insights-section">
          <h3 className="insights-heading">Status</h3>
          <div className="insights-list">
            {STATUS_ORDER.map((s) => (
              <div key={s} className="insights-row">
                <span
                  className="badge badge-status"
                  style={{ background: STATUS_META[s].color, color: "#fff" }}
                >
                  {STATUS_META[s].label}
                </span>
                <span className="insights-count">{insights.statusCounts[s] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="insights-section">
          <h3 className="insights-heading">Top voted</h3>
          {insights.topVoted.length === 0 ? (
            <p className="empty">No votes yet.</p>
          ) : (
            <div className="insights-list">
              {insights.topVoted.map((b) => (
                <button key={b.id} className="insights-row insights-row-btn" onClick={() => jumpTo(b.id)}>
                  <span className="dot" style={{ background: b.color ?? "transparent", borderColor: "var(--edge)" }} />
                  <span className="insights-row-text">{b.text}</span>
                  <span className="insights-count">▲ {b.votes}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="insights-section">
          <h3 className="insights-heading">Nodes per owner</h3>
          {insights.owners.length === 0 && insights.unassigned === 0 ? (
            <p className="empty">No owners assigned yet.</p>
          ) : (
            <div className="insights-list">
              {insights.owners.map(([owner, count]) => (
                <div key={owner} className="insights-row">
                  <span className="insights-row-text">{owner}</span>
                  <span className="insights-count">{count}</span>
                </div>
              ))}
              {insights.unassigned > 0 && (
                <div className="insights-row">
                  <span className="insights-row-text insights-muted">Unassigned</span>
                  <span className="insights-count">{insights.unassigned}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

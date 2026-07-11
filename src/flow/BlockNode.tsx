import { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useBoard } from "../board/store";
import { contrastText, STATUS_META, type Status } from "../board/types";
import { ColorPalette } from "../components/ColorPalette";

export interface BlockNodeData {
  blockId: string;
  text: string;
  color: string | null;
  collapsed: boolean;
  hasChildren: boolean;
  hiddenCount: number;
  isRoot: boolean;
  status?: Status;
  votes: number;
  tagCount: number;
  hasLinks: boolean;
  hasNote: boolean;
  match?: boolean;
  dim?: boolean;
  /** Names of other live-collab peers who currently have this node open. */
  peerNames?: string[];
  [key: string]: unknown;
}

function BlockNodeImpl({ data, selected }: NodeProps) {
  const d = data as BlockNodeData;
  const { dispatch, viewOnly } = useBoard();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.text);
  const [showPalette, setShowPalette] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setDraft(d.text), [d.text]);
  useEffect(() => {
    if (editing && ref.current) {
      const el = ref.current;
      el.focus();
      el.select();
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, [editing]);

  const fg = contrastText(d.color);
  const commit = () => {
    dispatch({ type: "editText", id: d.blockId, text: draft.trim() || "Untitled" });
    setEditing(false);
  };

  return (
    <div
      className={`node${selected ? " node-selected" : ""}${d.isRoot ? " node-root" : ""}${
        d.match ? " node-match" : ""
      }${d.dim ? " node-dim" : ""}`}
      style={{
        background: d.color ?? "var(--surface)",
        color: d.color ? fg : "var(--text)",
        borderColor: d.color ? "transparent" : "var(--edge)",
      }}
    >
      {d.peerNames && d.peerNames.length > 0 && (
        <div className="peer-badge" title={`Viewing: ${d.peerNames.join(", ")}`}>
          {d.peerNames
            .slice(0, 3)
            .map((n) => n.trim()[0]?.toUpperCase() || "?")
            .join("")}
          {d.peerNames.length > 3 ? "+" : ""}
        </div>
      )}

      <Handle type="target" position={Position.Left} className="handle" />

      <div className="node-body" onDoubleClick={() => !viewOnly && setEditing(true)}>
        {editing ? (
          <textarea
            ref={ref}
            className="node-input nodrag"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                setDraft(d.text);
                setEditing(false);
              }
            }}
          />
        ) : (
          <span className="node-text">{d.text}</span>
        )}
      </div>

      {(d.status || d.votes > 0 || d.tagCount > 0 || d.hasLinks || d.hasNote) && (
        <div className="node-badges" style={{ color: d.color ? fg : "var(--muted)" }}>
          {d.status && (
            <span
              className="badge badge-status"
              style={{ background: STATUS_META[d.status].color, color: "#fff" }}
            >
              {STATUS_META[d.status].label}
            </span>
          )}
          {d.votes > 0 && (
            <span className="badge" title={`${d.votes} vote${d.votes === 1 ? "" : "s"}`}>
              ▲ {d.votes}
            </span>
          )}
          {d.hasNote && (
            <span className="badge" title="Has a note">
              ✎
            </span>
          )}
          {d.hasLinks && (
            <span className="badge" title="Has links">
              🔗
            </span>
          )}
          {d.tagCount > 0 && (
            <span className="badge" title={`${d.tagCount} tag${d.tagCount === 1 ? "" : "s"}`}>
              # {d.tagCount}
            </span>
          )}
        </div>
      )}

      {!viewOnly && (
        <div
          className="node-actions nodrag"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="node-btn"
            title="Color"
            onClick={() => setShowPalette((s) => !s)}
          >
            ●
          </button>
          {!d.isRoot && (
            <button
              className="node-btn"
              title="Upvote"
              onClick={() => dispatch({ type: "vote", id: d.blockId, delta: 1 })}
            >
              ▲
            </button>
          )}
          <button
            className="node-btn"
            title="Add child"
            onClick={() =>
              dispatch({ type: "addChild", parentId: d.blockId })
            }
          >
            ＋
          </button>
          {!d.isRoot && (
            <>
              <button
                className="node-btn"
                title="Add sibling"
                onClick={() => dispatch({ type: "addSibling", siblingId: d.blockId })}
              >
                ↳
              </button>
              <button
                className="node-btn"
                title="Delete (and its children)"
                onClick={() => {
                  if (
                    d.hiddenCount === 0 ||
                    confirm("Delete this block and all its children?")
                  )
                    dispatch({ type: "delete", id: d.blockId });
                }}
              >
                ×
              </button>
            </>
          )}
        </div>
      )}

      {showPalette && (
        <div className="nodrag">
          <ColorPalette
            value={d.color}
            onPick={(color) => dispatch({ type: "setColor", id: d.blockId, color })}
            onClose={() => setShowPalette(false)}
          />
        </div>
      )}

      {d.hasChildren && !viewOnly && (
        <button
          className="collapse-toggle nodrag"
          title={d.collapsed ? "Expand" : "Collapse"}
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: "toggleCollapse", id: d.blockId });
          }}
        >
          {d.collapsed ? `+${d.hiddenCount}` : "−"}
        </button>
      )}

      <Handle type="source" position={Position.Right} className="handle" />
    </div>
  );
}

export const BlockNode = memo(BlockNodeImpl);

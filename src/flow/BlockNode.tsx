import { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ancestorTexts, useBoard } from "../board/store";
import { contrastText, STATUS_META, type Status, type TreeBoard } from "../board/types";
import { loadSettings } from "../board/settings";
import { expandIdea } from "../collab/ai";
import { ColorPalette } from "../components/ColorPalette";
import { compressImage, MAX_IMAGE_SOURCE_BYTES } from "../board/imageUtils";

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
  commentCount: number;
  /** Number of non-hierarchical "relates to" links this node has. */
  relatedCount: number;
  /** Compressed data URL -- small corner thumbnail, not a full-width hero
   *  (the tree layout reserves a fixed height per node; a large image would
   *  overlap neighboring nodes since Dagre doesn't measure content height). */
  image?: string;
  match?: boolean;
  dim?: boolean;
  /** Names of other live-collab peers who currently have this node open. */
  peerNames?: string[];
  /** True while this node is the source of an in-progress "link to" pick. */
  linking?: boolean;
  onStartLink: (id: string) => void;
  [key: string]: unknown;
}

function BlockNodeImpl({ data, selected }: NodeProps) {
  const d = data as BlockNodeData;
  // BlockNode is only ever mounted for tree boards (App.tsx branches by board.kind).
  const { dispatch, viewOnly, board: rawBoard } = useBoard();
  const board = rawBoard as TreeBoard;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.text);
  const [showPalette, setShowPalette] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMAGE_SOURCE_BYTES) {
      alert("That image is too large (max 8MB).");
      return;
    }
    try {
      const image = await compressImage(file);
      dispatch({ type: "patchBlock", id: d.blockId, patch: { image } });
    } catch {
      alert("Could not read that image.");
    }
  };

  const onExpand = async () => {
    const settings = loadSettings();
    if (!settings.aiProvider) {
      alert('Pick an AI provider in Settings first (More ▾ → ⚙ Settings).');
      return;
    }
    setExpanding(true);
    const result = await expandIdea({
      nodeText: d.text,
      ancestorTexts: ancestorTexts(board.blocks, d.blockId),
      provider: settings.aiProvider,
      model: settings.aiModel,
    });
    setExpanding(false);
    if (result.error || !result.ideas?.length) {
      alert(result.error || "The AI didn't return any ideas.");
      return;
    }
    dispatch({ type: "addChildren", parentId: d.blockId, texts: result.ideas });
  };

  return (
    <div
      className={`node${selected ? " node-selected" : ""}${d.isRoot ? " node-root" : ""}${
        d.match ? " node-match" : ""
      }${d.dim ? " node-dim" : ""}${d.linking ? " node-linking" : ""}`}
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

      {d.image && (
        <div className="node-image-wrap nodrag">
          <img className="node-image" src={d.image} alt="" draggable={false} />
          {!viewOnly && (
            <button
              className="node-image-remove"
              title="Remove image"
              onClick={() => dispatch({ type: "patchBlock", id: d.blockId, patch: { image: undefined } })}
            >
              ×
            </button>
          )}
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

      {(d.status ||
        d.votes > 0 ||
        d.tagCount > 0 ||
        d.hasLinks ||
        d.hasNote ||
        d.commentCount > 0 ||
        d.relatedCount > 0) && (
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
          {d.commentCount > 0 && (
            <span className="badge" title={`${d.commentCount} comment${d.commentCount === 1 ? "" : "s"}`}>
              💬 {d.commentCount}
            </span>
          )}
          {d.tagCount > 0 && (
            <span className="badge" title={`${d.tagCount} tag${d.tagCount === 1 ? "" : "s"}`}>
              # {d.tagCount}
            </span>
          )}
          {d.relatedCount > 0 && (
            <span
              className="badge"
              title={`Related to ${d.relatedCount} other node${d.relatedCount === 1 ? "" : "s"}`}
            >
              ↔ {d.relatedCount}
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
          <button
            className="node-btn"
            title="Expand this idea with AI — generates a few candidate sub-ideas you can keep, edit, or discard"
            onClick={onExpand}
            disabled={expanding}
          >
            {expanding ? "…" : "✨"}
          </button>
          <button
            className={`node-btn${d.linking ? " node-btn-active" : ""}`}
            title="Link to another node"
            onClick={() => d.onStartLink(d.blockId)}
          >
            ↔
          </button>
          <button
            className="node-btn"
            title={d.image ? "Replace image" : "Add image"}
            onClick={() => fileRef.current?.click()}
          >
            🖼
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

      {!viewOnly && (
        <input ref={fileRef} type="file" accept="image/*" hidden className="nodrag" onChange={onFileChange} />
      )}
    </div>
  );
}

export const BlockNode = memo(BlockNodeImpl);

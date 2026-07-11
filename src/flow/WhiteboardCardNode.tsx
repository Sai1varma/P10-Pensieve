import { memo, useEffect, useRef, useState } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { useBoard } from "../board/store";
import { contrastText } from "../board/types";
import { ColorPalette } from "../components/ColorPalette";

export interface WhiteboardCardData {
  cardId: string;
  text: string;
  color: string | null;
  image?: string;
  onRequestImage: (cardId: string) => void;
  [key: string]: unknown;
}

function WhiteboardCardNodeImpl({ data, selected }: NodeProps) {
  const d = data as WhiteboardCardData;
  const { dispatch, viewOnly } = useBoard();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.text);
  const [showPalette, setShowPalette] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setDraft(d.text), [d.text]);
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [editing]);

  const fg = contrastText(d.color);
  const commit = () => {
    dispatch({ type: "editCardText", id: d.cardId, text: draft });
    setEditing(false);
  };

  return (
    <div
      className={`wb-card${selected ? " wb-card-selected" : ""}`}
      style={{
        background: d.color ?? "var(--surface)",
        color: d.color ? fg : "var(--text)",
        borderColor: d.color ? "transparent" : "var(--edge)",
      }}
    >
      {!viewOnly && (
        <NodeResizer
          isVisible={selected}
          minWidth={160}
          minHeight={100}
          onResizeEnd={(_e, params) => {
            dispatch({ type: "resizeCard", id: d.cardId, width: params.width, height: params.height });
            dispatch({ type: "moveCard", id: d.cardId, x: params.x, y: params.y });
          }}
        />
      )}

      {d.image && <img className="wb-card-image nodrag" src={d.image} alt="" draggable={false} />}

      <div className="wb-card-body" onDoubleClick={() => !viewOnly && setEditing(true)}>
        {editing ? (
          <textarea
            ref={ref}
            className="wb-card-input nodrag"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
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
          <span className="wb-card-text">
            {d.text || <em className="wb-card-placeholder">Double-click to edit</em>}
          </span>
        )}
      </div>

      {!viewOnly && (
        <div className="wb-card-actions nodrag" onClick={(e) => e.stopPropagation()}>
          <button className="node-btn" title="Color" onClick={() => setShowPalette((s) => !s)}>
            ●
          </button>
          <button className="node-btn" title="Image" onClick={() => d.onRequestImage(d.cardId)}>
            🖼
          </button>
          <button
            className="node-btn"
            title="Duplicate"
            onClick={() => dispatch({ type: "duplicateCard", id: d.cardId })}
          >
            ⧉
          </button>
          <button
            className="node-btn"
            title="Delete"
            onClick={() => dispatch({ type: "deleteCard", id: d.cardId })}
          >
            ×
          </button>
        </div>
      )}

      {showPalette && (
        <div className="nodrag">
          <ColorPalette
            value={d.color}
            onPick={(color) => dispatch({ type: "patchCard", id: d.cardId, patch: { color } })}
            onClose={() => setShowPalette(false)}
          />
        </div>
      )}
    </div>
  );
}

export const WhiteboardCardNode = memo(WhiteboardCardNodeImpl);

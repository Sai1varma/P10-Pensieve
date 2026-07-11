import { useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useBoard } from "../board/store";
import { STATUS_META, STATUS_ORDER, type Block, type ID, type Member, type TreeBoard } from "../board/types";
import { ColorPalette } from "./ColorPalette";
import type { Dispatch } from "react";
import type { Action } from "../board/store";

const MIN_W = 320;
const MAX_W = 820;
const WIDTH_KEY = "blockboard-panel-width";

function initialWidth(): number {
  const saved = Number(localStorage.getItem(WIDTH_KEY));
  return saved >= MIN_W && saved <= MAX_W ? saved : 420;
}

export function SidePanel({
  focusedId,
  setFocusedId,
  onClose,
  me,
}: {
  focusedId: ID;
  setFocusedId: (id: ID) => void;
  onClose: () => void;
  me?: string;
}) {
  // SidePanel is only ever mounted for tree boards (App.tsx branches by board.kind).
  const { board: rawBoard, dispatch } = useBoard();
  const board = rawBoard as TreeBoard;
  const { fitView } = useReactFlow();
  const [editingId, setEditingId] = useState<ID | null>(null);
  const [draft, setDraft] = useState("");
  const [paletteFor, setPaletteFor] = useState<ID | null>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const [width, setWidth] = useState<number>(initialWidth);

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(width));
  }, [width]);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: PointerEvent) => {
      setWidth(Math.min(MAX_W, Math.max(MIN_W, startW + (startX - ev.clientX))));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const focused = board.blocks[focusedId];

  // If the focused node was deleted, close the panel.
  useEffect(() => {
    if (!focused) onClose();
  }, [focused, onClose]);

  useEffect(() => {
    if (editingId) editRef.current?.select();
  }, [editingId]);

  // breadcrumb path root -> focused
  const trail = useMemo(() => {
    const out: Block[] = [];
    let cur: Block | undefined = focused;
    while (cur) {
      out.unshift(cur);
      cur = cur.parentId ? board.blocks[cur.parentId] : undefined;
    }
    return out;
  }, [focused, board]);

  // children in explicit sibling order (childIds); drag-to-reorder edits this.
  const children = useMemo(() => {
    if (!focused) return [];
    return focused.childIds
      .map((id) => board.blocks[id])
      .filter((b): b is Block => !!b);
  }, [focused, board]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  if (!focused) return null;

  const focusCanvas = (id: ID) => {
    dispatch({ type: "expandTo", id });
    // run after the canvas re-flows the newly expanded branch
    setTimeout(
      () => fitView({ nodes: [{ id }], duration: 600, padding: 0.6, maxZoom: 1.4 }),
      130
    );
  };

  const drill = (id: ID) => {
    setFocusedId(id);
    focusCanvas(id);
  };

  const commitEdit = () => {
    if (editingId)
      dispatch({ type: "editText", id: editingId, text: draft.trim() || "Untitled" });
    setEditingId(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = focused.childIds;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    dispatch({
      type: "reorderChildren",
      parentId: focused.id,
      orderedIds: arrayMove(ids, oldIndex, newIndex),
    });
  };

  return (
    <aside className="panel" style={{ width }}>
      <div
        className="panel-resizer"
        onPointerDown={startResize}
        onDoubleClick={() => setWidth(420)}
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize · double-click to reset"
      />
      <div className="panel-head">
        <nav className="crumbs" aria-label="Breadcrumb">
          {trail.map((b, i) => (
            <span key={b.id} className="crumb-wrap">
              {i > 0 && <span className="crumb-sep">/</span>}
              <button
                className={`crumb${b.id === focusedId ? " crumb-current" : ""}`}
                onClick={() => b.id !== focusedId && drill(b.id)}
                title={b.text}
              >
                {b.text}
              </button>
            </span>
          ))}
        </nav>
        <button className="panel-close" onClick={onClose} title="Close panel">
          ×
        </button>
      </div>

      <div className="panel-sub">
        <span
          className="dot"
          style={{ background: focused.color ?? "transparent", borderColor: "var(--edge)" }}
        />
        <strong>{focused.text}</strong>
        <span className="panel-count">
          {focused.childIds.length} item{focused.childIds.length === 1 ? "" : "s"}
        </span>
      </div>

      <NodeDetails
        key={focused.id}
        block={focused}
        dispatch={dispatch}
        members={board.members ?? []}
        me={me}
        blocks={board.blocks}
        onJumpTo={drill}
      />

      <div className="panel-body">
        {focused.childIds.length === 0 && (
          <p className="empty">No children yet. Add one below.</p>
        )}

        {children.length > 1 && (
          <p className="reorder-hint">Drag the ⠿ handle to reorder.</p>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {children.map((child) => (
              <SortableRow
                key={child.id}
                child={child}
                isEditing={editingId === child.id}
                draft={draft}
                setDraft={setDraft}
                editRef={editRef}
                commitEdit={commitEdit}
                cancelEdit={() => setEditingId(null)}
                onStartRename={() => {
                  setDraft(child.text);
                  setEditingId(child.id);
                }}
                drill={drill}
                dispatch={dispatch}
                paletteOpen={paletteFor === child.id}
                onTogglePalette={() => setPaletteFor((p) => (p === child.id ? null : child.id))}
                onClosePalette={() => setPaletteFor(null)}
              />
            ))}
          </SortableContext>
        </DndContext>

        <button
          className="add-block"
          onClick={() => dispatch({ type: "addChild", parentId: focusedId })}
        >
          ＋ Add block here
        </button>
      </div>
    </aside>
  );
}

/** A single draggable child row (drag handle reorders siblings). */
function SortableRow({
  child,
  isEditing,
  draft,
  setDraft,
  editRef,
  commitEdit,
  cancelEdit,
  onStartRename,
  drill,
  dispatch,
  paletteOpen,
  onTogglePalette,
  onClosePalette,
}: {
  child: Block;
  isEditing: boolean;
  draft: string;
  setDraft: (s: string) => void;
  editRef: React.RefObject<HTMLInputElement | null>;
  commitEdit: () => void;
  cancelEdit: () => void;
  onStartRename: () => void;
  drill: (id: ID) => void;
  dispatch: Dispatch<Action>;
  paletteOpen: boolean;
  onTogglePalette: () => void;
  onClosePalette: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: child.id,
  });
  const kids = child.childIds.length;
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    borderLeftColor: child.color ?? "var(--edge)",
  };

  return (
    <div ref={setNodeRef} className="row" style={style}>
      <button
        className="drag-handle"
        title="Drag to reorder"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>

      {isEditing ? (
        <input
          ref={editRef}
          className="row-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") cancelEdit();
          }}
        />
      ) : (
        <button className="row-text" onClick={() => drill(child.id)} title="Open in panel + focus on canvas">
          {child.text}
          {kids > 0 && <span className="row-chip">{kids}</span>}
        </button>
      )}

      <div className="row-actions">
        <button className="row-btn" title="Rename" onClick={onStartRename}>
          ✎
        </button>
        <button className="row-btn" title="Color" onClick={onTogglePalette}>
          ●
        </button>
        <button
          className="row-btn"
          title="Add child"
          onClick={() => dispatch({ type: "addChild", parentId: child.id })}
        >
          ＋
        </button>
        <button
          className="row-btn danger"
          title="Delete (and its children)"
          onClick={() => {
            if (kids === 0 || confirm("Delete this block and all its children?"))
              dispatch({ type: "delete", id: child.id });
          }}
        >
          ×
        </button>

        {paletteOpen && (
          <ColorPalette
            value={child.color}
            onPick={(color) => dispatch({ type: "setColor", id: child.id, color })}
            onClose={onClosePalette}
          />
        )}
      </div>
    </div>
  );
}

/** Editable detail block for the currently-focused node. Keyed by id so drafts
 *  reset when focus changes. */
function NodeDetails({
  block,
  dispatch,
  members,
  me,
  blocks,
  onJumpTo,
}: {
  block: Block;
  dispatch: Dispatch<Action>;
  members: Member[];
  me?: string;
  blocks: Record<ID, Block>;
  onJumpTo: (id: ID) => void;
}) {
  const [note, setNote] = useState(block.note ?? "");
  const [owner, setOwner] = useState(block.owner ?? "");
  const [tagDraft, setTagDraft] = useState("");
  const [linkDraft, setLinkDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const tags = block.tags ?? [];
  const links = block.links ?? [];
  const comments = block.comments ?? [];
  const related = (block.relatedIds ?? []).map((id) => blocks[id]).filter((b): b is Block => !!b);

  const postComment = () => {
    const text = commentDraft.trim();
    if (!text) return;
    dispatch({ type: "addComment", id: block.id, author: me?.trim() || "Anonymous", text });
    setCommentDraft("");
  };

  const patch = (p: Partial<Block>) => dispatch({ type: "patchBlock", id: block.id, patch: p });

  const commitOwner = (value: string) => {
    const v = value.trim();
    setOwner(v);
    if (v !== (block.owner ?? "")) patch({ owner: v || undefined });
    if (v) dispatch({ type: "addMember", name: v }); // grows the member list
  };

  const addTag = () => {
    const t = tagDraft.trim();
    if (t && !tags.includes(t)) patch({ tags: [...tags, t] });
    setTagDraft("");
  };
  const addLink = () => {
    const l = linkDraft.trim();
    if (l) patch({ links: [...links, l] });
    setLinkDraft("");
  };

  return (
    <div className="detail">
      <div className="detail-row detail-status">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            className={`status-chip${block.status === s ? " active" : ""}`}
            style={
              block.status === s
                ? { background: STATUS_META[s].color, borderColor: STATUS_META[s].color, color: "#fff" }
                : undefined
            }
            onClick={() => patch({ status: block.status === s ? undefined : s })}
          >
            {STATUS_META[s].label}
          </button>
        ))}
        <span className="detail-votes">
          <button className="vote-btn" title="Downvote" onClick={() => dispatch({ type: "vote", id: block.id, delta: -1 })}>
            −
          </button>
          <span className="vote-num">▲ {block.votes ?? 0}</span>
          <button className="vote-btn" title="Upvote" onClick={() => dispatch({ type: "vote", id: block.id, delta: 1 })}>
            ＋
          </button>
        </span>
      </div>

      <textarea
        className="detail-note"
        placeholder="Add a note…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== (block.note ?? "") && patch({ note: note })}
      />

      <div className="owner-row">
        <input
          className="detail-input owner-input"
          list="bb-members"
          placeholder="Owner"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          onBlur={() => commitOwner(owner)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitOwner(owner);
            }
          }}
        />
        {me && me !== owner && (
          <button className="tbtn owner-me" title={`Assign to me (${me})`} onClick={() => commitOwner(me)}>
            Me
          </button>
        )}
        {owner && (
          <button className="chip-x" title="Clear owner" onClick={() => { setOwner(""); patch({ owner: undefined }); }}>
            ×
          </button>
        )}
        <datalist id="bb-members">
          {members.map((m) => (
            <option key={m.id} value={m.name} />
          ))}
        </datalist>
      </div>

      <div className="chips">
        {tags.map((t) => (
          <span key={t} className="chip">
            #{t}
            <button className="chip-x" onClick={() => patch({ tags: tags.filter((x) => x !== t) })}>
              ×
            </button>
          </span>
        ))}
        <input
          className="chip-input"
          placeholder="add tag"
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag();
            }
          }}
          onBlur={addTag}
        />
      </div>

      <div className="links">
        {links.map((l, i) => (
          <div key={`${l}-${i}`} className="link-row">
            <a href={l} target="_blank" rel="noreferrer" className="link-a" title={l}>
              {l}
            </a>
            <button
              className="chip-x"
              onClick={() => patch({ links: links.filter((_, idx) => idx !== i) })}
            >
              ×
            </button>
          </div>
        ))}
        <input
          className="detail-input"
          placeholder="add link (https://…)"
          value={linkDraft}
          onChange={(e) => setLinkDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addLink();
            }
          }}
          onBlur={addLink}
        />
      </div>

      {related.length > 0 && (
        <div className="chips related-chips">
          {related.map((r) => (
            <span key={r.id} className="chip">
              <button className="chip-jump" onClick={() => onJumpTo(r.id)} title="Jump to this node">
                ↔ {r.text || "Untitled"}
              </button>
              <button
                className="chip-x"
                title="Remove this link"
                onClick={() => dispatch({ type: "unlinkNodes", aId: block.id, bId: r.id })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="comments">
        <h4 className="comments-heading">
          Comments{comments.length > 0 ? ` (${comments.length})` : ""}
        </h4>
        {comments.map((c) => (
          <div key={c.id} className="comment-row">
            <div className="comment-meta">
              <strong>{c.author}</strong>
              <span className="comment-time">{new Date(c.createdAt).toLocaleString()}</span>
              <button
                className="chip-x comment-delete"
                title="Delete comment"
                onClick={() => dispatch({ type: "deleteComment", id: block.id, commentId: c.id })}
              >
                ×
              </button>
            </div>
            <p className="comment-text">{c.text}</p>
          </div>
        ))}
        <div className="comment-compose">
          <textarea
            className="detail-note comment-input"
            placeholder={me ? `Comment as ${me}…` : "Comment…"}
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                postComment();
              }
            }}
          />
          <button className="tbtn" disabled={!commentDraft.trim()} onClick={postComment}>
            Post
          </button>
        </div>
      </div>
    </div>
  );
}

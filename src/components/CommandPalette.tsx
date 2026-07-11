import { useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useBoard } from "../board/store";
import { exportJson, exportPng, copyShareLink } from "../board/exportShared";
import type { Theme } from "../board/types";

interface Entry {
  id: string;
  section: "Boards" | "Nodes" | "Actions";
  label: string;
  sublabel?: string;
  run: () => void;
}

/** Cmd/Ctrl+K overlay: fuzzy-jump to any node (tree boards), switch boards,
 *  or run a toolbar action, all from one keyboard-driven list. Reuses the
 *  same dispatch/fitView/export plumbing the toolbars already use. */
export function CommandPalette({
  theme,
  onToggleTheme,
  onPresent,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  onPresent: () => void;
}) {
  const { board, dispatch, boards, currentBoardId, switchBoard } = useBoard();
  const { fitView } = useReactFlow();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const entries: Entry[] = useMemo(() => {
    const out: Entry[] = [];

    for (const b of boards) {
      if (b.id === currentBoardId) continue;
      out.push({
        id: `board-${b.id}`,
        section: "Boards",
        label: b.name,
        sublabel: b.kind === "whiteboard" ? "Whiteboard" : "Mind map",
        run: () => switchBoard(b.id),
      });
    }

    if (board.kind === "tree") {
      for (const b of Object.values(board.blocks)) {
        if (b.id === board.rootId) continue;
        out.push({
          id: `node-${b.id}`,
          section: "Nodes",
          label: b.text || "Untitled",
          run: () => {
            dispatch({ type: "expandTo", id: b.id });
            setTimeout(
              () => fitView({ nodes: [{ id: b.id }], duration: 500, padding: 0.6, maxZoom: 1.4 }),
              130
            );
          },
        });
      }
    }

    out.push(
      {
        id: "action-theme",
        section: "Actions",
        label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        run: onToggleTheme,
      },
      { id: "action-undo", section: "Actions", label: "Undo", run: () => dispatch({ type: "undo" }) },
      { id: "action-redo", section: "Actions", label: "Redo", run: () => dispatch({ type: "redo" }) },
      { id: "action-export-json", section: "Actions", label: "Export JSON", run: () => exportJson(board) },
      { id: "action-export-png", section: "Actions", label: "Export PNG", run: () => exportPng() },
      { id: "action-share-link", section: "Actions", label: "Export as link", run: () => copyShareLink(board) },
      {
        id: "action-reset",
        section: "Actions",
        label: "Reset board",
        run: () => {
          const msg =
            board.kind === "whiteboard" ? "Reset the board to blank?" : "Reset the board to the starter tree?";
          if (confirm(msg)) dispatch({ type: "reset" });
        },
      }
    );
    if (board.kind === "tree") {
      out.push({ id: "action-present", section: "Actions", label: "Present", run: onPresent });
    }

    return out;
  }, [boards, currentBoardId, switchBoard, board, dispatch, fitView, theme, onToggleTheme, onPresent]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? entries.filter((e) => e.label.toLowerCase().includes(q)) : entries;
    return list.slice(0, 60); // cap for perf on large boards
  }, [entries, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const run = (entry: Entry) => {
    entry.run();
    setOpen(false);
  };

  if (!open) return null;

  let lastSection: string | null = null;

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div
        className="modal palette-modal"
        role="dialog"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="detail-input modal-input"
          placeholder="Jump to a node, switch boards, run an action…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const entry = filtered[activeIndex];
              if (entry) run(entry);
            }
          }}
        />
        <div className="palette-list">
          {filtered.length === 0 && <p className="empty">No matches.</p>}
          {filtered.map((entry, i) => {
            const showHeading = entry.section !== lastSection;
            lastSection = entry.section;
            return (
              <div key={entry.id}>
                {showHeading && <div className="palette-heading">{entry.section}</div>}
                <button
                  className={`palette-row${i === activeIndex ? " palette-row-active" : ""}`}
                  onClick={() => run(entry)}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <span className="palette-row-label">{entry.label}</span>
                  {entry.sublabel && <span className="palette-row-sub">{entry.sublabel}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

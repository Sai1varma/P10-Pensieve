import { useEffect } from "react";
import { useBoard } from "./store";
import type { ID } from "./types";

/** Returns true when focus is in a text field, so shortcuts stay out of the way. */
function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

/**
 * Global keyboard shortcuts. Mounted inside the providers; renders nothing.
 * - Ctrl/Cmd+Z / Shift+Z (or Ctrl+Y): undo / redo
 * - With a focused node (panel open) and not typing: Delete removes it,
 *   Space toggles collapse. (Enter/Tab intentionally do NOT create blocks.)
 */
export function Shortcuts({
  focusedId,
  setFocusedId,
}: {
  focusedId: ID | null;
  setFocusedId: (id: ID | null) => void;
}) {
  const { board, dispatch } = useBoard();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      // Undo / redo work regardless of selection (but not while typing).
      if (mod && e.key.toLowerCase() === "z") {
        if (isTyping()) return;
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        if (isTyping()) return;
        e.preventDefault();
        dispatch({ type: "redo" });
        return;
      }

      if (isTyping() || mod) return;
      if (!focusedId) return;
      // These shortcuts (Delete/Space) are tree-only; Shortcuts stays mounted
      // for whiteboard boards too, so no-op there instead of reading .blocks.
      if (board.kind !== "tree") return;
      const node = board.blocks[focusedId];
      if (!node) return;

      switch (e.key) {
        case "Delete":
          if (node.parentId != null) {
            e.preventDefault();
            const kids = node.childIds.length;
            if (kids === 0 || confirm("Delete this block and all its children?")) {
              dispatch({ type: "delete", id: focusedId });
              setFocusedId(null);
            }
          }
          break;
        case " ":
          if (node.childIds.length > 0) {
            e.preventDefault();
            dispatch({ type: "toggleCollapse", id: focusedId });
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [board, dispatch, focusedId, setFocusedId]);

  return null;
}

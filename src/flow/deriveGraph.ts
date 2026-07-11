import type { ID, TreeBoard } from "../board/types";

/**
 * Visible ids = every node except those inside a collapsed subtree.
 * A collapsed node is itself visible; only its descendants are hidden.
 */
export function visibleIds(board: TreeBoard): ID[] {
  const out: ID[] = [];
  const walk = (id: ID) => {
    const b = board.blocks[id];
    if (!b) return;
    out.push(id);
    if (b.collapsed) return; // stop descending
    for (const c of b.childIds) walk(c);
  };
  walk(board.rootId);
  return out;
}

/** Count all descendants of a node (used for the collapsed badge). */
export function descendantCount(board: TreeBoard, id: ID): number {
  let n = 0;
  const walk = (cur: ID) => {
    for (const c of board.blocks[cur]?.childIds ?? []) {
      n += 1;
      walk(c);
    }
  };
  walk(id);
  return n;
}

/** A signature that changes only when structure/visibility changes (not on drag). */
export function structureSignature(board: TreeBoard): string {
  return visibleIds(board).join("|");
}

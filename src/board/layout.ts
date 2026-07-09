import Dagre from "@dagrejs/dagre";
import { NODE_H, NODE_W, type Board, type ID } from "./types";

/**
 * Compute a tidy left-to-right tree layout for the given visible node ids.
 * Returns top-left positions keyed by id (React Flow uses top-left origin).
 */
export function layoutVisible(
  board: Board,
  visibleIds: ID[]
): Record<ID, { x: number; y: number }> {
  const g = new Dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 28, ranksep: 90, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  const visible = new Set(visibleIds);
  for (const id of visibleIds) g.setNode(id, { width: NODE_W, height: NODE_H });
  for (const id of visibleIds) {
    const b = board.blocks[id];
    if (b?.parentId && visible.has(b.parentId)) g.setEdge(b.parentId, id);
  }

  Dagre.layout(g);

  const out: Record<ID, { x: number; y: number }> = {};
  for (const id of visibleIds) {
    const n = g.node(id);
    if (n) out[id] = { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 };
  }

  enforceChildOrder(board, visible, out);
  return out;
}

const NODE_GAP = 28; // matches dagre nodesep

/**
 * Dagre may order siblings by crossing-minimization, not by our childIds order.
 * We want the canvas to read top-to-bottom in childIds order (so it matches the
 * side panel and drag-to-reorder). This translates each child's whole subtree
 * vertically to restack siblings in childIds order, preserving each subtree's
 * internal layout and keeping within the family's original vertical band (so it
 * never overlaps neighbouring branches).
 */
function enforceChildOrder(
  board: Board,
  visible: Set<ID>,
  out: Record<ID, { x: number; y: number }>
) {
  // Parents with 2+ visible children, processed shallow-first so nested
  // reorders compose on top of already-adjusted ancestors.
  const depth: Record<ID, number> = {};
  const order: ID[] = [];
  const walk = (id: ID, d: number) => {
    if (!visible.has(id)) return;
    depth[id] = d;
    order.push(id);
    for (const c of board.blocks[id]?.childIds ?? []) walk(c, d + 1);
  };
  walk(board.rootId, 0);

  const parents = order
    .filter((id) => (board.blocks[id]?.childIds ?? []).filter((c) => visible.has(c)).length > 1)
    .sort((a, b) => depth[a] - depth[b]);

  const subtreeExtent = (id: ID): { min: number; max: number } => {
    let min = Infinity;
    let max = -Infinity;
    const visit = (n: ID) => {
      if (!visible.has(n) || !out[n]) return;
      min = Math.min(min, out[n].y);
      max = Math.max(max, out[n].y + NODE_H);
      for (const c of board.blocks[n]?.childIds ?? []) visit(c);
    };
    visit(id);
    return { min, max };
  };

  const translate = (id: ID, dy: number) => {
    const visit = (n: ID) => {
      if (!visible.has(n) || !out[n]) return;
      out[n] = { x: out[n].x, y: out[n].y + dy };
      for (const c of board.blocks[n]?.childIds ?? []) visit(c);
    };
    visit(id);
  };

  for (const p of parents) {
    const kids = (board.blocks[p]?.childIds ?? []).filter((c) => visible.has(c));
    const exts = kids.map((c) => ({ c, ...subtreeExtent(c) }));
    let cursor = Math.min(...exts.map((e) => e.min));
    for (const e of exts) {
      translate(e.c, cursor - e.min);
      cursor += e.max - e.min + NODE_GAP;
    }
  }
}

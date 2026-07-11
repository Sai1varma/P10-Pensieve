import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  useReactFlow,
  useNodesState,
  type Node,
  type Edge,
  type NodeTypes,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useBoard } from "../board/store";
import { layoutVisible } from "../board/layout";
import {
  descendantCount,
  structureSignature,
  visibleIds,
} from "./deriveGraph";
import { BlockNode, type BlockNodeData } from "./BlockNode";
import type { TreeBoard, ViewFilter } from "../board/types";

const nodeTypes: NodeTypes = { block: BlockNode };

interface View {
  active: boolean;
  isMatch: (id: string) => boolean;
}

function makeData(
  board: TreeBoard,
  id: string,
  view: View,
  focusByNode: Record<string, string[]>,
  linkingFrom: string | null,
  onStartLink: (id: string) => void
): BlockNodeData {
  const b = board.blocks[id];
  return {
    blockId: id,
    text: b.text,
    color: b.color,
    collapsed: b.collapsed,
    hasChildren: b.childIds.length > 0,
    hiddenCount: descendantCount(board, id),
    isRoot: id === board.rootId,
    status: b.status,
    votes: b.votes ?? 0,
    tagCount: b.tags?.length ?? 0,
    hasLinks: (b.links?.length ?? 0) > 0,
    hasNote: !!(b.note && b.note.trim()),
    commentCount: b.comments?.length ?? 0,
    relatedCount: b.relatedIds?.length ?? 0,
    image: b.image,
    match: view.active && view.isMatch(id),
    dim: view.active && !view.isMatch(id),
    peerNames: focusByNode[id] ?? [],
    linking: id === linkingFrom,
    onStartLink,
  };
}

/** Detects a plain single-node expand/collapse between two board snapshots:
 *  same set of block ids, exactly one node's `collapsed` flag flipped, and
 *  the tree shape (rootId, parent/child structure) is otherwise identical.
 *  Bulk operations (expand all, add/delete, import, remote sync, etc.)
 *  naturally fail this check and fall back to the whole-tree fit. */
function detectToggleFocus(
  prev: TreeBoard | null,
  board: TreeBoard
): { id: string; mode: "expand" | "collapse" } | null {
  if (!prev || prev.rootId !== board.rootId) return null;
  const prevIds = Object.keys(prev.blocks);
  const nextIds = Object.keys(board.blocks);
  if (prevIds.length !== nextIds.length) return null;
  let changed: string | null = null;
  for (const id of nextIds) {
    const a = prev.blocks[id];
    const b = board.blocks[id];
    if (!a) return null; // a node was added/removed -> not a plain toggle
    if (a.collapsed !== b.collapsed) {
      if (changed) return null; // more than one flag changed -> bulk op
      changed = id;
    } else if (a.childIds.length !== b.childIds.length || a.parentId !== b.parentId) {
      return null; // structural change beyond collapse -> not a plain toggle
    }
  }
  return changed ? { id: changed, mode: board.blocks[changed].collapsed ? "collapse" : "expand" } : null;
}

export function Canvas({
  onNodeFocus,
  query = "",
  filter = {},
  focusByNode = {},
}: {
  onNodeFocus: (id: string) => void;
  query?: string;
  filter?: ViewFilter;
  focusByNode?: Record<string, string[]>;
}) {
  // Canvas is only ever mounted for tree boards (App.tsx branches by board.kind).
  const { board: rawBoard, dispatch, viewOnly } = useBoard();
  const board = rawBoard as TreeBoard;
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [linkingFrom, setLinkingFrom] = useState<string | null>(null);
  const lastSig = useRef<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Previous board, used only to detect a single node's collapsed flag
  // flipping (a plain expand/collapse) so the camera can focus on just that
  // node's new context instead of always fitting the whole tree.
  const prevBoardRef = useRef<TreeBoard | null>(null);

  // Search/filter matcher. `active` when any query or filter is set.
  const view: View = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = q.length > 0 || !!filter.status || !!filter.tag;
    const isMatch = (id: string) => {
      const b = board.blocks[id];
      if (!b) return false;
      if (q) {
        const hay = [b.text, b.note ?? "", b.owner ?? "", ...(b.tags ?? [])]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter.status && b.status !== filter.status) return false;
      if (filter.tag && !(b.tags ?? []).includes(filter.tag)) return false;
      return true;
    };
    return { active, isMatch };
  }, [board, query, filter]);

  // Deepest level in the tree (root = 0), for the level dropdown.
  const maxDepth = useMemo(() => {
    let max = 0;
    const walk = (id: string, dep: number) => {
      max = Math.max(max, dep);
      for (const c of board.blocks[id]?.childIds ?? []) walk(c, dep + 1);
    };
    walk(board.rootId, 0);
    return max;
  }, [board]);

  // Edges follow the visible tree (tinted toward the child's color), plus a
  // dashed cross-edge for every non-hierarchical "relates to" link where
  // both ends are currently visible.
  const edges: Edge[] = useMemo(() => {
    const vis = new Set(visibleIds(board));
    const out: Edge[] = [];
    for (const id of vis) {
      const b = board.blocks[id];
      if (b.parentId && vis.has(b.parentId)) {
        out.push({
          id: `${b.parentId}->${id}`,
          source: b.parentId,
          target: id,
          type: "default",
          style: { stroke: b.color ?? "var(--edge-strong)", strokeWidth: 2 },
        });
      }
      for (const relId of b.relatedIds ?? []) {
        if (!vis.has(relId) || id > relId) continue; // undirected: emit each pair once
        out.push({
          id: `rel-${id}-${relId}`,
          source: id,
          target: relId,
          type: "straight",
          style: { stroke: "var(--muted)", strokeWidth: 1.5, strokeDasharray: "5 4" },
        });
      }
    }
    return out;
  }, [board]);

  const runFit = useCallback(() => {
    // let React commit the new nodes first, then animate the camera
    setTimeout(() => fitView({ duration: 500, padding: 0.15, maxZoom: 1.2, minZoom: 0.05 }), 30);
  }, [fitView]);

  const onStartLink = useCallback((id: string) => setLinkingFrom(id), []);

  // Escape cancels an in-progress "link to" pick.
  useEffect(() => {
    if (!linkingFrom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLinkingFrom(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [linkingFrom]);

  // Structure changed -> re-flow (dagre) + animate camera. Otherwise just refresh data.
  useEffect(() => {
    const prevBoard = prevBoardRef.current;
    prevBoardRef.current = board;
    const sig = structureSignature(board);
    if (sig !== lastSig.current) {
      const isInitial = lastSig.current === null;
      lastSig.current = sig;
      const vis = visibleIds(board);
      const allPositioned = vis.every(
        (id) => board.blocks[id].x != null && board.blocks[id].y != null
      );
      const usedStored = isInitial && allPositioned;
      const pos = usedStored
        ? Object.fromEntries(
            vis.map((id) => [
              id,
              { x: board.blocks[id].x as number, y: board.blocks[id].y as number },
            ])
          )
        : layoutVisible(board, vis);

      setNodes(
        vis.map((id) => ({
          id,
          type: "block",
          position: pos[id] ?? { x: 0, y: 0 },
          data: makeData(board, id, view, focusByNode, linkingFrom, onStartLink),
        }))
      );

      // persist computed positions only when we actually recomputed them
      // (guarded: same signature -> no reflow loop). Skip when we reused
      // already-stored positions to avoid a redundant render.
      if (!usedStored) dispatch({ type: "setPositions", positions: pos });

      // animate node motion, then fit the camera
      wrapRef.current?.classList.add("animating");
      window.setTimeout(() => wrapRef.current?.classList.remove("animating"), 380);

      // If this structure change is exactly one node's collapsed flag
      // flipping (a plain expand/collapse, from the card button or the Space
      // shortcut) -- and nothing else about the tree changed -- focus the
      // camera on just that node's new context instead of the whole board.
      const focus = detectToggleFocus(prevBoard, board);
      if (focus) {
        const ids =
          focus.mode === "expand"
            ? [focus.id, ...(board.blocks[focus.id]?.childIds ?? [])]
            : (() => {
                const parentId = board.blocks[focus.id]?.parentId;
                const parent = parentId ? board.blocks[parentId] : null;
                return parent ? [parentId as string, ...parent.childIds] : [focus.id];
              })();
        setTimeout(
          () => fitView({ nodes: ids.map((id) => ({ id })), duration: 500, padding: 0.35, maxZoom: 1.3 }),
          30
        );
      } else {
        runFit();
      }
    } else {
      // Data-only change (text/color) -> keep positions, refresh node data.
      // Also adopt each node's board-stored x/y here: a no-op for ordinary
      // local edits (board already matches what's on screen), but this is
      // what picks up a node a collaborator dragged elsewhere without
      // forcing a full Dagre re-layout + camera animation for everyone.
      setNodes((nds) =>
        nds.map((n) => {
          const b = board.blocks[n.id];
          const stored = b && b.x != null && b.y != null ? { x: b.x, y: b.y } : null;
          return {
            ...n,
            data: makeData(board, n.id, view, focusByNode, linkingFrom, onStartLink),
            position: stored ?? n.position,
          };
        })
      );
    }
  }, [board, dispatch, setNodes, runFit, fitView, view, focusByNode, linkingFrom, onStartLink]);

  const onNodeDragStop = useCallback<OnNodeDrag>(
    (_e, node) => {
      dispatch({ type: "moveNode", id: node.id, x: node.position.x, y: node.position.y });
    },
    [dispatch]
  );

  const tidy = useCallback(() => {
    const vis = visibleIds(board);
    const pos = layoutVisible(board, vis);
    setNodes((nds) =>
      nds.map((n) => (pos[n.id] ? { ...n, position: pos[n.id] } : n))
    );
    dispatch({ type: "setPositions", positions: pos });
    wrapRef.current?.classList.add("animating");
    window.setTimeout(() => wrapRef.current?.classList.remove("animating"), 380);
    runFit();
  }, [board, dispatch, setNodes, runFit]);

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_e, node) => {
          if (linkingFrom) {
            if (node.id !== linkingFrom) dispatch({ type: "linkNodes", aId: linkingFrom, bId: node.id });
            setLinkingFrom(null); // clicking the source again just cancels
            return;
          }
          onNodeFocus(node.id);
        }}
        nodesDraggable={!viewOnly}
        fitView
        minZoom={0.05}
        maxZoom={2}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
      >
        <Panel position="top-right" className="canvas-panel">
          {!viewOnly && (
            <>
              <button className="tbtn" onClick={tidy}>
                Tidy up
              </button>
              <button className="tbtn" onClick={() => dispatch({ type: "expandAll" })}>
                Expand all
              </button>
              <button className="tbtn" onClick={() => dispatch({ type: "collapseAll" })}>
                Collapse all
              </button>
              <select
                className="filter-select"
                value=""
                title="Show levels down to…"
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  if (v === "all") dispatch({ type: "expandAll" });
                  else dispatch({ type: "collapseToDepth", depth: Number(v) });
                }}
              >
                <option value="">Levels…</option>
                <option value="all">Show all</option>
                {Array.from({ length: maxDepth }, (_, k) => k + 1).map((n) => (
                  <option key={n} value={n}>
                    Level {n}
                  </option>
                ))}
              </select>
            </>
          )}
          <button className="tbtn" onClick={runFit}>
            Fit
          </button>
        </Panel>
        {linkingFrom && (
          <Panel position="bottom-center" className="link-banner">
            <span>Click another node to link it to "{board.blocks[linkingFrom]?.text ?? "…"}" </span>
            <button className="tbtn" onClick={() => setLinkingFrom(null)}>
              Cancel (Esc)
            </button>
          </Panel>
        )}
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="var(--dots)" />
        <MiniMap pannable zoomable nodeColor={(n) => (n.data as BlockNodeData).color ?? "var(--edge)"} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

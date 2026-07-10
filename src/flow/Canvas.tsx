import { useCallback, useEffect, useMemo, useRef } from "react";
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
import type { ViewFilter } from "../board/types";

const nodeTypes: NodeTypes = { block: BlockNode };

interface View {
  active: boolean;
  isMatch: (id: string) => boolean;
}

function makeData(
  board: ReturnType<typeof useBoard>["board"],
  id: string,
  view: View
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
    match: view.active && view.isMatch(id),
    dim: view.active && !view.isMatch(id),
  };
}

export function Canvas({
  onNodeFocus,
  query = "",
  filter = {},
}: {
  onNodeFocus: (id: string) => void;
  query?: string;
  filter?: ViewFilter;
}) {
  const { board, dispatch } = useBoard();
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const lastSig = useRef<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  // Edges follow the visible tree; tinted toward the child's color.
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
    }
    return out;
  }, [board]);

  const runFit = useCallback(() => {
    // let React commit the new nodes first, then animate the camera
    setTimeout(() => fitView({ duration: 500, padding: 0.15, maxZoom: 1.2, minZoom: 0.05 }), 30);
  }, [fitView]);

  // Structure changed -> re-flow (dagre) + animate camera. Otherwise just refresh data.
  useEffect(() => {
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
          data: makeData(board, id, view),
        }))
      );

      // persist computed positions only when we actually recomputed them
      // (guarded: same signature -> no reflow loop). Skip when we reused
      // already-stored positions to avoid a redundant render.
      if (!usedStored) dispatch({ type: "setPositions", positions: pos });

      // animate node motion, then fit the camera
      wrapRef.current?.classList.add("animating");
      window.setTimeout(() => wrapRef.current?.classList.remove("animating"), 380);
      runFit();
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
          return { ...n, data: makeData(board, n.id, view), position: stored ?? n.position };
        })
      );
    }
  }, [board, dispatch, setNodes, runFit, view]);

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
        onNodeClick={(_e, node) => onNodeFocus(node.id)}
        fitView
        minZoom={0.05}
        maxZoom={2}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
      >
        <Panel position="top-right" className="canvas-panel">
          <button className="tbtn" onClick={tidy}>
            Tidy up
          </button>
          <button className="tbtn" onClick={runFit}>
            Fit
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
        </Panel>
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="var(--dots)" />
        <MiniMap pannable zoomable nodeColor={(n) => (n.data as BlockNodeData).color ?? "var(--edge)"} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

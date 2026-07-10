import { useCallback, useEffect, useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useBoard } from "../board/store";
import type { Board, ID } from "../board/types";

type WalkMode = "depth" | "breadth";

interface Step {
  id: ID;
  depth: number; // 1 = top-level pillar, 2 = its children, etc.
}

/** Depth-first order: a node's children are visited immediately after it,
 *  before its next sibling. Root itself is excluded -- presentation starts
 *  at the pillars. Order matches the canvas (top-to-bottom by y), not raw
 *  childIds order. */
function buildDepthFirstSteps(board: Board): Step[] {
  const steps: Step[] = [];
  const yOf = (id: ID) => board.blocks[id]?.y ?? Number.POSITIVE_INFINITY;
  const walk = (id: ID, depth: number) => {
    steps.push({ id, depth });
    const kids = [...(board.blocks[id]?.childIds ?? [])].sort((a, b) => yOf(a) - yOf(b));
    for (const k of kids) walk(k, depth + 1);
  };
  const topLevel = [...(board.blocks[board.rootId]?.childIds ?? [])].sort((a, b) => yOf(a) - yOf(b));
  for (const id of topLevel) walk(id, 1);
  return steps;
}

/** Breadth-first order: every node at depth 1, then every node at depth 2,
 *  etc. -- so you see everything at a level (across all pillars) before
 *  drilling deeper. A stable sort of the depth-first list by depth, which
 *  keeps each pillar's items grouped together within a level. */
function toBreadthFirst(depthFirstSteps: Step[]): Step[] {
  const maxDepth = depthFirstSteps.reduce((m, s) => Math.max(m, s.depth), 1);
  const out: Step[] = [];
  for (let d = 1; d <= maxDepth; d++) {
    for (const s of depthFirstSteps) if (s.depth === d) out.push(s);
  }
  return out;
}

/** Full-screen step-through of the tree for review meetings. Next/Prev walk
 *  every node in either depth-first order (drill into each branch fully
 *  before moving to the next pillar) or breadth-first order (see everything
 *  at one level before going deeper); a level selector jumps straight to a
 *  chosen depth. */
export function Present({ onExit }: { onExit: () => void }) {
  const { board, dispatch } = useBoard();
  const { fitView } = useReactFlow();
  const [mode, setMode] = useState<WalkMode>("depth");
  const depthSteps = useMemo(() => buildDepthFirstSteps(board), [board]);
  const steps = useMemo(
    () => (mode === "depth" ? depthSteps : toBreadthFirst(depthSteps)),
    [mode, depthSteps]
  );
  const maxDepth = useMemo(() => steps.reduce((m, s) => Math.max(m, s.depth), 1), [steps]);

  // Track the current NODE (not just an index): stays valid across a mode
  // switch (which reorders `steps`) or the tree changing mid-presentation.
  const [currentId, setCurrentId] = useState<ID | null>(null);
  const i = useMemo(() => {
    if (currentId == null) return 0;
    const idx = steps.findIndex((s) => s.id === currentId);
    return idx === -1 ? 0 : idx;
  }, [steps, currentId]);

  const show = useCallback(
    (idx: number) => {
      const step = steps[idx];
      if (!step) return;
      setCurrentId(step.id);
      dispatch({ type: "expandTo", id: step.id }); // reveal this node + its own direct children
      const kids = board.blocks[step.id]?.childIds ?? [];
      setTimeout(
        () =>
          fitView({
            nodes: [{ id: step.id }, ...kids.map((k) => ({ id: k }))],
            duration: 600,
            padding: 0.35,
            maxZoom: 1.3,
          }),
        140
      );
    },
    [steps, board, dispatch, fitView]
  );

  const go = useCallback(
    (delta: number) => {
      const next = Math.min(steps.length - 1, Math.max(0, i + delta));
      show(next);
    },
    [steps.length, i, show]
  );

  const jumpToLevel = useCallback(
    (depth: number) => {
      const idx = steps.findIndex((s) => s.depth === depth);
      if (idx !== -1) show(idx);
    },
    [steps, show]
  );

  // initial framing + keyboard controls
  useEffect(() => {
    show(0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") go(1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = steps[i] ? board.blocks[steps[i].id] : undefined;

  return (
    <div className="present-bar" role="dialog" aria-label="Present mode">
      <button className="tbtn" onClick={() => go(-1)} disabled={i === 0}>
        ‹ Prev
      </button>
      <div className="present-title">
        <span className="present-dot" style={{ background: current?.color ?? "var(--edge)" }} />
        <strong>{current?.text ?? "—"}</strong>
        <span className="present-count">
          {steps.length ? i + 1 : 0} / {steps.length}
        </span>
      </div>
      <button className="tbtn" onClick={() => go(1)} disabled={i >= steps.length - 1}>
        Next ›
      </button>
      <select
        className="filter-select"
        value={mode}
        title="Depth-first drills into each branch fully before the next pillar; breadth-first shows a whole level before going deeper"
        onChange={(e) => setMode(e.target.value as WalkMode)}
      >
        <option value="depth">Depth-first</option>
        <option value="breadth">Breadth-first</option>
      </select>
      {maxDepth > 1 && (
        <select
          className="filter-select"
          value=""
          title="Jump to a level"
          onChange={(e) => {
            const v = e.target.value;
            if (v) jumpToLevel(Number(v));
            e.target.value = "";
          }}
        >
          <option value="">Jump to level…</option>
          {Array.from({ length: maxDepth }, (_, k) => k + 1).map((d) => (
            <option key={d} value={d}>
              Level {d}
            </option>
          ))}
        </select>
      )}
      <button className="tbtn danger" onClick={onExit} title="Exit (Esc)">
        Exit
      </button>
    </div>
  );
}

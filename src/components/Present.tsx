import { useCallback, useEffect, useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useBoard } from "../board/store";

/** Full-screen step-through of the top-level pillars for review meetings. */
export function Present({ onExit }: { onExit: () => void }) {
  const { board, dispatch } = useBoard();
  const { fitView } = useReactFlow();
  // Order pillars top-to-bottom to match the canvas (not raw child order).
  const pillars = useMemo(() => {
    const ids = board.blocks[board.rootId]?.childIds ?? [];
    const yOf = (id: string) => board.blocks[id]?.y ?? Number.POSITIVE_INFINITY;
    return [...ids].sort((a, b) => yOf(a) - yOf(b));
  }, [board]);
  const [i, setI] = useState(0);

  const show = useCallback(
    (idx: number) => {
      const id = pillars[idx];
      if (!id) return;
      dispatch({ type: "expandTo", id }); // expand the pillar + ancestors
      const kids = board.blocks[id]?.childIds ?? [];
      setTimeout(
        () =>
          fitView({
            nodes: [{ id }, ...kids.map((k) => ({ id: k }))],
            duration: 600,
            padding: 0.35,
            maxZoom: 1.3,
          }),
        140
      );
    },
    [pillars, board, dispatch, fitView]
  );

  const go = useCallback(
    (delta: number) => {
      setI((prev) => {
        const next = Math.min(pillars.length - 1, Math.max(0, prev + delta));
        show(next);
        return next;
      });
    },
    [pillars.length, show]
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

  const current = board.blocks[pillars[i]];

  return (
    <div className="present-bar" role="dialog" aria-label="Present mode">
      <button className="tbtn" onClick={() => go(-1)} disabled={i === 0}>
        ‹ Prev
      </button>
      <div className="present-title">
        <span className="present-dot" style={{ background: current?.color ?? "var(--edge)" }} />
        <strong>{current?.text ?? "—"}</strong>
        <span className="present-count">
          {pillars.length ? i + 1 : 0} / {pillars.length}
        </span>
      </div>
      <button className="tbtn" onClick={() => go(1)} disabled={i >= pillars.length - 1}>
        Next ›
      </button>
      <button className="tbtn danger" onClick={onExit} title="Exit (Esc)">
        Exit
      </button>
    </div>
  );
}

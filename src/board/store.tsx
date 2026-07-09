import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import { STORAGE_KEY, nextCategoryColor, type Block, type Board, type ID } from "./types";

// ---------- helpers ----------

function uid(): ID {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function makeBlock(parentId: ID | null, text: string, color: string | null): Block {
  return { id: uid(), parentId, text, color, childIds: [], collapsed: false };
}

/**
 * Color for a new node under `parent`:
 * - top-level category (parent is root) -> a unique generated color, distinct
 *   from every existing top-level category;
 * - deeper node -> inherit the parent's (category) color.
 */
function newNodeColor(blocks: Record<ID, Block>, parent: Block): string | null {
  if (parent.parentId === null) {
    const used = parent.childIds.map((id) => blocks[id]?.color ?? null);
    return nextCategoryColor(used);
  }
  return parent.color;
}

/** A small starter tree so the board isn't empty on first load. */
export function seedBoard(): Board {
  const root = makeBlock(null, "Board", null);
  const blocks: Record<ID, Block> = { [root.id]: root };

  const mk = (parentId: ID, text: string, color: string | null): Block => {
    const b = makeBlock(parentId, text, color);
    blocks[b.id] = b;
    blocks[parentId].childIds.push(b.id);
    return b;
  };

  const a = mk(root.id, "Category A", nextCategoryColor([]));
  const bc = mk(root.id, "Category B", nextCategoryColor([a.color]));
  const cc = mk(root.id, "Category C", nextCategoryColor([a.color, bc.color]));

  mk(a.id, "A · item 1", a.color);
  const a2 = mk(a.id, "A · item 2", a.color);
  mk(a2.id, "A · 2 · detail", a.color);
  mk(bc.id, "B · item 1", bc.color);
  mk(bc.id, "B · item 2", bc.color);
  mk(cc.id, "C · item 1", cc.color);

  // Start with categories collapsed so expanding them is the first interaction.
  blocks[a.id].collapsed = true;
  blocks[bc.id].collapsed = true;
  blocks[cc.id].collapsed = true;
  blocks[a2.id].collapsed = true;

  return { version: 3, rootId: root.id, blocks, members: [] };
}

/** Collect a node and all its descendants. */
export function descendantIds(blocks: Record<ID, Block>, id: ID): ID[] {
  const out: ID[] = [];
  const walk = (cur: ID) => {
    out.push(cur);
    for (const c of blocks[cur]?.childIds ?? []) walk(c);
  };
  walk(id);
  return out;
}

// ---------- persistence + migration ----------

function migrate(parsed: any): Board | null {
  if (!parsed || typeof parsed !== "object") return null;
  let b: any = parsed;
  // v1 -> v2: add collapsed, bump version.
  if (b.version === 1 && b.blocks && b.rootId) {
    const blocks: Record<ID, Block> = {};
    for (const [id, blk] of Object.entries<any>(b.blocks)) {
      blocks[id] = {
        id: blk.id,
        parentId: blk.parentId ?? null,
        text: String(blk.text ?? ""),
        color: blk.color ?? null,
        childIds: Array.isArray(blk.childIds) ? blk.childIds : [],
        collapsed: false,
      };
    }
    b = { version: 2, rootId: b.rootId, blocks };
  }
  // v2 -> v3: content fields are all optional, so just bump the version.
  if (b.version === 2 && b.blocks && b.rootId) {
    b = { ...b, version: 3 };
  }
  if (isValidBoard(b)) return b;
  return null;
}

function loadBoard(): Board {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const b = migrate(JSON.parse(raw));
      if (b) return b;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return seedBoard();
}

export function isValidBoard(x: unknown): x is Board {
  if (!x || typeof x !== "object") return false;
  const b = x as Partial<Board>;
  if (b.version !== 3 || typeof b.rootId !== "string" || !b.blocks) return false;
  const blocks = b.blocks as Record<string, unknown>;
  if (!blocks[b.rootId]) return false;
  return Object.values(blocks).every((blk) => {
    const v = blk as Partial<Block>;
    return (
      v &&
      typeof v.id === "string" &&
      (v.parentId === null || typeof v.parentId === "string") &&
      typeof v.text === "string" &&
      (v.color === null || typeof v.color === "string") &&
      Array.isArray(v.childIds)
    );
  });
}

/** Accept v1/v2/v3 on import; returns a migrated v3 board or null. */
export function parseImported(x: unknown): Board | null {
  return migrate(x);
}

// ---------- reducer ----------

export type Action =
  | { type: "addChild"; parentId: ID; text?: string }
  | { type: "addSibling"; siblingId: ID }
  | { type: "editText"; id: ID; text: string }
  | { type: "setColor"; id: ID; color: string | null }
  | { type: "patchBlock"; id: ID; patch: Partial<Omit<Block, "id" | "parentId" | "childIds">> }
  | { type: "vote"; id: ID; delta: number }
  | { type: "reorderChildren"; parentId: ID; orderedIds: ID[] }
  | { type: "addMember"; name: string }
  | { type: "delete"; id: ID }
  | { type: "toggleCollapse"; id: ID }
  | { type: "expandTo"; id: ID }
  | { type: "expandAll" }
  | { type: "collapseAll" }
  | { type: "collapseToDepth"; depth: number }
  | { type: "moveNode"; id: ID; x: number; y: number }
  | { type: "setPositions"; positions: Record<ID, { x: number; y: number }> }
  | { type: "import"; board: Board }
  | { type: "reset" }
  | { type: "undo" }
  | { type: "redo" };

function reducer(state: Board, action: Action): Board {
  switch (action.type) {
    case "addChild": {
      const parent = state.blocks[action.parentId];
      if (!parent) return state;
      const child = makeBlock(
        action.parentId,
        action.text ?? "New block",
        newNodeColor(state.blocks, parent)
      );
      // spawn near parent so it's visible before the reflow
      child.x = (parent.x ?? 0) + 300;
      child.y = (parent.y ?? 0) + parent.childIds.length * 40;
      return {
        ...state,
        blocks: {
          ...state.blocks,
          [child.id]: child,
          [parent.id]: {
            ...parent,
            collapsed: false,
            childIds: [...parent.childIds, child.id],
          },
        },
      };
    }

    case "addSibling": {
      const sib = state.blocks[action.siblingId];
      if (!sib || sib.parentId == null) return state;
      const parent = state.blocks[sib.parentId];
      const child = makeBlock(parent.id, "New block", newNodeColor(state.blocks, parent));
      const idx = parent.childIds.indexOf(sib.id);
      const childIds = [...parent.childIds];
      childIds.splice(idx + 1, 0, child.id);
      return {
        ...state,
        blocks: {
          ...state.blocks,
          [child.id]: child,
          [parent.id]: { ...parent, childIds },
        },
      };
    }

    case "editText": {
      const b = state.blocks[action.id];
      if (!b) return state;
      return { ...state, blocks: { ...state.blocks, [b.id]: { ...b, text: action.text } } };
    }

    case "setColor": {
      const b = state.blocks[action.id];
      if (!b) return state;
      return { ...state, blocks: { ...state.blocks, [b.id]: { ...b, color: action.color } } };
    }

    case "patchBlock": {
      const b = state.blocks[action.id];
      if (!b) return state;
      return { ...state, blocks: { ...state.blocks, [b.id]: { ...b, ...action.patch } } };
    }

    case "vote": {
      const b = state.blocks[action.id];
      if (!b) return state;
      const votes = Math.max(0, (b.votes ?? 0) + action.delta);
      return { ...state, blocks: { ...state.blocks, [b.id]: { ...b, votes } } };
    }

    case "reorderChildren": {
      const parent = state.blocks[action.parentId];
      if (!parent) return state;
      // Accept only a permutation of the existing children.
      const current = parent.childIds;
      const set = new Set(current);
      if (
        action.orderedIds.length !== current.length ||
        !action.orderedIds.every((id) => set.has(id))
      )
        return state;
      return {
        ...state,
        blocks: { ...state.blocks, [parent.id]: { ...parent, childIds: action.orderedIds } },
      };
    }

    case "addMember": {
      const name = action.name.trim();
      if (!name) return state;
      const members = state.members ?? [];
      if (members.some((m) => m.name.toLowerCase() === name.toLowerCase())) return state;
      const member = { id: uid(), name, color: nextCategoryColor(members.map((m) => m.color)) };
      return { ...state, members: [...members, member] };
    }

    case "delete": {
      const target = state.blocks[action.id];
      if (!target || target.parentId == null) return state; // never delete root
      const doomed = new Set(descendantIds(state.blocks, action.id));
      const blocks: Record<ID, Block> = {};
      for (const [id, blk] of Object.entries(state.blocks)) {
        if (!doomed.has(id)) blocks[id] = blk;
      }
      const parent = blocks[target.parentId];
      if (parent) {
        blocks[parent.id] = {
          ...parent,
          childIds: parent.childIds.filter((c) => c !== action.id),
        };
      }
      return { ...state, blocks };
    }

    case "toggleCollapse": {
      const b = state.blocks[action.id];
      if (!b || b.childIds.length === 0) return state;
      return {
        ...state,
        blocks: { ...state.blocks, [b.id]: { ...b, collapsed: !b.collapsed } },
      };
    }

    case "expandTo": {
      // expand the node itself and every ancestor so its children are visible
      const blocks = { ...state.blocks };
      let cur: Block | undefined = state.blocks[action.id];
      while (cur) {
        if (blocks[cur.id].collapsed) blocks[cur.id] = { ...blocks[cur.id], collapsed: false };
        cur = cur.parentId ? state.blocks[cur.parentId] : undefined;
      }
      return { ...state, blocks };
    }

    case "expandAll": {
      const blocks: Record<ID, Block> = {};
      for (const [id, b] of Object.entries(state.blocks))
        blocks[id] = b.collapsed ? { ...b, collapsed: false } : b;
      return { ...state, blocks };
    }

    case "collapseAll": {
      // Collapse every node that has children, except the root, so the top
      // level stays visible and each branch is collapsed.
      const blocks: Record<ID, Block> = {};
      for (const [id, b] of Object.entries(state.blocks)) {
        const shouldCollapse = id !== state.rootId && b.childIds.length > 0;
        blocks[id] = shouldCollapse && !b.collapsed ? { ...b, collapsed: true } : b;
      }
      return { ...state, blocks };
    }

    case "collapseToDepth": {
      // Show levels 0..depth: a node with children collapses when its own depth
      // is >= depth; shallower nodes are expanded. Root is depth 0.
      const depthOf: Record<ID, number> = {};
      const walk = (id: ID, dep: number) => {
        depthOf[id] = dep;
        for (const c of state.blocks[id]?.childIds ?? []) walk(c, dep + 1);
      };
      walk(state.rootId, 0);
      const blocks: Record<ID, Block> = {};
      for (const [id, b] of Object.entries(state.blocks)) {
        if (b.childIds.length === 0) {
          blocks[id] = b;
          continue;
        }
        const shouldCollapse = depthOf[id] >= action.depth;
        blocks[id] = b.collapsed !== shouldCollapse ? { ...b, collapsed: shouldCollapse } : b;
      }
      return { ...state, blocks };
    }

    case "moveNode": {
      const b = state.blocks[action.id];
      if (!b) return state;
      return {
        ...state,
        blocks: { ...state.blocks, [b.id]: { ...b, x: action.x, y: action.y } },
      };
    }

    case "setPositions": {
      const blocks = { ...state.blocks };
      for (const [id, p] of Object.entries(action.positions)) {
        if (blocks[id]) blocks[id] = { ...blocks[id], x: p.x, y: p.y };
      }
      return { ...state, blocks };
    }

    case "import":
      return action.board;

    case "reset":
      return seedBoard();

    default:
      return state;
  }
}

// ---------- undo/redo history ----------

/** Layout-only actions must not create undo entries (they'd spam history). */
const TRANSIENT: ReadonlySet<Action["type"]> = new Set(["setPositions", "moveNode"]);
const HISTORY_CAP = 50;

interface History {
  past: Board[];
  present: Board;
  future: Board[];
}

function historyReducer(state: History, action: Action): History {
  if (action.type === "undo") {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    return {
      past: state.past.slice(0, -1),
      present: previous,
      future: [state.present, ...state.future],
    };
  }
  if (action.type === "redo") {
    if (state.future.length === 0) return state;
    const next = state.future[0];
    return {
      past: [...state.past, state.present],
      present: next,
      future: state.future.slice(1),
    };
  }

  const nextPresent = reducer(state.present, action);
  if (nextPresent === state.present) return state; // no-op, don't touch history

  if (TRANSIENT.has(action.type)) {
    // Update the board but leave undo history untouched.
    return { ...state, present: nextPresent };
  }

  const past = [...state.past, state.present];
  if (past.length > HISTORY_CAP) past.shift();
  return { past, present: nextPresent, future: [] };
}

// ---------- context ----------

interface Store {
  board: Board;
  dispatch: React.Dispatch<Action>;
  canUndo: boolean;
  canRedo: boolean;
  saved: boolean;
}

const BoardContext = createContext<Store | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(historyReducer, undefined, () => ({
    past: [],
    present: loadBoard(),
    future: [],
  }));
  const board = state.present;
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    setSaved(false);
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
        setSaved(true);
      } catch {
        /* storage unavailable */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [board]);

  return (
    <BoardContext.Provider
      value={{
        board,
        dispatch,
        canUndo: state.past.length > 0,
        canRedo: state.future.length > 0,
        saved,
      }}
    >
      {children}
    </BoardContext.Provider>
  );
}

export function useBoard(): Store {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be used within BoardProvider");
  return ctx;
}

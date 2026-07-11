import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ACTIVE_KEY,
  INDEX_KEY,
  STORAGE_KEY,
  boardContentKey,
  newBoardId,
  nextCategoryColor,
  type Block,
  type Board,
  type BoardIndexEntry,
  type BoardKind,
  type Card,
  type ID,
  type TemplateId,
  type TreeBoard,
  type WhiteboardBoard,
} from "./types";

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
export function seedBoard(): TreeBoard {
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

  return { version: 3, kind: "tree", rootId: root.id, blocks, members: [] };
}

/** Builds a board from a flat list of top-level categories (each optionally
 *  with a few starter children), auto-assigning each category its own
 *  generated color the same way manual category creation does. */
function seedTree(rootText: string, categories: { text: string; children?: string[] }[]): TreeBoard {
  const root = makeBlock(null, rootText, null);
  const blocks: Record<ID, Block> = { [root.id]: root };

  const mk = (parentId: ID, text: string, color: string | null): Block => {
    const b = makeBlock(parentId, text, color);
    blocks[b.id] = b;
    blocks[parentId].childIds.push(b.id);
    return b;
  };

  const used: (string | null)[] = [];
  for (const cat of categories) {
    const color = nextCategoryColor(used);
    used.push(color);
    const catBlock = mk(root.id, cat.text, color);
    for (const childText of cat.children ?? []) mk(catBlock.id, childText, color);
  }

  return { version: 3, kind: "tree", rootId: root.id, blocks, members: [] };
}

/** Just a root node — for users who want to build their own structure. */
export function seedBlank(): TreeBoard {
  const root = makeBlock(null, "Board", null);
  return { version: 3, kind: "tree", rootId: root.id, blocks: { [root.id]: root }, members: [] };
}

export function seedSWOT(): TreeBoard {
  return seedTree("SWOT Analysis", [
    { text: "Strengths" },
    { text: "Weaknesses" },
    { text: "Opportunities" },
    { text: "Threats" },
  ]);
}

export function seedFeatureBrainstorm(): TreeBoard {
  return seedTree("Feature Brainstorm", [{ text: "Now" }, { text: "Next" }, { text: "Later" }]);
}

export function seedRetro(): TreeBoard {
  return seedTree("Retro", [
    { text: "What went well" },
    { text: "What didn't go well" },
    { text: "Action items" },
  ]);
}

export function seedOKRTree(): TreeBoard {
  return seedTree("OKR Tree", [
    { text: "Objective 1", children: ["Key Result 1", "Key Result 2", "Key Result 3"] },
    { text: "Objective 2", children: ["Key Result 1", "Key Result 2"] },
  ]);
}

/** New-board template dispatch. Deliberately separate from `seedBoard()`
 *  (the generic demo tree), which stays reserved for first-run / corrupt-data
 *  recovery / "reset" — none of which should suddenly become a SWOT board. */
export function seedForTemplate(id: TemplateId): TreeBoard {
  switch (id) {
    case "swot":
      return seedSWOT();
    case "feature":
      return seedFeatureBrainstorm();
    case "retro":
      return seedRetro();
    case "okr":
      return seedOKRTree();
    case "blank":
    default:
      return seedBlank();
  }
}

/** Blank freeform whiteboard — no starter cards, no templates in v1. */
export function seedWhiteboard(): WhiteboardBoard {
  return { version: 3, kind: "whiteboard", cards: {}, members: [] };
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
  // Legacy tree boards (pre-whiteboard-kind) never stored a `kind` field —
  // normalize so every board flowing past this point is fully discriminated.
  if (b.version === 3 && b.blocks && b.rootId && b.kind === undefined) {
    b = { ...b, kind: "tree" };
  }
  if (isValidBoard(b)) return b;
  return null;
}

function isValidTreeBoard(x: unknown): x is TreeBoard {
  if (!x || typeof x !== "object") return false;
  const b = x as Partial<TreeBoard>;
  if (b.version !== 3 || b.kind !== "tree" || typeof b.rootId !== "string" || !b.blocks) return false;
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

function isValidWhiteboardBoard(x: unknown): x is WhiteboardBoard {
  if (!x || typeof x !== "object") return false;
  const b = x as Partial<WhiteboardBoard>;
  if (b.version !== 3 || b.kind !== "whiteboard" || !b.cards || typeof b.cards !== "object") return false;
  return Object.values(b.cards as Record<string, unknown>).every((crd) => {
    const v = crd as Partial<Card>;
    return (
      v &&
      typeof v.id === "string" &&
      typeof v.x === "number" &&
      typeof v.y === "number" &&
      typeof v.width === "number" &&
      typeof v.height === "number" &&
      typeof v.text === "string" &&
      (v.color === null || typeof v.color === "string")
    );
  });
}

export function isValidBoard(x: unknown): x is Board {
  return isValidTreeBoard(x) || isValidWhiteboardBoard(x);
}

/** Accept v1/v2/v3 on import; returns a migrated v3 board or null. */
export function parseImported(x: unknown): Board | null {
  return migrate(x);
}

// ---------- multi-board registry ----------

function loadBoardContent(id: ID): Board {
  try {
    const raw = localStorage.getItem(boardContentKey(id));
    if (raw) {
      const b = migrate(JSON.parse(raw));
      if (b) return b;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return seedBoard();
}

function persistIndex(index: BoardIndexEntry[]) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* storage unavailable */
  }
}

/** Writes `board` under its own key, and creates a fresh, unsynced index entry for it. */
function freshBoardEntry(board: Board): { entry: BoardIndexEntry; id: ID } {
  const id = newBoardId();
  const now = new Date().toISOString();
  localStorage.setItem(boardContentKey(id), JSON.stringify(board));
  const entry: BoardIndexEntry = {
    id,
    name: board.kind === "tree" ? board.blocks[board.rootId]?.text || "Board" : "Board",
    manualName: false,
    createdAt: now,
    updatedAt: now,
    cloudStatus: "local",
    ownerEmail: null,
    kind: board.kind,
  };
  return { entry, id };
}

/** One-time migration from the legacy single-board key to the multi-board
 *  registry. Guarded: only ever builds a fresh registry when none exists yet
 *  (or is corrupt/empty), so it can never clobber real data. The legacy key
 *  is left in place afterward — nothing reads it again, but it's cheap insurance. */
function migrateToIndex(): BoardIndexEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as BoardIndexEntry[];
    }
  } catch {
    /* fall through to rebuild */
  }
  let legacyBoard: Board | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) legacyBoard = migrate(JSON.parse(raw));
  } catch {
    /* ignore corrupt storage */
  }
  const { entry, id } = freshBoardEntry(legacyBoard ?? seedBoard());
  const index = [entry];
  persistIndex(index);
  localStorage.setItem(ACTIVE_KEY, id);
  return index;
}

/** Persists `board` under `id`'s key and bumps its index entry (name — unless
 *  manually renamed — and updatedAt). Returns whether the write succeeded. */
function persistBoardContent(
  id: ID,
  board: Board,
  setIndex: React.Dispatch<React.SetStateAction<BoardIndexEntry[]>>
): boolean {
  try {
    localStorage.setItem(boardContentKey(id), JSON.stringify(board));
  } catch {
    return false;
  }
  setIndex((idx) => {
    const i = idx.findIndex((e) => e.id === id);
    if (i === -1) return idx;
    const entry = idx[i];
    const rootText = board.kind === "tree" ? board.blocks[board.rootId]?.text || entry.name : entry.name;
    const next = [...idx];
    next[i] = {
      ...entry,
      name: entry.manualName ? entry.name : rootText,
      updatedAt: new Date().toISOString(),
    };
    persistIndex(next);
    return next;
  });
  return true;
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
  | { type: "addCard"; x: number; y: number }
  | { type: "editCardText"; id: ID; text: string }
  | { type: "patchCard"; id: ID; patch: Partial<Omit<Card, "id">> }
  | { type: "moveCard"; id: ID; x: number; y: number }
  | { type: "resizeCard"; id: ID; width: number; height: number }
  | { type: "deleteCard"; id: ID }
  | { type: "duplicateCard"; id: ID }
  | { type: "import"; board: Board }
  | { type: "reset" }
  | { type: "undo" }
  | { type: "redo" };

function treeReducer(state: TreeBoard, action: Action): TreeBoard {
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

    default:
      return state;
  }
}

function makeCard(x: number, y: number, color: string | null): Card {
  return { id: uid(), x, y, width: 240, height: 160, text: "", color };
}

function whiteboardReducer(state: WhiteboardBoard, action: Action): WhiteboardBoard {
  switch (action.type) {
    case "addCard": {
      const color = nextCategoryColor(Object.values(state.cards).map((c) => c.color));
      const card = makeCard(action.x, action.y, color);
      return { ...state, cards: { ...state.cards, [card.id]: card } };
    }

    case "editCardText": {
      const c = state.cards[action.id];
      if (!c) return state;
      return { ...state, cards: { ...state.cards, [c.id]: { ...c, text: action.text } } };
    }

    case "patchCard": {
      const c = state.cards[action.id];
      if (!c) return state;
      return { ...state, cards: { ...state.cards, [c.id]: { ...c, ...action.patch } } };
    }

    case "moveCard": {
      const c = state.cards[action.id];
      if (!c) return state;
      return { ...state, cards: { ...state.cards, [c.id]: { ...c, x: action.x, y: action.y } } };
    }

    case "resizeCard": {
      const c = state.cards[action.id];
      if (!c) return state;
      return {
        ...state,
        cards: { ...state.cards, [c.id]: { ...c, width: action.width, height: action.height } },
      };
    }

    case "deleteCard": {
      if (!state.cards[action.id]) return state;
      const cards = { ...state.cards };
      delete cards[action.id];
      return { ...state, cards };
    }

    case "duplicateCard": {
      const c = state.cards[action.id];
      if (!c) return state;
      const copy: Card = { ...c, id: uid(), x: c.x + 24, y: c.y + 24 };
      return { ...state, cards: { ...state.cards, [copy.id]: copy } };
    }

    case "addMember": {
      const name = action.name.trim();
      if (!name) return state;
      const members = state.members ?? [];
      if (members.some((m) => m.name.toLowerCase() === name.toLowerCase())) return state;
      const member = { id: uid(), name, color: nextCategoryColor(members.map((m) => m.color)) };
      return { ...state, members: [...members, member] };
    }

    default:
      return state;
  }
}

/** Top-level dispatch by board kind. `import`/`reset` are handled here (not
 *  in either kind-specific reducer) because import can change the kind
 *  itself — it must not be constrained to returning the current kind. */
function reducer(state: Board, action: Action): Board {
  if (action.type === "import") return action.board;
  if (action.type === "reset") return state.kind === "whiteboard" ? seedWhiteboard() : seedBoard();
  return state.kind === "whiteboard" ? whiteboardReducer(state, action) : treeReducer(state, action);
}

// ---------- undo/redo history ----------

/** Layout-only actions must not create undo entries (they'd spam history). */
const TRANSIENT: ReadonlySet<Action["type"]> = new Set([
  "setPositions",
  "moveNode",
  "moveCard",
  "resizeCard",
]);
const HISTORY_CAP = 50;

interface History {
  past: Board[];
  present: Board;
  future: Board[];
}

/** `loadBoard` swaps the active board wholesale (switching boards) and resets
 *  history — undo must never cross a board switch. It's a history-layer-only
 *  action: it never reaches `reducer()` and is never exposed in the public
 *  `Action` union, so none of the existing dispatch call sites need to know
 *  about it. */
type HistoryAction = Action | { type: "loadBoard"; board: Board };

function historyReducer(state: History, action: HistoryAction): History {
  if (action.type === "loadBoard") {
    return { past: [], present: action.board, future: [] };
  }
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
  /** True for anonymous read-only share links (?board=&view=1). When true,
   *  `dispatch` above is a no-op -- every UI affordance stays wired up but
   *  can't actually mutate the board, so there's nowhere edit access could
   *  leak in from a missed button. */
  viewOnly: boolean;

  boards: BoardIndexEntry[];
  currentBoardId: ID;
  createBoard: (name?: string, kind?: BoardKind, templateId?: TemplateId) => ID;
  switchBoard: (id: ID) => void;
  renameBoard: (id: ID, name: string) => void;
  duplicateBoard: (id: ID) => ID;
  deleteBoard: (id: ID, opts: { alsoDeleteShared: boolean }) => void;
  /** Merge point for the cloud index hook's sign-in reconcile / realtime feed. */
  setBoardsFromRemote: (rows: BoardIndexEntry[]) => void;
  markBoardCloudStatus: (id: ID, status: BoardIndexEntry["cloudStatus"], ownerEmail?: string) => void;
  /** For useCollab: apply a board that arrived from a live collaborator (initial
   *  fetch or a realtime update). Resets local undo history instead of pushing
   *  onto it — otherwise "Undo" during live collaboration pops off whatever a
   *  collaborator just typed rather than your own last edit, and could clobber
   *  their live changes if undone far enough. */
  applyRemoteBoard: (board: Board) => void;
}

const BoardContext = createContext<Store | null>(null);

export function BoardProvider({
  children,
  viewOnly = false,
}: {
  children: ReactNode;
  viewOnly?: boolean;
}) {
  const [index, setIndex] = useState<BoardIndexEntry[]>(() => migrateToIndex());
  const [currentBoardId, setCurrentBoardId] = useState<ID>(
    () => localStorage.getItem(ACTIVE_KEY) ?? index[0].id
  );

  const [state, dispatch] = useReducer(historyReducer, undefined, () => ({
    past: [],
    present: loadBoardContent(currentBoardId),
    future: [],
  }));
  const board = state.present;
  const [saved, setSaved] = useState(true);

  // Tracks which board id the reducer's `board` currently reflects, so the
  // "swap active board" effect below only fires on an actual switch.
  const loadedIdRef = useRef(currentBoardId);
  // True whenever `board` has unsaved edits not yet flushed to localStorage.
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (loadedIdRef.current === currentBoardId) return;
    loadedIdRef.current = currentBoardId;
    dispatch({ type: "loadBoard", board: loadBoardContent(currentBoardId) });
  }, [currentBoardId]);

  // Debounced persistence. Deliberately keyed only on `board` (not
  // `currentBoardId`): when switchBoard() changes currentBoardId, `board`
  // itself doesn't change until the effect above's dispatch takes effect on
  // a later render — so this effect correctly skips the in-between render
  // where currentBoardId already points at the new board but `board` still
  // holds the old board's content (which would otherwise get written under
  // the new board's key).
  useEffect(() => {
    dirtyRef.current = true;
    setSaved(false);
    const id = currentBoardId;
    saveTimerRef.current = setTimeout(() => {
      if (persistBoardContent(id, board, setIndex)) {
        dirtyRef.current = false;
        setSaved(true);
      }
    }, 250);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  const switchBoard = useCallback(
    (id: ID) => {
      if (id === currentBoardId) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (dirtyRef.current) {
        if (persistBoardContent(currentBoardId, board, setIndex)) dirtyRef.current = false;
      }
      localStorage.setItem(ACTIVE_KEY, id);
      setCurrentBoardId(id);
    },
    [currentBoardId, board]
  );

  const createBoard = useCallback((name?: string, kind: BoardKind = "tree", templateId?: TemplateId): ID => {
    const seeded = kind === "whiteboard" ? seedWhiteboard() : seedForTemplate(templateId ?? "blank");
    const { entry, id } = freshBoardEntry(seeded);
    const trimmed = name?.trim();
    const finalEntry = trimmed ? { ...entry, name: trimmed, manualName: true } : entry;
    setIndex((idx) => {
      const next = [...idx, finalEntry];
      persistIndex(next);
      return next;
    });
    localStorage.setItem(ACTIVE_KEY, id);
    setCurrentBoardId(id);
    return id;
  }, []);

  const renameBoard = useCallback((id: ID, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setIndex((idx) => {
      const next = idx.map((e) =>
        e.id === id ? { ...e, name: trimmed, manualName: true, updatedAt: new Date().toISOString() } : e
      );
      persistIndex(next);
      return next;
    });
  }, []);

  const duplicateBoard = useCallback(
    (id: ID): ID => {
      const content = loadBoardContent(id);
      const cloned: Board = JSON.parse(JSON.stringify(content));
      const source = index.find((e) => e.id === id);
      const { entry, id: newId } = freshBoardEntry(cloned);
      const named: BoardIndexEntry = { ...entry, name: `${source?.name ?? "Board"} copy`, manualName: true };
      setIndex((idx) => {
        const next = [...idx, named];
        persistIndex(next);
        return next;
      });
      return newId;
    },
    [index]
  );

  const deleteBoard = useCallback(
    // alsoDeleteShared is consumed by the caller (BoardSwitcher -> useBoardIndex),
    // which deletes the cloud row separately — store.tsx stays Supabase-unaware.
    (id: ID, _opts: { alsoDeleteShared: boolean }) => {
      setIndex((idx) => {
        let next = idx.filter((e) => e.id !== id);
        if (next.length === 0) {
          const { entry } = freshBoardEntry(seedBoard());
          next = [entry];
        }
        persistIndex(next);
        if (id === currentBoardId) {
          const fallback = next[0].id;
          localStorage.setItem(ACTIVE_KEY, fallback);
          setCurrentBoardId(fallback);
        }
        return next;
      });
      localStorage.removeItem(boardContentKey(id));
    },
    [currentBoardId]
  );

  const setBoardsFromRemote = useCallback((rows: BoardIndexEntry[]) => {
    setIndex((idx) => {
      const byId = new Map(idx.map((e) => [e.id, e] as const));
      for (const row of rows) {
        const local = byId.get(row.id);
        if (!local) {
          byId.set(row.id, row);
        } else if (new Date(row.updatedAt) > new Date(local.updatedAt)) {
          byId.set(row.id, { ...local, ...row, manualName: local.manualName });
        }
      }
      const next = Array.from(byId.values());
      persistIndex(next);
      return next;
    });
  }, []);

  const markBoardCloudStatus = useCallback(
    (id: ID, status: BoardIndexEntry["cloudStatus"], ownerEmail?: string) => {
      setIndex((idx) => {
        const next = idx.map((e) =>
          e.id === id ? { ...e, cloudStatus: status, ownerEmail: ownerEmail ?? e.ownerEmail } : e
        );
        persistIndex(next);
        return next;
      });
    },
    []
  );

  const applyRemoteBoard = useCallback(
    (remoteBoard: Board) => {
      dispatch({ type: "loadBoard", board: remoteBoard });
    },
    []
  );

  // Real `dispatch` above is what applyRemoteBoard uses to apply incoming
  // live-collab updates -- that must keep working in view-only mode. Only
  // the dispatch handed to UI components (below) is neutralized.
  const noopDispatch = useCallback((() => {}) as React.Dispatch<Action>, []);

  return (
    <BoardContext.Provider
      value={{
        board,
        dispatch: viewOnly ? noopDispatch : (dispatch as React.Dispatch<Action>),
        canUndo: !viewOnly && state.past.length > 0,
        canRedo: !viewOnly && state.future.length > 0,
        saved,
        viewOnly,
        boards: index,
        currentBoardId,
        createBoard,
        switchBoard,
        renameBoard,
        duplicateBoard,
        deleteBoard,
        setBoardsFromRemote,
        markBoardCloudStatus,
        applyRemoteBoard,
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

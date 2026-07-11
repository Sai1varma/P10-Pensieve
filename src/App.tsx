import { Suspense, lazy, useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { BoardProvider, useBoard } from "./board/store";
import { Shortcuts } from "./board/Shortcuts";
import { HashImport } from "./board/HashImport";
import { CollabBar } from "./components/CollabBar";
import { useCollab } from "./collab/useCollab";
import { THEME_KEY, ME_KEY, type Theme, type ViewFilter } from "./board/types";
import { Canvas } from "./flow/Canvas";
import { Toolbar } from "./components/Toolbar";
import { WhiteboardCanvas } from "./flow/WhiteboardCanvas";
import { WhiteboardToolbar } from "./components/WhiteboardToolbar";
import { CommandPalette } from "./components/CommandPalette";
import "./index.css";

const SidePanel = lazy(() =>
  import("./components/SidePanel").then((m) => ({ default: m.SidePanel }))
);
const Present = lazy(() =>
  import("./components/Present").then((m) => ({ default: m.Present }))
);

function initialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

/** ?board=<id>&view=1 -- anonymous, read-only, no editing UI at all. */
function viewOnlyFromUrl(): boolean {
  const params = new URLSearchParams(location.search);
  return params.get("view") === "1" && !!params.get("board");
}

/** Minimal header + canvas for a view-only share link: no BoardSwitcher (this
 *  isn't the viewer's own board list), no undo/redo/export/edit affordances.
 *  Dispatch is already a global no-op in this mode (BoardProvider), so this
 *  is about not showing controls that would look interactive but do nothing. */
function ViewOnlyShell({
  theme,
  onToggleTheme,
  sharedBoardName,
  isWhiteboard,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  sharedBoardName: string | null;
  isWhiteboard: boolean;
}) {
  return (
    <>
      <header className="toolbar">
        <h1 className="brand">P10 Pensieve</h1>
        <span className="view-only-badge">👁 View only</span>
        <span className="view-only-name">{sharedBoardName ?? "Shared board"}</span>
        <div className="spacer" />
        <button className="tbtn" onClick={onToggleTheme} title="Toggle light / dark">
          {theme === "dark" ? "☀ Light" : "☾ Dark"}
        </button>
      </header>
      <div className="workspace">
        {isWhiteboard ? <WhiteboardCanvas /> : <Canvas onNodeFocus={() => {}} />}
      </div>
    </>
  );
}

/** Renders the tree (mind-map) shell: Toolbar + Canvas + SidePanel + Present. */
function TreeShell({
  theme,
  onToggleTheme,
  me,
  setMe,
  focusedId,
  setFocusedId,
  presenting,
  setPresenting,
  focusByNode,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  me: string;
  setMe: (name: string) => void;
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  presenting: boolean;
  setPresenting: (p: boolean) => void;
  focusByNode: Record<string, string[]>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ViewFilter>({});

  return (
    <>
      <Toolbar
        theme={theme}
        onToggleTheme={onToggleTheme}
        query={query}
        setQuery={setQuery}
        filter={filter}
        setFilter={setFilter}
        onPresent={() => setPresenting(true)}
        me={me}
        setMe={setMe}
      />
      <div className="workspace">
        <Canvas onNodeFocus={setFocusedId} query={query} filter={filter} focusByNode={focusByNode} />
        {focusedId && (
          <Suspense fallback={null}>
            <SidePanel
              focusedId={focusedId}
              setFocusedId={setFocusedId}
              onClose={() => setFocusedId(null)}
              me={me}
            />
          </Suspense>
        )}
      </div>
      {presenting && (
        <Suspense fallback={null}>
          <Present onExit={() => setPresenting(false)} />
        </Suspense>
      )}
    </>
  );
}

/** Renders the whiteboard shell: WhiteboardToolbar + WhiteboardCanvas. No
 *  side panel or Present mode -- freeform cards have no hierarchy to drill
 *  into or step through (see whiteboard plan's v1 non-goals). */
function WhiteboardShell({
  theme,
  onToggleTheme,
  me,
  setMe,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  me: string;
  setMe: (name: string) => void;
}) {
  return (
    <>
      <WhiteboardToolbar theme={theme} onToggleTheme={onToggleTheme} me={me} setMe={setMe} />
      <div className="workspace">
        <WhiteboardCanvas />
      </div>
    </>
  );
}

function AppShell({ viewOnly }: { viewOnly: boolean }) {
  const { board } = useBoard();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [me, setMeState] = useState<string>(() => localStorage.getItem(ME_KEY) ?? "");
  const setMe = (name: string) => {
    setMeState(name);
    if (name) localStorage.setItem(ME_KEY, name);
    else localStorage.removeItem(ME_KEY);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const onToggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  // Lifted here (rather than inside CollabBar) so Canvas can also read
  // focusByNode without opening a second realtime channel for the same board.
  const collab = useCollab(focusedId, viewOnly);

  return (
    <ReactFlowProvider>
      <Shortcuts focusedId={focusedId} setFocusedId={setFocusedId} />
      <HashImport />
      {!viewOnly && (
        <CommandPalette theme={theme} onToggleTheme={onToggleTheme} onPresent={() => setPresenting(true)} />
      )}
      <div className="app">
        {viewOnly ? (
          <ViewOnlyShell
            theme={theme}
            onToggleTheme={onToggleTheme}
            sharedBoardName={collab.sharedBoardName}
            isWhiteboard={board.kind === "whiteboard"}
          />
        ) : board.kind === "whiteboard" ? (
          <WhiteboardShell theme={theme} onToggleTheme={onToggleTheme} me={me} setMe={setMe} />
        ) : (
          <TreeShell
            theme={theme}
            onToggleTheme={onToggleTheme}
            me={me}
            setMe={setMe}
            focusedId={focusedId}
            setFocusedId={setFocusedId}
            presenting={presenting}
            setPresenting={setPresenting}
            focusByNode={collab.focusByNode}
          />
        )}
        {!viewOnly && <CollabBar collab={collab} />}
      </div>
    </ReactFlowProvider>
  );
}

export default function App() {
  const viewOnly = viewOnlyFromUrl();
  return (
    <BoardProvider viewOnly={viewOnly}>
      <AppShell viewOnly={viewOnly} />
    </BoardProvider>
  );
}

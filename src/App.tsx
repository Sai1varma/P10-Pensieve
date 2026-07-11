import { Suspense, lazy, useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { BoardProvider, useBoard } from "./board/store";
import { Shortcuts } from "./board/Shortcuts";
import { HashImport } from "./board/HashImport";
import { CollabBar } from "./components/CollabBar";
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
}: {
  theme: Theme;
  onToggleTheme: () => void;
  me: string;
  setMe: (name: string) => void;
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  presenting: boolean;
  setPresenting: (p: boolean) => void;
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
        <Canvas onNodeFocus={setFocusedId} query={query} filter={filter} />
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

function AppShell() {
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

  return (
    <ReactFlowProvider>
      <Shortcuts focusedId={focusedId} setFocusedId={setFocusedId} />
      <HashImport />
      <CommandPalette theme={theme} onToggleTheme={onToggleTheme} onPresent={() => setPresenting(true)} />
      <div className="app">
        {board.kind === "whiteboard" ? (
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
          />
        )}
        <CollabBar />
      </div>
    </ReactFlowProvider>
  );
}

export default function App() {
  return (
    <BoardProvider>
      <AppShell />
    </BoardProvider>
  );
}

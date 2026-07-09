import { Suspense, lazy, useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { BoardProvider } from "./board/store";
import { Shortcuts } from "./board/Shortcuts";
import { HashImport } from "./board/HashImport";
import { CollabBar } from "./components/CollabBar";
import { THEME_KEY, ME_KEY, type Theme, type ViewFilter } from "./board/types";
import { Canvas } from "./flow/Canvas";
import { Toolbar } from "./components/Toolbar";
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

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ViewFilter>({});
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

  return (
    <BoardProvider>
      <ReactFlowProvider>
        <Shortcuts focusedId={focusedId} setFocusedId={setFocusedId} />
        <HashImport />
        <div className="app">
          <Toolbar
            theme={theme}
            onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
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
          <CollabBar />
        </div>
      </ReactFlowProvider>
    </BoardProvider>
  );
}

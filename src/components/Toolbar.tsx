import { useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useBoard } from "../board/store";
import { toMarkdown, downloadText } from "../board/io";
import { exportJson as exportJsonShared, importJsonFile, exportPng as exportPngShared, copyShareLink as copyShareLinkShared } from "../board/exportShared";
import { STATUS_META, STATUS_ORDER, type Theme, type TreeBoard, type ViewFilter } from "../board/types";
import { BoardSwitcher } from "./BoardSwitcher";
import { InsightsPanel } from "./InsightsPanel";

export function Toolbar({
  theme,
  onToggleTheme,
  query,
  setQuery,
  filter,
  setFilter,
  onPresent,
  me,
  setMe,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  query: string;
  setQuery: (q: string) => void;
  filter: ViewFilter;
  setFilter: (f: ViewFilter) => void;
  onPresent: () => void;
  me: string;
  setMe: (name: string) => void;
}) {
  // Toolbar is only ever mounted for tree boards (App.tsx branches by board.kind).
  const { board: rawBoard, dispatch, canUndo, canRedo, saved } = useBoard();
  const board = rawBoard as TreeBoard;
  const { fitView } = useReactFlow();
  const fileRef = useRef<HTMLInputElement>(null);
  const excelRef = useRef<HTMLInputElement>(null);
  const matchIdx = useRef(0);

  // All tags across the board, for the tag filter dropdown.
  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const b of Object.values(board.blocks)) for (const t of b.tags ?? []) s.add(t);
    return Array.from(s).sort();
  }, [board]);

  const memberNames = useMemo(() => (board.members ?? []).map((m) => m.name), [board]);
  const [meDraft, setMeDraft] = useState(me);
  const commitMe = () => {
    const v = meDraft.trim();
    setMe(v);
    if (v) dispatch({ type: "addMember", name: v });
  };

  const matcher = (q: string) => {
    const needle = q.trim().toLowerCase();
    return Object.values(board.blocks).filter((b) => {
      const hay = [b.text, b.note ?? "", b.owner ?? "", ...(b.tags ?? [])].join(" ").toLowerCase();
      return needle && hay.includes(needle);
    });
  };

  const jumpToNext = () => {
    const hits = matcher(query);
    if (hits.length === 0) return;
    const b = hits[matchIdx.current % hits.length];
    matchIdx.current += 1;
    // expand ancestors so the match is visible, then center it
    dispatch({ type: "expandTo", id: b.id });
    setTimeout(() => fitView({ nodes: [{ id: b.id }], duration: 500, padding: 0.6, maxZoom: 1.4 }), 130);
  };

  const exportJson = () => exportJsonShared(board);

  const importJson = async (file: File) => {
    const parsed = await importJsonFile(file);
    if (!parsed) {
      alert("That file isn't a valid block-board export.");
      return;
    }
    dispatch({ type: "import", board: parsed });
  };

  const importExcel = async (file: File) => {
    if (!confirm("Build a new board from this Excel file? This replaces your current board.")) return;
    try {
      const { excelToBoard } = await import("../board/importExcel");
      const title = file.name.replace(/\.[^.]+$/, "") || "Imported Board";
      const board = excelToBoard(await file.arrayBuffer(), title);
      dispatch({ type: "import", board });
    } catch (err) {
      alert("Could not read that Excel file. Expected columns A=pillar, B=element, C=details.");
      console.error(err);
    }
  };

  const exportMarkdown = () => downloadText("block-board.md", toMarkdown(board), "text/markdown");

  const exportPng = () => exportPngShared();

  const copyShareLink = () => copyShareLinkShared(board);

  const filterActive = !!filter.status || !!filter.tag;
  const [menuOpen, setMenuOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the More menu on any click/tap outside it.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  return (
    <header className="toolbar">
      <h1 className="brand">P10 Pensieve</h1>
      <BoardSwitcher />
      <span className={`save-dot${saved ? " saved" : ""}`} title={saved ? "All changes saved" : "Saving…"}>
        {saved ? "Saved" : "Saving…"}
      </span>

      <div className="search-wrap">
        <input
          className="search"
          type="search"
          placeholder="Search… (Enter to jump)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            matchIdx.current = 0;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") jumpToNext();
          }}
        />
        <select
          className="filter-select"
          value={filter.status ?? ""}
          onChange={(e) => setFilter({ ...filter, status: (e.target.value || undefined) as ViewFilter["status"] })}
          title="Filter by status"
        >
          <option value="">Status: any</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
        {allTags.length > 0 && (
          <select
            className="filter-select"
            value={filter.tag ?? ""}
            onChange={(e) => setFilter({ ...filter, tag: e.target.value || undefined })}
            title="Filter by tag"
          >
            <option value="">Tag: any</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
        )}
        {filterActive && (
          <button className="tbtn" onClick={() => setFilter({})} title="Clear filters">
            Clear
          </button>
        )}
      </div>

      <div className="spacer" />
      <div className="identity" title="Your name — used for Owner attribution & presence">
        <span className="id-label">You</span>
        <input
          className="detail-input id-input"
          list="bb-members-tb"
          placeholder="your name"
          value={meDraft}
          onChange={(e) => setMeDraft(e.target.value)}
          onBlur={commitMe}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitMe();
            }
          }}
        />
        <datalist id="bb-members-tb">
          {memberNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>
      <button className="tbtn" onClick={() => dispatch({ type: "undo" })} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">
        ↶ Undo
      </button>
      <button className="tbtn" onClick={() => dispatch({ type: "redo" })} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">
        ↷ Redo
      </button>
      <button className="tbtn" onClick={onToggleTheme} title="Toggle light / dark">
        {theme === "dark" ? "☀ Light" : "☾ Dark"}
      </button>
      <button className="tbtn" onClick={onPresent} title="Step through pillars">
        ▶ Present
      </button>
      <button className="tbtn" onClick={() => setInsightsOpen(true)} title="Board insights">
        📊 Insights
      </button>
      <div className="menu" ref={menuRef}>
        <button className="tbtn" onClick={() => setMenuOpen((o) => !o)} title="More actions">
          More ▾
        </button>
        {menuOpen && (
          <div className="menu-list" role="menu">
            <button className="menu-item" onClick={() => { copyShareLink(); setMenuOpen(false); }}>
              Export as link
            </button>
            <div className="menu-sep" />
            <button className="menu-item" onClick={() => { exportJson(); setMenuOpen(false); }}>
              Export JSON
            </button>
            <button className="menu-item" onClick={() => { exportMarkdown(); setMenuOpen(false); }}>
              Export Markdown
            </button>
            <button className="menu-item" onClick={() => { exportPng(); setMenuOpen(false); }}>
              Export PNG
            </button>
            <button className="menu-item" onClick={() => { fileRef.current?.click(); setMenuOpen(false); }}>
              Import JSON…
            </button>
            <button className="menu-item" onClick={() => { excelRef.current?.click(); setMenuOpen(false); }}>
              Import Excel…
            </button>
            <div className="menu-sep" />
            <button
              className="menu-item danger"
              onClick={() => {
                if (confirm("Reset the board to the starter tree?")) dispatch({ type: "reset" });
                setMenuOpen(false);
              }}
            >
              Reset board
            </button>
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importJson(f);
          e.target.value = "";
        }}
      />
      <input
        ref={excelRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importExcel(f);
          e.target.value = "";
        }}
      />
      {insightsOpen && <InsightsPanel onClose={() => setInsightsOpen(false)} />}
    </header>
  );
}

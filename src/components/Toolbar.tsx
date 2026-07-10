import { useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useBoard, parseImported } from "../board/store";
import { toMarkdown, downloadText, buildShareUrl } from "../board/io";
import { STATUS_META, STATUS_ORDER, type Theme, type ViewFilter } from "../board/types";
import { BoardSwitcher } from "./BoardSwitcher";

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
  const { board, dispatch, canUndo, canRedo, saved } = useBoard();
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

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(board, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "block-board.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    try {
      const parsed = parseImported(JSON.parse(await file.text()));
      if (!parsed) {
        alert("That file isn't a valid block-board export.");
        return;
      }
      dispatch({ type: "import", board: parsed });
    } catch {
      alert("Could not read that file as JSON.");
    }
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

  const exportPng = async () => {
    const vp = document.querySelector<HTMLElement>(".react-flow__viewport");
    if (!vp) return;
    try {
      const { toPng } = await import("html-to-image");
      const bg = getComputedStyle(document.body).backgroundColor || "#0b0f17";
      const dataUrl = await toPng(vp, { backgroundColor: bg, pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "block-board.png";
      a.click();
    } catch {
      alert("Could not render the board to an image.");
    }
  };

  const copyShareLink = async () => {
    const url = buildShareUrl(board);
    if (!url) {
      alert("This board is too large to share via link — use Export instead.");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      alert("Share link copied to clipboard.");
    } catch {
      prompt("Copy this share link:", url);
    }
  };

  const filterActive = !!filter.status || !!filter.tag;
  const [menuOpen, setMenuOpen] = useState(false);
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
    </header>
  );
}

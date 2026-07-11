import { useEffect, useMemo, useRef, useState } from "react";
import { useBoard } from "../board/store";
import { exportJson, importJsonFile, exportPng, copyShareLink } from "../board/exportShared";
import type { Theme, WhiteboardBoard } from "../board/types";
import { BoardSwitcher } from "./BoardSwitcher";
import { SettingsPanel } from "./SettingsPanel";

export function WhiteboardToolbar({
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
  // WhiteboardToolbar is only ever mounted for whiteboard boards (App.tsx branches by board.kind).
  const { board: rawBoard, dispatch, canUndo, canRedo, saved } = useBoard();
  const board = rawBoard as WhiteboardBoard;
  const fileRef = useRef<HTMLInputElement>(null);

  const memberNames = useMemo(() => (board.members ?? []).map((m) => m.name), [board]);
  const [meDraft, setMeDraft] = useState(me);
  const commitMe = () => {
    const v = meDraft.trim();
    setMe(v);
    if (v) dispatch({ type: "addMember", name: v });
  };

  const importJson = async (file: File) => {
    const parsed = await importJsonFile(file);
    if (!parsed) {
      alert("That file isn't a valid block-board export.");
      return;
    }
    dispatch({ type: "import", board: parsed });
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

      <div className="spacer" />
      <div className="identity" title="Your name — used for Owner attribution & presence">
        <span className="id-label">You</span>
        <input
          className="detail-input id-input"
          list="bb-members-wb"
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
        <datalist id="bb-members-wb">
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
      <div className="menu" ref={menuRef}>
        <button className="tbtn" onClick={() => setMenuOpen((o) => !o)} title="More actions">
          More ▾
        </button>
        {menuOpen && (
          <div className="menu-list" role="menu">
            <button
              className="menu-item"
              onClick={() => {
                copyShareLink(board);
                setMenuOpen(false);
              }}
            >
              Export as link
            </button>
            <div className="menu-sep" />
            <button
              className="menu-item"
              onClick={() => {
                exportJson(board);
                setMenuOpen(false);
              }}
            >
              Export JSON
            </button>
            <button
              className="menu-item"
              onClick={() => {
                exportPng();
                setMenuOpen(false);
              }}
            >
              Export PNG
            </button>
            <button
              className="menu-item"
              onClick={() => {
                fileRef.current?.click();
                setMenuOpen(false);
              }}
            >
              Import JSON…
            </button>
            <div className="menu-sep" />
            <button
              className="menu-item"
              onClick={() => {
                setSettingsOpen(true);
                setMenuOpen(false);
              }}
            >
              ⚙ Settings
            </button>
            <div className="menu-sep" />
            <button
              className="menu-item danger"
              onClick={() => {
                if (confirm("Reset the board to blank?")) dispatch({ type: "reset" });
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
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </header>
  );
}

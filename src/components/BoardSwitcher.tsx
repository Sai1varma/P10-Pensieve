import { useEffect, useRef, useState } from "react";
import { useBoard } from "../board/store";
import type { BoardIndexEntry, ID } from "../board/types";

type ModalState =
  | { kind: "new" }
  | { kind: "rename"; id: ID; value: string }
  | { kind: "delete"; id: ID; name: string; hasCloud: boolean }
  | null;

const STATUS_LABEL: Record<BoardIndexEntry["cloudStatus"], string> = {
  local: "Local only",
  draft: "Synced (draft, not shared)",
  live: "Live — shared",
};

/** Toolbar dropdown for switching between boards, plus new/rename/duplicate/delete. */
export function BoardSwitcher() {
  const { boards, currentBoardId, switchBoard, createBoard, renameBoard, duplicateBoard, deleteBoard } =
    useBoard();
  const current = boards.find((b) => b.id === currentBoardId);
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const sorted = [...boards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <>
      <div className="menu board-switcher" ref={ref}>
        <button className="tbtn" onClick={() => setOpen((o) => !o)} title="Switch boards">
          {current?.name ?? "Board"} ▾
        </button>
        {open && (
          <div className="menu-list board-menu-list" role="menu">
            {sorted.map((b) => (
              <div key={b.id} className={`board-row${b.id === currentBoardId ? " active" : ""}`}>
                <button
                  className="board-row-name"
                  onClick={() => {
                    switchBoard(b.id);
                    setOpen(false);
                  }}
                  title={STATUS_LABEL[b.cloudStatus]}
                >
                  <span className={`board-status-dot ${b.cloudStatus}`} />
                  {b.name}
                </button>
                <div className="board-row-actions">
                  <button
                    title="Rename"
                    onClick={() => setModal({ kind: "rename", id: b.id, value: b.name })}
                  >
                    ✎
                  </button>
                  <button title="Duplicate" onClick={() => duplicateBoard(b.id)}>
                    ⧉
                  </button>
                  <button
                    title="Delete"
                    className="danger"
                    onClick={() =>
                      setModal({ kind: "delete", id: b.id, name: b.name, hasCloud: b.cloudStatus !== "local" })
                    }
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
            <div className="menu-sep" />
            <button
              className="menu-item"
              onClick={() => {
                setModal({ kind: "new" });
                setOpen(false);
              }}
            >
              + New board
            </button>
          </div>
        )}
      </div>

      {modal?.kind === "new" && (
        <NewBoardModal onCreate={(name) => createBoard(name)} onClose={() => setModal(null)} />
      )}
      {modal?.kind === "rename" && (
        <RenameBoardModal
          initial={modal.value}
          onRename={(name) => renameBoard(modal.id, name)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "delete" && (
        <DeleteBoardModal
          name={modal.name}
          hasCloud={modal.hasCloud}
          onRemove={() => deleteBoard(modal.id, { alsoDeleteShared: false })}
          onDeleteShared={() => deleteBoard(modal.id, { alsoDeleteShared: true })}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

function NewBoardModal({ onCreate, onClose }: { onCreate: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const submit = () => {
    if (!name.trim()) return;
    onCreate(name.trim());
    onClose();
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="New board" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} title="Close">
          ×
        </button>
        <h2 className="modal-title">New board</h2>
        <input
          className="detail-input modal-input"
          placeholder="Board name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          autoFocus
        />
        <button className="tbtn modal-send" disabled={!name.trim()} onClick={submit}>
          Create
        </button>
      </div>
    </div>
  );
}

function RenameBoardModal({
  initial,
  onRename,
  onClose,
}: {
  initial: string;
  onRename: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const submit = () => {
    if (!name.trim()) return;
    onRename(name.trim());
    onClose();
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Rename board" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} title="Close">
          ×
        </button>
        <h2 className="modal-title">Rename board</h2>
        <input
          className="detail-input modal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          autoFocus
        />
        <button className="tbtn modal-send" disabled={!name.trim()} onClick={submit}>
          Rename
        </button>
      </div>
    </div>
  );
}

function DeleteBoardModal({
  name,
  hasCloud,
  onRemove,
  onDeleteShared,
  onClose,
}: {
  name: string;
  hasCloud: boolean;
  onRemove: () => void;
  onDeleteShared: () => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Delete board" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} title="Close">
          ×
        </button>
        <h2 className="modal-title">Delete "{name}"</h2>
        <p className="modal-body">
          Removes this board from your list
          {hasCloud ? ". Anyone with the link (or your other signed-in devices) can still find it." : "."}
        </p>
        <button
          className="tbtn modal-send"
          onClick={() => {
            onRemove();
            onClose();
          }}
        >
          Remove from my list
        </button>
        {hasCloud && (
          <>
            <p className="modal-body">Or permanently delete the shared copy — breaks the link for everyone.</p>
            <button
              className="tbtn modal-send danger"
              onClick={() => {
                onDeleteShared();
                onClose();
              }}
            >
              Also delete shared copy
            </button>
          </>
        )}
      </div>
    </div>
  );
}

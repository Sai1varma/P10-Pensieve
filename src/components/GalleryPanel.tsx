import { useState } from "react";
import { isValidBoard, useBoard } from "../board/store";
import { useGallery, fetchBoardContent, type GalleryEntry } from "../collab/gallery";
import { AuthGate } from "./AuthGate";

/** Org-wide gallery (item 9): browse boards other People10 members have
 *  published. Opening one is always read-only (reuses item 3's view-only
 *  share link, in a new tab so browsing doesn't disturb your active board);
 *  "Duplicate" is the only way to get an editable copy of your own. */
export function GalleryPanel({ onClose }: { onClose: () => void }) {
  const { entries, loading, signedIn, refresh } = useGallery();
  const { importAsNewBoard } = useBoard();
  const [showGate, setShowGate] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const openReadOnly = (id: string) => {
    const url = new URL(location.href);
    url.searchParams.set("board", id);
    url.searchParams.set("view", "1");
    window.open(url.toString(), "_blank", "noopener");
  };

  const duplicate = async (entry: GalleryEntry) => {
    setDuplicatingId(entry.id);
    const content = await fetchBoardContent(entry.id);
    setDuplicatingId(null);
    if (!isValidBoard(content)) {
      alert("Could not load that board — it may have been unpublished.");
      return;
    }
    importAsNewBoard(content, `${entry.name} copy`);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal insights-modal"
        role="dialog"
        aria-label="Gallery"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} title="Close">
          ×
        </button>
        <h2 className="modal-title">Gallery</h2>
        <p className="modal-body">
          Boards published by anyone at People10 — browse for inspiration, or duplicate one into your
          own boards.
        </p>

        {!signedIn && (
          <>
            <p className="modal-body">Sign in to browse the gallery.</p>
            <button className="tbtn modal-send" onClick={() => setShowGate(true)}>
              Sign in
            </button>
          </>
        )}

        {signedIn && loading && entries.length === 0 && <p className="empty">Loading…</p>}
        {signedIn && !loading && entries.length === 0 && <p className="empty">Nothing published yet.</p>}

        {signedIn && entries.length > 0 && (
          <div className="insights-list">
            {entries.map((e) => (
              <div key={e.id} className="insights-row">
                <span className="insights-row-text" title={e.ownerEmail ?? undefined}>
                  <strong>{e.name}</strong>
                  {e.kind === "whiteboard" && <span className="board-kind-badge">Whiteboard</span>}
                  {" — "}
                  {e.ownerEmail ?? "Unknown"}
                </span>
                <button className="tbtn" onClick={() => openReadOnly(e.id)} title="Open read-only in a new tab">
                  Open
                </button>
                <button
                  className="tbtn"
                  onClick={() => duplicate(e)}
                  disabled={duplicatingId === e.id}
                  title="Copy into your own boards"
                >
                  {duplicatingId === e.id ? "Copying…" : "Duplicate"}
                </button>
              </div>
            ))}
          </div>
        )}

        {signedIn && (
          <button className="tbtn modal-send" onClick={refresh} style={{ marginTop: 14 }}>
            Refresh
          </button>
        )}
      </div>
      {showGate && <AuthGate onClose={() => setShowGate(false)} />}
    </div>
  );
}

import { useState } from "react";
import type { CollabState } from "../collab/useCollab";
import { AuthGate } from "./AuthGate";
import { ActivityLogPanel } from "./ActivityLogPanel";

/** Floating chip showing collaboration + auth status. Hidden entirely when
 *  Supabase isn't configured. `collab` is lifted to AppShell (rather than
 *  called here) so Canvas can also read its focusByNode for presence
 *  indicators, without opening a second realtime channel. */
export function CollabBar({ collab }: { collab: CollabState }) {
  const { status, peers, peerNames, boardId, email, goLive, leave, signOut } = collab;
  const [showGate, setShowGate] = useState(false);
  const [showActivity, setShowActivity] = useState(false);

  if (status === "off") return null;

  const signedIn = !!email;

  return (
    <div className="collab-bar">
      {status === "needs-auth" && (
        <button className="tbtn" onClick={() => setShowGate(true)} title="Sign in to open the shared board">
          Sign in to collaborate
        </button>
      )}

      {status === "local" &&
        (signedIn ? (
          <>
            <button className="tbtn" onClick={goLive} title="Create a shared, live-synced board">
              ● Go live
            </button>
            <span className="collab-chip" title={email ?? undefined}>
              {email}
            </span>
            <button className="tbtn" onClick={signOut} title="Sign out">
              Sign out
            </button>
          </>
        ) : (
          <button className="tbtn" onClick={() => setShowGate(true)} title="Sign in to collaborate">
            ● Go live
          </button>
        ))}

      {status === "connecting" && <span className="collab-chip">Connecting…</span>}
      {status === "error" && <span className="collab-chip error">Connection error</span>}

      {status === "live" && (
        <>
          <span className="collab-chip live" title={peerNames.join(", ")}>
            <span className="live-dot" /> Live · {peers} online
            {peerNames.length > 0 && <span className="collab-names">· {peerNames.join(", ")}</span>}
          </span>
          <button className="tbtn" onClick={() => setShowActivity(true)} title="Who changed what, when">
            Activity
          </button>
          <button className="tbtn" onClick={leave} title="Stop syncing on this device">
            Leave
          </button>
          <button className="tbtn" onClick={signOut} title="Sign out">
            Sign out
          </button>
        </>
      )}

      {showGate && <AuthGate onClose={() => setShowGate(false)} />}
      {showActivity && boardId && (
        <ActivityLogPanel boardId={boardId} onClose={() => setShowActivity(false)} />
      )}
    </div>
  );
}

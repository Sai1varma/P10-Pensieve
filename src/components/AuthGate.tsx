import { useState } from "react";
import { sendMagicLink } from "../collab/auth";

const ALLOWED_DOMAIN = "people10.com";

/** Modal that sends a passwordless magic-link. Shown when the user tries to
 *  collaborate without a session. Restricted to @people10.com emails (the real
 *  enforcement is server-side via RLS; this is a fast, friendly pre-check). */
export function AuthGate({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const send = async () => {
    const e = email.trim().toLowerCase();
    if (!e) return;
    if (!e.endsWith(`@${ALLOWED_DOMAIN}`)) {
      setError(`Only @${ALLOWED_DOMAIN} email addresses can collaborate.`);
      setStatus("error");
      return;
    }
    setStatus("sending");
    try {
      await sendMagicLink(e);
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the link.");
      setStatus("error");
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Sign in" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} title="Close">
          ×
        </button>
        <h2 className="modal-title">Sign in to collaborate</h2>
        {status === "sent" ? (
          <p className="modal-body">
            Check <strong>{email}</strong> for a sign-in link, then open it in this browser.
          </p>
        ) : (
          <>
            <p className="modal-body">
              Live collaboration is limited to People10. Enter your <strong>@{ALLOWED_DOMAIN}</strong> email
              and we'll send a one-time sign-in link — no password.
            </p>
            <input
              className="detail-input modal-input"
              type="email"
              placeholder="you@people10.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              autoFocus
            />
            {status === "error" && <p className="modal-error">{error}</p>}
            <button className="tbtn modal-send" onClick={send} disabled={status === "sending"}>
              {status === "sending" ? "Sending…" : "Send magic link"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
